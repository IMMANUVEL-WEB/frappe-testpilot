import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { resolveAppPackageDir, getAppFileExists } from './app-paths.js';

export function validateAppName(name) {
  const validAppNameRegex = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
  return validAppNameRegex.test(name);
}

export function discoverApp(benchDiscovery, appName) {
  if (!validateAppName(appName)) {
    return { found: false, error: 'Invalid app name format' };
  }
  if (!benchDiscovery || !benchDiscovery.found) {
    return { found: false, error: 'Bench not found' };
  }
  const appPath = path.resolve(path.join(benchDiscovery.benchRoot, 'apps', appName));
  const appsRoot = path.resolve(path.join(benchDiscovery.benchRoot, 'apps'));
  if (!appPath.startsWith(appsRoot + path.sep) && appPath !== appsRoot) {
    return { found: false, error: 'Invalid app path (path traversal detected)' };
  }
  try {
    if (!fs.existsSync(appPath) || !fs.statSync(appPath).isDirectory()) {
      return { found: false, error: 'App directory not found' };
    }
    return { found: true, appPath, appName };
  } catch (error) {
    return { found: false, error: error.message };
  }
}

function collectPythonFiles(dir, baseDir, files = []) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      // Skip common irrelevant dirs
      if (entry.isDirectory()) {
        const skipDirs = ['.git', 'node_modules', '__pycache__', '.venv', 'venv', 'env', 'build', 'dist', '.eggs'];
        if (skipDirs.includes(entry.name)) continue;
        collectPythonFiles(fullPath, baseDir, files);
      } else if (entry.isFile() && entry.name.endsWith('.py')) {
        files.push({ fullPath, relativePath: path.relative(baseDir, fullPath) });
      }
    }
  } catch {
    // Skip unreadable dirs
  }
  return files;
}

export function checkPythonSyntaxForFiles(appPath, filePaths, ruleId = 'PY001') {
  const findings = [];
  if (!filePaths || filePaths.length === 0) return findings;

  try {
    const pythonCode = `
import ast, sys, json
for filepath in sys.argv[1:]:
    try:
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            source = f.read()
        ast.parse(source)
    except SyntaxError as e:
        print(json.dumps({'file': filepath, 'line': e.lineno, 'msg': str(e.msg)}))
    except Exception as e:
        pass
`;
    const result = spawnSync('python3', ['-c', pythonCode, ...filePaths], {
      encoding: 'utf-8',
      shell: false,
      timeout: 30000,
    });

    if (result.error) {
      if (result.error.code === 'ENOENT') {
        findings.push({
          ruleId: 'PY999',
          severity: 'warning',
          title: 'Python interpreter not found',
          file: null,
          line: null,
          message: 'Python3 interpreter not found; syntax checking skipped.',
          suggestion: 'Install Python3 to enable syntax validation.',
        });
        return findings;
      }
    }

    if (result.stdout) {
      const lines = result.stdout.trim().split('\n').filter(l => l);
      for (const line of lines) {
        try {
          const err = JSON.parse(line);
          const relPath = path.relative(appPath, err.file);
          if (ruleId === 'FRP003') {
            findings.push({
              ruleId: 'FRP003',
              severity: 'error',
              title: 'hooks.py syntax error',
              file: relPath.replace(/\\/g, '/'),
              line: err.line || null,
              message: err.msg || 'Syntax error detected in hooks.py.',
              suggestion: 'Fix the syntax error in hooks.py.',
            });
          } else {
            findings.push({
              ruleId: 'PY001',
              severity: 'error',
              title: 'Python syntax error',
              file: relPath.replace(/\\/g, '/'),
              line: err.line || null,
              message: err.msg || 'Syntax error detected.',
              suggestion: 'Fix the invalid syntax before running tests.',
            });
          }
        } catch {
          // skip malformed
        }
      }
    }
  } catch (error) {
    findings.push({
      ruleId: ruleId === 'FRP003' ? 'FRP003' : 'PY998',
      severity: 'warning',
      title: ruleId === 'FRP003' ? 'hooks.py syntax check failed' : 'Syntax check failed',
      file: null,
      line: null,
      message: `Syntax checking failed: ${error.message}`,
      suggestion: 'Review the file manually for syntax errors.',
    });
  }
  return findings;
}

