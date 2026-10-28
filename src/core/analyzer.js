import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

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

export function checkPythonSyntax(appPath) {
  const findings = [];
  const pyFiles = collectPythonFiles(appPath, appPath);

  // Try AST parsing approach (safer, no bytecode written)
  try {
    // Use node's vm module is not suitable; use Python AST via spawn but don't execute app code
    // Try python3 -m py_compile equivalent via ast module
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
    const filePaths = pyFiles.map(f => f.fullPath);
    if (filePaths.length === 0) return findings;

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
          findings.push({
            ruleId: 'PY001',
            severity: 'error',
            title: 'Python syntax error',
            file: relPath,
            line: err.line || null,
            message: err.msg || 'Syntax error detected.',
            suggestion: 'Fix the invalid syntax before running tests.',
          });
        } catch {
          // skip malformed
        }
      }
    }
  } catch (error) {
    findings.push({
      ruleId: 'PY998',
      severity: 'warning',
      title: 'Syntax check failed',
      file: null,
      line: null,
      message: `Syntax checking failed: ${error.message}`,
      suggestion: 'Review Python files manually for syntax errors.',
    });
  }
  return findings;
}

export function analyzeAppStructure(appPath, appName) {
  const findings = [];

  // Check if it's a Python package
  const initPath = path.join(appPath, '__init__.py');
  if (!fs.existsSync(initPath)) {
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
  const hooksPath = path.join(appPath, 'hooks.py');
  if (!fs.existsSync(hooksPath)) {
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
  const modulesPath = path.join(appPath, 'modules.txt');
  if (!fs.existsSync(modulesPath)) {
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

export function checkDocTypeJson(appPath) {
  const findings = [];
  try {
    const entries = fs.readdirSync(appPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subPath = path.join(appPath, entry.name);
        // Look for doctype folders
        try {
          const subEntries = fs.readdirSync(subPath);
          for (const subEntry of subEntries) {
            if (subEntry.endsWith('.json') && !subEntry.includes('desktop') && subEntry !== 'hooks.py') {
              // Check if it might be a doctype json
              const jsonPath = path.join(subPath, subEntry);
              try {
                const content = fs.readFileSync(jsonPath, 'utf-8');
                JSON.parse(content);
              } catch (e) {
                if (e instanceof SyntaxError) {
                  findings.push({
                    ruleId: 'JSON001',
                    severity: 'error',
                    title: 'Malformed JSON',
                    file: path.relative(appPath, jsonPath),
                    line: null,
                    message: 'Invalid JSON syntax.',
                    suggestion: 'Fix JSON syntax errors.',
                  });
                }
              }
            }
          }
        } catch {
          // skip
        }
      }
    }
  } catch {
    // skip
  }
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
