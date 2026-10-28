import fs from 'fs';
import path from 'path';

function isPythonPackageDir(dirPath) {
  try {
    if (!dirPath || !fs.existsSync(dirPath)) return false;
    if (!fs.statSync(dirPath).isDirectory()) return false;
    return fs.existsSync(path.join(dirPath, '__init__.py'));
  } catch {
    return false;
  }
}

export function resolveAppPackageDir(appRoot) {
  if (!appRoot) return null;
  try {
    // Flat layout
    if (isPythonPackageDir(appRoot)) {
      return appRoot;
    }
    // Look for nested package directories
    const entries = fs.readdirSync(appRoot, { withFileTypes: true });
    const candidates = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skipDirs = ['.git', 'node_modules', '__pycache__', '.venv', 'venv', 'env', 'build', 'dist', '.eggs', 'patches', 'public', 'templates', 'www', 'config', 'fixtures'];
      if (skipDirs.includes(entry.name)) continue;
      const candidatePath = path.join(appRoot, entry.name);
      if (isPythonPackageDir(candidatePath)) {
        candidates.push(candidatePath);
      }
    }
    if (candidates.length === 1) {
      return candidates[0];
    }
    if (candidates.length === 0) {
      return null;
    }
    // Multiple candidates - prefer one matching app name
    const appName = path.basename(appRoot);
    const matching = candidates.find((c) => path.basename(c) === appName);
    if (matching) return matching;
    // Otherwise return null if ambiguous
    return null;
  } catch {
    return null;
  }
}

export function getAppPackageInitPath(appRoot) {
  const pkgDir = resolveAppPackageDir(appRoot);
  if (!pkgDir) return null;
  const initPath = path.join(pkgDir, '__init__.py');
  return fs.existsSync(initPath) ? initPath : null;
}

export function getAppFilePath(appRoot, filename) {
  const pkgDir = resolveAppPackageDir(appRoot);
  if (pkgDir) {
    const pkgPath = path.join(pkgDir, filename);
    if (fs.existsSync(pkgPath)) return pkgPath;
  }
  // Also check root level (pyproject.toml, setup.py, setup.cfg often at root)
  const rootPath = path.join(appRoot, filename);
  if (fs.existsSync(rootPath)) return rootPath;
  return pkgDir ? path.join(pkgDir, filename) : rootPath;
}

export function getAppFileExists(appRoot, filename) {
  const pkgDir = resolveAppPackageDir(appRoot);
  if (pkgDir && fs.existsSync(path.join(pkgDir, filename))) {
    return { exists: true, path: path.join(pkgDir, filename), location: 'package' };
  }
  if (fs.existsSync(path.join(appRoot, filename))) {
    return { exists: true, path: path.join(appRoot, filename), location: 'root' };
  }
  return { exists: false, path: null, location: null };
}