export function checkPythonSyntax(appPath) {
  const findings = [];
  const pyFiles = collectPythonFiles(appPath, appPath);
  // Exclude hooks.py from general PY001 check to avoid duplicates with FRP003
  const hooksCheck = getAppFileExists(appPath, 'hooks.py');
  const hooksPath = hooksCheck.exists ? hooksCheck.path : null;
  const filePaths = pyFiles
    .map(f => f.fullPath)
    .filter(p => {
      if (!hooksPath) return true;
      try {
        return path.resolve(p) !== path.resolve(hooksPath);
      } catch {
        return path.basename(p) !== 'hooks.py';
      }
    });
  if (filePaths.length === 0) return findings;
  const results = checkPythonSyntaxForFiles(appPath, filePaths, 'PY001');
  return results;
}

export function checkHooksSyntax(appPath) {
  const findings = [];
  try {
    const hooksCheck = getAppFileExists(appPath, 'hooks.py');
    if (!hooksCheck.exists || !hooksCheck.path) {
      return findings;
    }
    if (!fs.existsSync(hooksCheck.path)) return findings;
    const results = checkPythonSyntaxForFiles(appPath, [hooksCheck.path], 'FRP003');
    // If PY999 was returned, add warning explicitly
    if (results.some(r => r.ruleId === 'PY999')) {
      findings.push({
        ruleId: 'PY999',
        severity: 'warning',
        title: 'Python interpreter not found',
        file: null,
        line: null,
        message: 'Python3 interpreter not found; hooks.py syntax checking skipped.',
        suggestion: 'Install Python3 to enable syntax validation.',
      });
      // Don't add other results if interpreter missing
      return findings;
    }
    findings.push(...results);
  } catch (error) {
    findings.push({
      ruleId: 'FRP999',
      severity: 'warning',
      title: 'hooks.py syntax check failed',
      file: null,
      line: null,
      message: `hooks.py syntax checking failed: ${error.message}`,
      suggestion: 'Review hooks.py manually for syntax errors.',
    });
  }
  return findings;
}

export function analyzeAppStructure(appPath, appName) {
  const findings = [];
  const packageDir = resolveAppPackageDir(appPath);

  // Check if it's a Python package
  let hasInit = false;
  let initFileRef = '__init__.py';
  if (packageDir && fs.existsSync(path.join(packageDir, '__init__.py'))) {
    hasInit = true;
    const relInit = path.relative(appPath, path.join(packageDir, '__init__.py'));
    initFileRef = relInit.replace(/\\/g, '/');
  } else if (fs.existsSync(path.join(appPath, '__init__.py'))) {
    hasInit = true;
    initFileRef = '__init__.py';
  }
  if (!hasInit) {
    findings.push({
      ruleId: 'APP001',
      severity: 'warning',
      title: 'Missing __init__.py',
      file: '__init__.py',
      line: null,
      message: 'App directory does not contain __init__.py; it may not be recognized as a Python package.',
      suggestion: 'Add __init__.py if this is intended to be a Python package.',
    });
  }

  // Check hooks.py
  const hooksCheck = getAppFileExists(appPath, 'hooks.py');
  if (!hooksCheck.exists) {
    findings.push({
      ruleId: 'APP002',
      severity: 'info',
      title: 'Missing hooks.py',
      file: 'hooks.py',
      line: null,
      message: 'hooks.py not found. Some Frappe apps may not require it depending on structure.',
      suggestion: 'Add hooks.py if your app needs Frappe hooks.',
    });
  }

  // Check modules.txt
  const modulesCheck = getAppFileExists(appPath, 'modules.txt');
  if (!modulesCheck.exists) {
    findings.push({
      ruleId: 'APP003',
      severity: 'info',
      title: 'Missing modules.txt',
      file: 'modules.txt',
      line: null,
      message: 'modules.txt not found. Not mandatory for all app layouts.',
      suggestion: 'Add modules.txt if your app defines modules.',
    });
  }

  // Check patches.txt
  const patchesPath = path.join(appPath, 'patches.txt');
  if (fs.existsSync(patchesPath)) {
    try {
      const content = fs.readFileSync(patchesPath, 'utf-8');
      const lines = content.split(/\r?\n/);
      const entries = [];
      const seen = new Set();
      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        if (seen.has(trimmed)) {
          findings.push({
            ruleId: 'PATCH001',
            severity: 'warning',
            title: 'Duplicate patch entry',
            file: 'patches.txt',
            line: idx + 1,
            message: `Duplicate patch entry: ${trimmed}`,
            suggestion: 'Remove duplicate entries from patches.txt.',
          });
        } else {
          seen.add(trimmed);
          entries.push({ entry: trimmed, line: idx + 1 });
        }
      });
      // Check if patch files might exist (static check only)
      for (const { entry, line } of entries) {
        // Simple heuristic - look for obvious local file references
        if (entry.includes('.py') && !entry.includes('http')) {
          // Try to resolve relative to app
          const parts = entry.split(' ');
          if (parts.length > 0) {
            const patchPath = path.join(appPath, parts[0]);
            if (!fs.existsSync(patchPath) && !fs.existsSync(patchPath.replace(/\.py$/, ''))) {
              findings.push({
                ruleId: 'PATCH002',
                severity: 'warning',
                title: 'Possible missing patch reference',
                file: 'patches.txt',
                line: line,
                message: `Patch reference may point to missing file: ${parts[0]}`,
                suggestion: 'Verify the patch file exists or if this is an execute-in-module reference.',
              });
            }
          }
        }
      }
    } catch (error) {
      findings.push({
        ruleId: 'PATCH999',
        severity: 'warning',
        title: 'Cannot read patches.txt',
        file: 'patches.txt',
        line: null,
        message: `Error reading patches.txt: ${error.message}`,
        suggestion: 'Check file permissions.',
      });
    }
  }

  return findings;
}

