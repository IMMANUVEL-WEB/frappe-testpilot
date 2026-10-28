import fs from 'fs';
import path from 'path';

export function isPlausibleBenchRoot(dirPath) {
  try {
    const appsPath = path.join(dirPath, 'apps');
    const sitesPath = path.join(dirPath, 'sites');

    const appsExists = fs.existsSync(appsPath) && fs.statSync(appsPath).isDirectory();
    const sitesExists = fs.existsSync(sitesPath) && fs.statSync(sitesPath).isDirectory();

    return {
      isPlausible: appsExists && sitesExists,
      appsPath,
      sitesPath,
    };
  } catch {
    return {
      isPlausible: false,
      appsPath: path.join(dirPath, 'apps'),
      sitesPath: path.join(dirPath, 'sites'),
    };
  }
}

export function detectBenchRoot(cwd = process.cwd()) {
  try {
    const result = isPlausibleBenchRoot(cwd);
    return {
      cwd,
      isBenchRoot: result.isPlausible,
      appsPath: result.appsPath,
      sitesPath: result.sitesPath,
    };
  } catch (error) {
    throw error;
  }
}

export function discoverBench(startDir = process.cwd(), maxDepth = 100) {
  try {
    let currentDir = path.resolve(startDir);
    const root = path.parse(currentDir).root;
    let depth = 0;

    while (currentDir !== root && depth < maxDepth) {
      const result = isPlausibleBenchRoot(currentDir);
      if (result.isPlausible) {
        return {
          found: true,
          benchRoot: currentDir,
          appsPath: result.appsPath,
          sitesPath: result.sitesPath,
        };
      }
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        break;
      }
      currentDir = parentDir;
      depth++;
    }

    // Check root as well
    if (currentDir === root && depth < maxDepth) {
      const result = isPlausibleBenchRoot(currentDir);
      if (result.isPlausible) {
        return {
          found: true,
          benchRoot: currentDir,
          appsPath: result.appsPath,
          sitesPath: result.sitesPath,
        };
      }
    }

    return {
      found: false,
      benchRoot: null,
      appsPath: null,
      sitesPath: null,
    };
  } catch {
    return {
      found: false,
      benchRoot: null,
      appsPath: null,
      sitesPath: null,
    };
  }
}

export function getAppsFromTxt(sitesPath) {
  try {
    const appsTxtPath = path.join(sitesPath, 'apps.txt');
    if (!fs.existsSync(appsTxtPath)) {
      return { exists: false, apps: [] };
    }

    const content = fs.readFileSync(appsTxtPath, 'utf-8');
    const apps = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));

    // Deduplicate while preserving order
    const seen = new Set();
    const deduplicated = [];
    for (const app of apps) {
      if (!seen.has(app)) {
        seen.add(app);
        deduplicated.push(app);
      }
    }

    return { exists: true, apps: deduplicated };
  } catch (error) {
    throw error;
  }
}

export function isValidAppName(name) {
  // Basic validation - alphanumeric, underscores, hyphens
  const validAppNameRegex = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
  return validAppNameRegex.test(name);
}

export function inspectApp(benchRoot, appName) {
  const result = {
    name: appName,
    validName: isValidAppName(appName),
    hasDirectory: false,
    appPath: null,
    isPythonPackage: false,
    metadataFiles: [],
    warnings: [],
  };

  if (!result.validName) {
    result.warnings.push('Invalid app name format');
    return result;
  }

  const appPath = path.join(benchRoot, 'apps', appName);
  result.appPath = appPath;

  try {
    if (fs.existsSync(appPath) && fs.statSync(appPath).isDirectory()) {
      result.hasDirectory = true;

      // Check if it's a Python package (has __init__.py)
      if (fs.existsSync(path.join(appPath, '__init__.py'))) {
        result.isPythonPackage = true;
      }

      // Check for common metadata files
      const metadataCandidates = ['hooks.py', 'modules.txt', 'pyproject.toml', 'setup.py', 'setup.cfg'];
      for (const metaFile of metadataCandidates) {
        if (fs.existsSync(path.join(appPath, metaFile))) {
          result.metadataFiles.push(metaFile);
        }
      }

      if (!result.isPythonPackage && result.metadataFiles.length === 0) {
        result.warnings.push('App directory exists but appears to lack typical metadata files');
      }
    } else {
      result.warnings.push('App directory not found in apps/');
    }
  } catch (error) {
    result.warnings.push(`Error inspecting app: ${error.message}`);
  }

  return result;
}

export function getAppVersion(benchRoot, appName) {
  try {
    if (!isValidAppName(appName)) {
      return { version: 'unknown', source: null, note: 'Invalid app name' };
    }

    const appPath = path.join(benchRoot, 'apps', appName);
    if (!fs.existsSync(appPath) || !fs.statSync(appPath).isDirectory()) {
      return { version: 'unknown', source: null, note: 'App directory not found' };
    }

    // Try to get version from __init__.py
    const initPath = path.join(appPath, '__init__.py');
    if (fs.existsSync(initPath)) {
      try {
        const initContent = fs.readFileSync(initPath, 'utf-8');
        // Look for __version__ = "x.y.z" or __version__ = 'x.y.z'
        const versionMatch = initContent.match(/__version__\s*=\s*['"]([^'"]+)['"]/);
        if (versionMatch) {
          return { version: versionMatch[1], source: 'apps/' + appName + '/__init__.py', note: null };
        }
      } catch {
        // Ignore read errors
      }
    }

    // Try pyproject.toml
    const pyprojectPath = path.join(appPath, 'pyproject.toml');
    if (fs.existsSync(pyprojectPath)) {
      try {
        const pyprojectContent = fs.readFileSync(pyprojectPath, 'utf-8');
        const versionMatch = pyprojectContent.match(/version\s*=\s*['"]([^'"]+)['"]/);
        if (versionMatch) {
          return { version: versionMatch[1], source: 'apps/' + appName + '/pyproject.toml', note: null };
        }
      } catch {
        // Ignore read errors
      }
    }

    // Try setup.cfg
    const setupCfgPath = path.join(appPath, 'setup.cfg');
    if (fs.existsSync(setupCfgPath)) {
      try {
        const setupCfgContent = fs.readFileSync(setupCfgPath, 'utf-8');
        const versionMatch = setupCfgContent.match(/version\s*=\s*([^\s\n]+)/);
        if (versionMatch) {
          return { version: versionMatch[1].replace(/['"]/g, ''), source: 'apps/' + appName + '/setup.cfg', note: null };
        }
      } catch {
        // Ignore read errors
      }
    }

    return { version: 'unknown', source: null, note: 'No version metadata found in local source' };
  } catch {
    return { version: 'unknown', source: null, note: 'Error reading version' };
  }
}
