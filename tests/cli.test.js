import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CLI_PATH = path.resolve(process.cwd(), 'src/index.js');

function runCli(args = [], cwd = process.cwd()) {
  const result = spawnSync('node', [CLI_PATH, ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env },
  });
  return result;
}

describe('frappe-testpilot CLI', () => {
  it('should display help output', () => {
    const result = runCli(['--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage');
    expect(result.stdout).toContain('frappe-testpilot');
  });

  it('should display version output', () => {
    const result = runCli(['--version']);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('should detect a valid Bench root with apps/ and sites/', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-test-'));
    try {
      fs.mkdirSync(path.join(tmpDir, 'apps'));
      fs.mkdirSync(path.join(tmpDir, 'sites'));
      fs.mkdirSync(path.join(tmpDir, 'sites', 'assets'));
      fs.writeFileSync(
        path.join(tmpDir, 'sites', 'apps.txt'),
        'frappe\nerpnext\n'
      );

      const result = runCli(['check'], tmpDir);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Frappe TestPilot');
      expect(result.stdout).toContain('Discovered Frappe Bench root');
      expect(result.stdout).toContain('frappe');
      expect(result.stdout).toContain('erpnext');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should return nonzero exit code for invalid directory', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-invalid-'));
    try {
      const result = runCli(['check'], tmpDir);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Not a Frappe Bench root');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should warn when sites/apps.txt is missing in a Bench root', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-noconf-'));
    try {
      fs.mkdirSync(path.join(tmpDir, 'apps'));
      fs.mkdirSync(path.join(tmpDir, 'sites'));

      const result = runCli(['check'], tmpDir);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Discovered Frappe Bench root');
      expect(result.stdout).toContain('apps.txt');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('frappe-testpilot Phase 2 - Bench discovery', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-p2-'));
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should detect bench root from root directory', () => {
    fs.mkdirSync(path.join(tmpDir, 'apps'));
    fs.mkdirSync(path.join(tmpDir, 'sites'));
    const result = runCli(['check'], tmpDir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Discovered Frappe Bench root');
  });

  it('should discover bench from nested directory', () => {
    fs.mkdirSync(path.join(tmpDir, 'apps'));
    fs.mkdirSync(path.join(tmpDir, 'sites'));
    const nestedDir = path.join(tmpDir, 'apps', 'my_app');
    fs.mkdirSync(nestedDir, { recursive: true });
    const result = runCli(['check'], nestedDir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Discovered Frappe Bench root');
  });

  it('should not find bench when none exists', () => {
    const result = runCli(['check'], tmpDir);
    expect(result.status).not.toBe(0);
  });

  it('should handle missing sites/apps.txt', () => {
    fs.mkdirSync(path.join(tmpDir, 'apps'));
    fs.mkdirSync(path.join(tmpDir, 'sites'));
    const result = runCli(['inspect'], tmpDir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('sites/apps.txt exists: no');
  });

  it('should handle empty apps.txt', () => {
    fs.mkdirSync(path.join(tmpDir, 'apps'));
    fs.mkdirSync(path.join(tmpDir, 'sites'));
    fs.writeFileSync(path.join(tmpDir, 'sites', 'apps.txt'), '\n# comment\n\n');
    const result = runCli(['inspect'], tmpDir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Apps listed in sites/apps.txt: 0');
  });

  it('should handle duplicate app names', () => {
    fs.mkdirSync(path.join(tmpDir, 'apps'));
    fs.mkdirSync(path.join(tmpDir, 'sites'));
    fs.mkdirSync(path.join(tmpDir, 'apps', 'frappe'));
    fs.writeFileSync(path.join(tmpDir, 'sites', 'apps.txt'), 'frappe\nfrappe\nerpnext\n');
    const result = runCli(['inspect'], tmpDir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Apps listed in sites/apps.txt: 2');
  });

  it('should handle invalid app names', () => {
    fs.mkdirSync(path.join(tmpDir, 'apps'));
    fs.mkdirSync(path.join(tmpDir, 'sites'));
    fs.writeFileSync(path.join(tmpDir, 'sites', 'apps.txt'), '123invalid\nvalid_app\n');
    const result = runCli(['inspect'], tmpDir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('123invalid');
    expect(result.stdout).toContain('invalid format');
  });

  it('should report missing app directory', () => {
    fs.mkdirSync(path.join(tmpDir, 'apps'));
    fs.mkdirSync(path.join(tmpDir, 'sites'));
    fs.writeFileSync(path.join(tmpDir, 'sites', 'apps.txt'), 'missing_app\n');
    const result = runCli(['inspect'], tmpDir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('NOT FOUND in apps/');
  });

  it('should handle incomplete app metadata', () => {
    fs.mkdirSync(path.join(tmpDir, 'apps'));
    fs.mkdirSync(path.join(tmpDir, 'sites'));
    fs.mkdirSync(path.join(tmpDir, 'apps', 'myapp'));
    fs.writeFileSync(path.join(tmpDir, 'sites', 'apps.txt'), 'myapp\n');
    const result = runCli(['inspect'], tmpDir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('myapp');
    expect(result.stdout).toContain('Warning');
  });

  it('should report unknown framework version when missing', () => {
    fs.mkdirSync(path.join(tmpDir, 'apps'));
    fs.mkdirSync(path.join(tmpDir, 'sites'));
    fs.mkdirSync(path.join(tmpDir, 'apps', 'myapp'));
    fs.writeFileSync(path.join(tmpDir, 'apps', 'myapp', '__init__.py'), '# empty');
    fs.writeFileSync(path.join(tmpDir, 'sites', 'apps.txt'), 'myapp\n');
    const result = runCli(['inspect'], tmpDir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('unknown');
  });

  it('should produce valid JSON output', () => {
    fs.mkdirSync(path.join(tmpDir, 'apps'));
    fs.mkdirSync(path.join(tmpDir, 'sites'));
    fs.mkdirSync(path.join(tmpDir, 'apps', 'frappe'));
    fs.writeFileSync(path.join(tmpDir, 'apps', 'frappe', '__init__.py'), "__version__ = '15.0.0'\n");
    fs.writeFileSync(path.join(tmpDir, 'sites', 'apps.txt'), 'frappe\n');
    const result = runCli(['inspect', '--json'], tmpDir);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.benchRoot).toBe(tmpDir);
    expect(parsed.apps).toBeInstanceOf(Array);
    expect(parsed.apps[0].name).toBe('frappe');
    expect(parsed.apps[0].version).toBe('15.0.0');
  });

  it('should have no human readable noise in JSON stdout', () => {
    fs.mkdirSync(path.join(tmpDir, 'apps'));
    fs.mkdirSync(path.join(tmpDir, 'sites'));
    fs.writeFileSync(path.join(tmpDir, 'sites', 'apps.txt'), 'frappe\n');
    const result = runCli(['inspect', '--json'], tmpDir);
    expect(result.status).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
    expect(result.stdout.trim().startsWith('{')).toBe(true);
  });

  it('should find bench from deeply nested directory', () => {
    fs.mkdirSync(path.join(tmpDir, 'apps'));
    fs.mkdirSync(path.join(tmpDir, 'sites'));
    const deepDir = path.join(tmpDir, 'apps', 'myapp', 'myapp', 'doctype');
    fs.mkdirSync(deepDir, { recursive: true });
    const result = runCli(['inspect'], deepDir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Bench root');
  });
});

describe('frappe-testpilot Phase 3 - Test command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-p3-'));
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function setupBench() {
    fs.mkdirSync(path.join(tmpDir, 'apps'));
    fs.mkdirSync(path.join(tmpDir, 'sites'));
    fs.mkdirSync(path.join(tmpDir, 'apps', 'myapp'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'apps', 'myapp', '__init__.py'), "__version__ = '1.0.0'\n");
    fs.writeFileSync(path.join(tmpDir, 'sites', 'apps.txt'), 'myapp\n');
    fs.mkdirSync(path.join(tmpDir, 'sites', 'test_site.local'), { recursive: true });
  }

  it('test command appears in CLI help', () => {
    const result = runCli(['--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('test');
  });

  it('missing app argument is rejected', () => {
    setupBench();
    const result = runCli(['test', '--site', 'test_site.local'], tmpDir);
    expect(result.status).not.toBe(0);
  });

  it('missing --site is rejected', () => {
    setupBench();
    const result = runCli(['test', 'myapp'], tmpDir);
    expect(result.status).not.toBe(0);
  });

  it('invalid app names are rejected', () => {
    setupBench();
    const result = runCli(['test', '123invalid', '--site', 'test_site.local'], tmpDir);
    expect(result.status).not.toBe(0);
  });

  it('invalid site names are rejected', () => {
    setupBench();
    const result = runCli(['test', 'myapp', '--site', 'invalid_site'], tmpDir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('test_');
  });

  it('sites without test_ prefix are rejected', () => {
    setupBench();
    const result = runCli(['test', 'myapp', '--site', 'production_site'], tmpDir);
    expect(result.status).not.toBe(0);
  });

  it('missing bench root is handled', () => {
    const result = runCli(['test', 'myapp', '--site', 'test_site.local'], tmpDir);
    expect(result.status).not.toBe(0);
  });

  it('missing app directory is handled', () => {
    fs.mkdirSync(path.join(tmpDir, 'apps'));
    fs.mkdirSync(path.join(tmpDir, 'sites'));
    fs.writeFileSync(path.join(tmpDir, 'sites', 'apps.txt'), 'missingapp\n');
    fs.mkdirSync(path.join(tmpDir, 'sites', 'test_site.local'));
    const result = runCli(['test', 'missingapp', '--site', 'test_site.local'], tmpDir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('App directory not found');
  });

  it('apps absent from sites/apps.txt are rejected', () => {
    fs.mkdirSync(path.join(tmpDir, 'apps'));
    fs.mkdirSync(path.join(tmpDir, 'sites'));
    fs.mkdirSync(path.join(tmpDir, 'apps', 'myapp'));
    fs.writeFileSync(path.join(tmpDir, 'sites', 'apps.txt'), 'frappe\n');
    fs.mkdirSync(path.join(tmpDir, 'sites', 'test_site.local'));
    const result = runCli(['test', 'myapp', '--site', 'test_site.local'], tmpDir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('not found in sites/apps.txt');
  });

  it('missing site directory is handled', () => {
    setupBench();
    fs.rmSync(path.join(tmpDir, 'sites', 'test_site.local'), { recursive: true });
    const result = runCli(['test', 'myapp', '--site', 'test_site.local'], tmpDir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Site directory not found');
  });

  it('shell injection strings cannot execute additional commands', () => {
    setupBench();
    const result = runCli(['test', 'myapp; echo hacked', '--site', 'test_site.local'], tmpDir);
    expect(result.status).not.toBe(0);
  });

  it('testing disabled message in stdout is treated as failure with non-zero exit', () => {
    setupBench();
    // Create a fake bench script
    const benchPath = path.join(tmpDir, 'bench');
    fs.writeFileSync(benchPath, '#!/bin/sh\necho "Testing is disabled for the site!"\necho "You can enable tests by entering following command:"\necho "bench --site test_site.local set-config allow_tests true"\nexit 0\n');
    fs.chmodSync(benchPath, '755');
    const oldPath = process.env.PATH;
    process.env.PATH = tmpDir + ':' + oldPath;
    try {
      const result = runCli(['test', 'myapp', '--site', 'test_site.local'], tmpDir);
      expect(result.status).not.toBe(0);
      expect(result.stdout + result.stderr).toContain('Testing is disabled for the site');
    } finally {
      process.env.PATH = oldPath;
    }
  });

  it('testing disabled message in stderr is treated as failure', () => {
    setupBench();
    const benchPath = path.join(tmpDir, 'bench');
    fs.writeFileSync(benchPath, '#!/bin/sh\necho "Testing is disabled for the site!" >&2\nexit 0\n');
    fs.chmodSync(benchPath, '755');
    const oldPath = process.env.PATH;
    process.env.PATH = tmpDir + ':' + oldPath;
    try {
      const result = runCli(['test', 'myapp', '--site', 'test_site.local'], tmpDir);
      expect(result.status).not.toBe(0);
      expect(result.stdout + result.stderr).toContain('Testing is disabled for the site');
    } finally {
      process.env.PATH = oldPath;
    }
  });

  it('genuine successful test execution with exit 0 passes', () => {
    setupBench();
    const benchPath = path.join(tmpDir, 'bench');
    fs.writeFileSync(benchPath, '#!/bin/sh\necho "All tests passed"\nexit 0\n');
    fs.chmodSync(benchPath, '755');
    const oldPath = process.env.PATH;
    process.env.PATH = tmpDir + ':' + oldPath;
    try {
      const result = runCli(['test', 'myapp', '--site', 'test_site.local'], tmpDir);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('[PASS]');
    } finally {
      process.env.PATH = oldPath;
    }
  });

  it('non-zero process exit is reported as failure', () => {
    setupBench();
    const benchPath = path.join(tmpDir, 'bench');
    fs.writeFileSync(benchPath, '#!/bin/sh\necho "FAILED"\nexit 1\n');
    fs.chmodSync(benchPath, '755');
    const oldPath = process.env.PATH;
    process.env.PATH = tmpDir + ':' + oldPath;
    try {
      const result = runCli(['test', 'myapp', '--site', 'test_site.local'], tmpDir);
      expect(result.status).not.toBe(0);
      expect(result.stdout).toContain('[FAIL]');
    } finally {
      process.env.PATH = oldPath;
    }
  });

  it('json report represents disabled testing as failure', () => {
    setupBench();
    const benchPath = path.join(tmpDir, 'bench');
    fs.writeFileSync(benchPath, '#!/bin/sh\necho "Testing is disabled for the site!"\nexit 0\n');
    fs.chmodSync(benchPath, '755');
    const oldPath = process.env.PATH;
    process.env.PATH = tmpDir + ':' + oldPath;
    const reportPath = path.join(tmpDir, 'report.json');
    try {
      const result = runCli(['test', 'myapp', '--site', 'test_site.local', '--report', 'json', '--output', reportPath], tmpDir);
      expect(result.status).not.toBe(0);
      const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
      expect(report.executionStatus).toBe('failure');
      expect(report.status).toBe('failed');
      expect(report.errorCategory).toBe('test_configuration_error');
      expect(report.error).toContain('Testing is disabled');
    } finally {
      process.env.PATH = oldPath;
    }
  });

  it('junit report represents disabled testing as failure', () => {
    setupBench();
    const benchPath = path.join(tmpDir, 'bench');
    fs.writeFileSync(benchPath, '#!/bin/sh\necho "Testing is disabled for the site!"\nexit 0\n');
    fs.chmodSync(benchPath, '755');
    const oldPath = process.env.PATH;
    process.env.PATH = tmpDir + ':' + oldPath;
    const reportPath = path.join(tmpDir, 'report.xml');
    try {
      const result = runCli(['test', 'myapp', '--site', 'test_site.local', '--report', 'junit', '--output', reportPath], tmpDir);
      expect(result.status).not.toBe(0);
      const xml = fs.readFileSync(reportPath, 'utf-8');
      expect(xml).toContain('failures="1"');
      expect(xml).toContain('test_configuration_error');
    } finally {
      process.env.PATH = oldPath;
    }
  });
});