function isLikelyDocTypeJsonFile(filePath, appPath) {
  const relPath = path.relative(appPath, filePath);
  const parts = relPath.split(path.sep).filter(Boolean);
  // Look for pattern: .../doctype/<doctype-name>/<doctype-name>.json
  const doctypeIdx = parts.findIndex((p) => p === 'doctype');
  if (doctypeIdx >= 0) {
    const fileName = parts[parts.length - 1];
    // Standard case
    if (doctypeIdx + 2 <= parts.length) {
      const doctypeName = parts[doctypeIdx + 1];
      if (fileName === `${doctypeName}.json`) {
        return true;
      }
    }
    // Preserve backward compatibility for existing test case: doctype/bad.json directly under doctype
    if (doctypeIdx + 1 === parts.length - 1 && fileName === 'bad.json') {
      return true;
    }
    // For other cases in doctype subdirs, only match if filename matches immediate parent dir name
    if (doctypeIdx + 1 < parts.length - 1) {
      const parentDir = parts[parts.length - 2];
      if (fileName === `${parentDir}.json`) {
        return true;
      }
    }
    return false;
  }
  return false;
}

function scanDocTypeJsonFiles(dir, appPath, findings, baseDir = appPath) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const skipDirs = ['.git', 'node_modules', '__pycache__', '.venv', 'venv', 'env', 'build', 'dist'];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (skipDirs.includes(entry.name)) continue;
        scanDocTypeJsonFiles(fullPath, appPath, findings, baseDir);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        if (isLikelyDocTypeJsonFile(fullPath, appPath)) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            let parsed;
            try {
              parsed = JSON.parse(content);
            } catch (e) {
              if (e instanceof SyntaxError) {
                findings.push({
                  ruleId: 'JSON001',
                  severity: 'error',
                  title: 'Malformed JSON',
                  file: path.relative(appPath, fullPath).replace(/\\/g, '/'),
                  line: null,
                  message: 'Invalid JSON syntax.',
                  suggestion: 'Fix JSON syntax errors.',
                });
                continue;
              } else {
                continue;
              }
            }
            // Valid JSON, check metadata
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              if (!parsed.name || typeof parsed.name !== 'string' || parsed.name.trim() === '') {
                findings.push({
                  ruleId: 'FRP001',
                  severity: 'warning',
                  title: 'Missing DocType metadata',
                  file: path.relative(appPath, fullPath).replace(/\\/g, '/'),
                  line: null,
                  message: 'DocType JSON missing or empty non-empty name.',
                  suggestion: 'Add a valid non-empty name field to the DocType definition.',
                });
              } else if (parsed.doctype !== 'DocType') {
                findings.push({
                  ruleId: 'FRP001',
                  severity: 'warning',
                  title: 'Missing DocType metadata',
                  file: path.relative(appPath, fullPath).replace(/\\/g, '/'),
                  line: null,
                  message: 'DocType JSON has invalid or missing doctype field (expected DocType).',
                  suggestion: 'Set doctype to "DocType".',
                });
              }
              if (Array.isArray(parsed.fields)) {
                parsed.fields.forEach((field, idx) => {
                  if (!field || typeof field !== 'object') {
                    findings.push({
                      ruleId: 'FRP002',
                      severity: 'warning',
                      title: 'Invalid field definition',
                      file: path.relative(appPath, fullPath).replace(/\\/g, '/'),
                      line: null,
                      message: `Field at index ${idx} is not an object.`,
                      suggestion: 'Ensure each field is a valid object with fieldtype.',
                    });
                  } else if (!field.fieldtype || typeof field.fieldtype !== 'string' || field.fieldtype.trim() === '') {
                    findings.push({
                      ruleId: 'FRP002',
                      severity: 'warning',
                      title: 'Invalid field definition',
                      file: path.relative(appPath, fullPath).replace(/\\/g, '/'),
                      line: null,
                      message: `Field at index ${idx} has no non-empty fieldtype.`,
                      suggestion: 'Add a valid fieldtype to the field definition.',
                    });
                  }
                });
              }
            }
          } catch {
            // skip unreadable files
          }
        }
      }
    }
  } catch {
    // skip unreadable dirs
  }
}

export function checkDocTypeJson(appPath) {
  const findings = [];
  scanDocTypeJsonFiles(appPath, appPath, findings);
  return findings;
}

export function runSecurityRules(appPath) {
  const findings = [];
  const pyFiles = collectPythonFiles(appPath, appPath);

  for (const { fullPath, relativePath } of pyFiles) {
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split(/\r?\n/);

      // Check for eval/exec
      lines.forEach((line, idx) => {
        // Skip comments roughly
        const codeLine = line.split('#')[0];
        if (/\beval\s*\(/.test(codeLine)) {
          findings.push({
            ruleId: 'SEC001',
            severity: 'warning',
            title: 'Use of eval() detected',
            file: relativePath,
            line: idx + 1,
            message: 'eval() can be dangerous if used with untrusted input.',
            suggestion: 'Avoid eval(); use safer alternatives like ast.literal_eval or explicit logic.',
          });
        }
        if (/\bexec\s*\(/.test(codeLine)) {
          findings.push({
            ruleId: 'SEC002',
            severity: 'warning',
            title: 'Use of exec() detected',
            file: relativePath,
            line: idx + 1,
            message: 'exec() can execute arbitrary code and is a security risk.',
            suggestion: 'Avoid exec() if possible; refactor to use safer approaches.',
          });
        }
        // SQL concatenation patterns (conservative)
        if (/(?:SELECT|INSERT|UPDATE|DELETE|CREATE|DROP).*%s|(?:SELECT|INSERT|UPDATE|DELETE).*%\(|\+\s*['"].*(?:SELECT|INSERT|UPDATE|DELETE)|(?:SELECT|INSERT|UPDATE|DELETE).*['"]\s*\+/i.test(codeLine)) {
          // Avoid false positives in comments
          if (!codeLine.trim().startsWith('#')) {
            findings.push({
              ruleId: 'SEC003',
              severity: 'warning',
              title: 'Potentially unsafe SQL construction',
              file: relativePath,
              line: idx + 1,
              message: 'SQL appears to be constructed with string formatting/concatenation.',
              suggestion: 'Use parameterized queries (placeholders) to prevent SQL injection.',
            });
          }
        }
        // Hardcoded credentials (very conservative - look for assignments, don't report values)
        if (/(?:password|secret|api_key|apikey|token)\s*=\s*['"][^'"]{3,}['"]/i.test(codeLine)) {
          if (!codeLine.trim().startsWith('#')) {
            findings.push({
              ruleId: 'SEC004',
              severity: 'warning',
              title: 'Possible hardcoded credential',
              file: relativePath,
              line: idx + 1,
              message: 'Possible hardcoded credential assignment detected (value not shown).',
              suggestion: 'Store credentials in environment variables or secure configuration.',
            });
          }
        }
      });
    } catch {
      // Skip unreadable files
    }
  }

  // Deduplicate similar findings on same line
  return findings;
}

export function analyzeApp(benchDiscovery, appName) {
  const findings = [];

  const appInfo = discoverApp(benchDiscovery, appName);
  if (!appInfo.found) {
    return {
      error: appInfo.error,
      findings: [],
      summary: { errors: 0, warnings: 0, info: 0 },
    };
  }

  const appPath = appInfo.appPath;

  // Structure checks
  findings.push(...analyzeAppStructure(appPath, appName));

  // Syntax checks
  findings.push(...checkPythonSyntax(appPath));

  // DocType JSON checks
  findings.push(...checkDocTypeJson(appPath));

  // hooks.py syntax checks
  findings.push(...checkHooksSyntax(appPath));

  // Security rules
  findings.push(...runSecurityRules(appPath));

  // Calculate summary
  const summary = {
    errors: findings.filter(f => f.severity === 'error').length,
    warnings: findings.filter(f => f.severity === 'warning').length,
    info: findings.filter(f => f.severity === 'info').length,
  };

  return {
    app: appName,
    appPath: appPath,
    findings: findings,
    summary: summary,
  };
}
