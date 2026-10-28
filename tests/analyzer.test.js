import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createJunitReport } from '../src/core/reporters/junit-reporter.js';

const CLI_PATH = path.resolve(process.cwd(), 'src/index.js');

function runCli(args = [], cwd = process.cwd()) {
  const result = spawnSync('node', [CLI_PATH, ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env },
  });
  return result;
}

describe('frappe-testpilot Phase 4 - Analyze command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-analyze-'));
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function setupBench() {
    fs.mkdirSync(path.join(tmpDir, 'apps'));
    fs.mkdirSync(path.join(tmpDir, 'sites'));
  }

  it('analyze command appears in CLI help', () => {
    const result = runCli(['--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('analyze');
  });

  it('missing app argument is rejected', () => {
    setupBench();
    const result = runCli(['analyze'], tmpDir);
    expect(result.status).not.toBe(0);
  });

  it('invalid app name is rejected', () => {
    setupBench();
    fs.mkdirSync(path.join(tmpDir, 'apps', '123bad'));
    const result = runCli(['analyze', '123bad'], tmpDir);
    expect(result.status).not.toBe(0);
  });

  it('app directory not found', () => {
    setupBench();
    const result = runCli(['analyze', 'nonexistent'], tmpDir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('App directory not found');
  });

  it('missing Python package warning', () => {
    setupBench();
    fs.mkdirSync(path.join(tmpDir, 'apps', 'myapp'));
    const result = runCli(['analyze', 'myapp'], tmpDir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('APP001');
  });

  it('python syntax error detection', () => {
    setupBench();
    fs.mkdirSync(path.join(tmpDir, 'apps', 'myapp'));
    fs.writeFileSync(path.join(tmpDir, 'apps', 'myapp', '__init__.py'), 'def foo(\n'); // syntax error
    const result = runCli(['analyze', 'myapp'], tmpDir);
    // Should find syntax error
    expect(result.stdout).toContain('PY001');
    expect(result.status).not.toBe(0);
  });

  it('valid Python source', () => {
    setupBench();
    fs.mkdirSync(path.join(tmpDir, 'apps', 'myapp'));
    fs.writeFileSync(path.join(tmpDir, 'apps', 'myapp', '__init__.py'), "def hello():\n    return 'world'\n");
    const result = runCli(['analyze', 'myapp'], tmpDir);
    expect(result.status).toBe(0);
  });

  it('malformed DocType JSON', () => {
    setupBench();
    fs.mkdirSync(path.join(tmpDir, 'apps', 'myapp'));
    fs.writeFileSync(path.join(tmpDir, 'apps', 'myapp', '__init__.py'), '');
    fs.mkdirSync(path.join(tmpDir, 'apps', 'myapp', 'doctype'));
    fs.writeFileSync(path.join(tmpDir, 'apps', 'myapp', 'doctype', 'bad.json'), '{invalid json');
    const result = runCli(['analyze', 'myapp'], tmpDir);
    expect(result.stdout).toContain('JSON001');
  });

  it('duplicate patch entries', () => {
    setupBench();
    fs.mkdirSync(path.join(tmpDir, 'apps', 'myapp'));
    fs.writeFileSync(path.join(tmpDir, 'apps', 'myapp', '__init__.py'), '');
    fs.writeFileSync(path.join(tmpDir, 'apps', 'myapp', 'patches.txt'), 'patch1.py\npatch1.py\n');
    const result = runCli(['analyze', 'myapp'], tmpDir);
    expect(result.stdout).toContain('PATCH001');
  });

  it('detection of eval usage', () => {
    setupBench();
    fs.mkdirSync(path.join(tmpDir, 'apps', 'myapp'));
    fs.writeFileSync(path.join(tmpDir, 'apps', 'myapp', '__init__.py'), '');
    fs.writeFileSync(path.join(tmpDir, 'apps', 'myapp', 'api.py'), "result = eval(user_input)\n");
    const result = runCli(['analyze', 'myapp'], tmpDir);
    expect(result.stdout).toContain('SEC001');
  });

  it('SQL pattern detection', () => {
    setupBench();
    fs.mkdirSync(path.join(tmpDir, 'apps', 'myapp'));
    fs.writeFileSync(path.join(tmpDir, 'apps', 'myapp', '__init__.py'), '');
    fs.writeFileSync(path.join(tmpDir, 'apps', 'myapp', 'utils.py'), "query = 'SELECT * FROM tabUser WHERE name = ' + name\n");
    const result = runCli(['analyze', 'myapp'], tmpDir);
    expect(result.stdout).toContain('SEC003');
  });

  it('secret detection without exposing value', () => {
    setupBench();
    fs.mkdirSync(path.join(tmpDir, 'apps', 'myapp'));
    fs.writeFileSync(path.join(tmpDir, 'apps', 'myapp', '__init__.py'), '');
    fs.writeFileSync(path.join(tmpDir, 'apps', 'myapp', 'config.py'), "password = 'supersecret123'\n");
    const result = runCli(['analyze', 'myapp'], tmpDir);
    expect(result.stdout).toContain('SEC004');
    expect(result.stdout).not.toContain('supersecret123');
  });

  it('ignored directories', () => {
    setupBench();
    fs.mkdirSync(path.join(tmpDir, 'apps', 'myapp'));
    fs.writeFileSync(path.join(tmpDir, 'apps', 'myapp', '__init__.py'), '');
    fs.mkdirSync(path.join(tmpDir, 'apps', 'myapp', 'node_modules'));
    fs.writeFileSync(path.join(tmpDir, 'apps', 'myapp', 'node_modules', 'bad.py'), 'def foo(\n');
    const result = runCli(['analyze', 'myapp'], tmpDir);
    expect(result.stdout).not.toContain('node_modules/bad.py');
  });

  it('JSON output parses correctly', () => {
    setupBench();
    fs.mkdirSync(path.join(tmpDir, 'apps', 'myapp'));
    fs.writeFileSync(path.join(tmpDir, 'apps', 'myapp', '__init__.py'), '');
    const result = runCli(['analyze', 'myapp', '--format', 'json'], tmpDir);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
    const parsed = JSON.parse(result.stdout);
    expect(parsed.app).toBe('myapp');
    expect(Array.isArray(parsed.findings)).toBe(true);
    expect(parsed.summary).toBeDefined();
  });

  it('JSON stdout contains no human readable noise', () => {
    setupBench();
    fs.mkdirSync(path.join(tmpDir, 'apps', 'myapp'));
    fs.writeFileSync(path.join(tmpDir, 'apps', 'myapp', '__init__.py'), '');
    const result = runCli(['analyze', 'myapp', '--format', 'json'], tmpDir);
    expect(result.stdout.trim().startsWith('{')).toBe(true);
  });

  it('correct summary counts', () => {
    setupBench();
    fs.mkdirSync(path.join(tmpDir, 'apps', 'myapp'));
    fs.writeFileSync(path.join(tmpDir, 'apps', 'myapp', '__init__.py'), 'def foo(\n');
    const result = runCli(['analyze', 'myapp', '--format', 'json'], tmpDir);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.summary.errors).toBeGreaterThan(0);
  });

  it('no modifications to scanned source files', () => {
    setupBench();
    fs.mkdirSync(path.join(tmpDir, 'apps', 'myapp'));
    const content = "def hello():\n    return 'world'\n";
    fs.writeFileSync(path.join(tmpDir, 'apps', 'myapp', '__init__.py'), content);
    const before = fs.readFileSync(path.join(tmpDir, 'apps', 'myapp', '__init__.py'), 'utf-8');
    runCli(['analyze', 'myapp'], tmpDir);
    const after = fs.readFileSync(path.join(tmpDir, 'apps', 'myapp', '__init__.py'), 'utf-8');
    expect(before).toBe(after);
  });

  it('unsupported format rejected', () => {
    setupBench();
    fs.mkdirSync(path.join(tmpDir, 'apps', 'myapp'));
    fs.writeFileSync(path.join(tmpDir, 'apps', 'myapp', '__init__.py'), '');
    const result = runCli(['analyze', 'myapp', '--format', 'xml'], tmpDir);
    expect(result.status).not.toBe(0);
  });

  it('analyzes nested app layout without APP001', () => {
    setupBench();
    fs.mkdirSync(path.join(tmpDir, 'apps', 'ngo', 'ngo'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'apps', 'ngo', 'ngo', '__init__.py'), "__version__ = '1.0.0'\n");
    fs.writeFileSync(path.join(tmpDir, 'apps', 'ngo', 'ngo', 'hooks.py'), '');
    fs.writeFileSync(path.join(tmpDir, 'apps', 'ngo', 'ngo', 'modules.txt'), 'Ngo\n');
    const result = runCli(['analyze', 'ngo'], tmpDir);
    expect(result.stdout).not.toContain('APP001');
    expect(result.status).toBe(0);
  });
});

describe('Frappe DocType and hooks checks', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-frappe-'));
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function setupBench() {
    fs.mkdirSync(path.join(tmpDir, 'apps'));
    fs.mkdirSync(path.join(tmpDir, 'sites'));
  }

  it('valid DocType JSON produces no JSON001/FRP001 for correct metadata', () => {
    setupBench();
    fs.mkdirSync(path.join(tmpDir, 'apps', 'myapp', 'myapp', 'doctype', 'task'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'apps', 'myapp', 'myapp', '__init__.py'), '');
    fs.writeFileSync(path.join(tmpDir, 'apps', 'myapp', 'myapp', 'doctype', 'task', 'task.json'), JSON.stringify({ name: 'Task', doctype: 'DocType', fields: [] }));
    const result = runCli(['analyze', 'myapp'], tmpDir);
    expect(result.stdout).not.toContain('JSON001');
    expect(result.stdout).not.toContain('FRP001');
  });

  it('malformed DocType JSON reports JSON001', () => {
    setupBench();
    fs.mkdirSync(path.join(tmpDir, 'apps', 'myapp', 'myapp', 'doctype', 'task'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'apps', 'myapp', 'myapp', '__init__.py'), '');
    fs.writeFileSync(path.join(tmpDir, 'apps', 'myapp', 'myapp', 'doctype', 'task', 'task.json'), '{bad');
    const result = runCli(['analyze', 'myapp'], tmpDir);
    expect(result.stdout).toContain('JSON001');
  });

  it('missing name or invalid doctype reports FRP001', () => {
    setupBench();
    fs.mkdirSync(path.join(tmpDir, 'apps', 'myapp', 'myapp', 'doctype', 'task'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'apps', 'myapp', 'myapp', '__init__.py'), '');
    fs.writeFileSync(path.join(tmpDir, 'apps', 'myapp', 'myapp', 'doctype', 'task', 'task.json'), JSON.stringify({ name: '', doctype: 'DocType' }));
    const result = runCli(['analyze', 'myapp'], tmpDir);
    expect(result.stdout).toContain('FRP001');
  });

  it('invalid field entries report FRP002 with field index', () => {
    setupBench();
    fs.mkdirSync(path.join(tmpDir, 'apps', 'myapp', 'myapp', 'doctype', 'task'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'apps', 'myapp', 'myapp', '__init__.py'), '');
    fs.writeFileSync(path.join(tmpDir, 'apps', 'myapp', 'myapp', 'doctype', 'task', 'task.json'), JSON.stringify({ name: 'Task', doctype: 'DocType', fields: [null, { fieldtype: '' }] }));
    const result = runCli(['analyze', 'myapp'], tmpDir);
    expect(result.stdout).toContain('FRP002');
    expect(result.stdout).toContain('index 0');
    expect(result.stdout).toContain('index 1');
  });

  it('works in nested doctype directories', () => {
    setupBench();
    fs.mkdirSync(path.join(tmpDir, 'apps', 'myapp', 'myapp', 'doctype', 'project', 'task'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'apps', 'myapp', 'myapp', '__init__.py'), '');
    fs.writeFileSync(path.join(tmpDir, 'apps', 'myapp', 'myapp', 'doctype', 'project', 'task', 'task.json'), JSON.stringify({ name: 'Task', doctype: 'DocType' }));
    const result = runCli(['analyze', 'myapp'], tmpDir);
    expect(result.stdout).not.toContain('JSON001');
    expect(result.status).toBe(0);
  });

  it('valid hooks.py passes without FRP003', () => {
    setupBench();
    fs.mkdirSync(path.join(tmpDir, 'apps', 'myapp', 'myapp'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'apps', 'myapp', 'myapp', '__init__.py'), '');
    fs.writeFileSync(path.join(tmpDir, 'apps', 'myapp', 'myapp', 'hooks.py'), "app_name = 'myapp'\n");
    const result = runCli(['analyze', 'myapp'], tmpDir);
    expect(result.stdout).not.toContain('FRP003');
  });

  it('invalid hooks.py reports FRP003', () => {
    setupBench();
    fs.mkdirSync(path.join(tmpDir, 'apps', 'myapp', 'myapp'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'apps', 'myapp', 'myapp', '__init__.py'), '');
    fs.writeFileSync(path.join(tmpDir, 'apps', 'myapp', 'myapp', 'hooks.py'), "def foo(\n");
    const result = runCli(['analyze', 'myapp'], tmpDir);
    expect(result.stdout).toContain('FRP003');
    expect(result.status).not.toBe(0);
  });

  it('no false positives on unrelated JSON files', () => {
    setupBench();
    fs.mkdirSync(path.join(tmpDir, 'apps', 'myapp', 'myapp'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'apps', 'myapp', 'myapp', '__init__.py'), '');
    fs.writeFileSync(path.join(tmpDir, 'apps', 'myapp', 'myapp', 'config.json'), '{bad json');
    const result = runCli(['analyze', 'myapp'], tmpDir);
    expect(result.stdout).not.toContain('JSON001');
  });
});

describe('JUnit XML reporter robustness', () => {
  it('strips ANSI escape sequences and parses with XML parser', () => {
    const xml = createJunitReport({
      app: 'myapp',
      site: 'test_site.local',
      benchRoot: '/tmp/bench',
      startTime: Date.now(),
      endTime: Date.now(),
      duration: 100,
      success: true,
      exitCode: 0,
      timedOut: false,
      stdout: '\u001B[32m✔\u001B[0m Test passed\n',
      stderr: '\u001B[31merror\u001B[0m\n',
      error: null,
      errorCategory: null,
    });
    expect(xml).not.toContain('\u001B');
    expect(xml).toContain('✔');
    const result = spawnSync('python3', ['-c', `import xml.etree.ElementTree as ET; ET.fromstring('''${xml.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}''')`], { encoding: 'utf-8' });
    expect(result.status).toBe(0);
  });

  it('sanitizes XML-invalid control characters but keeps tabs/newlines', () => {
    const xml = createJunitReport({
      app: 'myapp',
      site: 'test_site.local',
      benchRoot: '/tmp/bench',
      startTime: Date.now(),
      endTime: Date.now(),
      duration: 50,
      success: false,
      exitCode: 1,
      timedOut: false,
      stdout: 'hello\x01\x02world\n\tok',
      stderr: '',
      error: 'failed',
      errorCategory: 'test_failure',
    });
    expect(xml).not.toMatch(/[\x01\x02]/);
    const result = spawnSync('python3', ['-c', `import xml.etree.ElementTree as ET; ET.fromstring('''${xml.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}''')`], { encoding: 'utf-8' });
    expect(result.status).toBe(0);
  });

  it('escapes XML special characters and handles ]]>', () => {
    const xml = createJunitReport({
      app: 'myapp',
      site: 'test_site.local',
      benchRoot: '/tmp/bench',
      startTime: Date.now(),
      endTime: Date.now(),
      duration: 10,
      success: false,
      exitCode: 1,
      timedOut: false,
      stdout: 'text <tag> & "quote" \'apos\' ]]> end',
      stderr: '',
      error: '<error>',
      errorCategory: 'test_failure',
    });
    const result = spawnSync('python3', ['-c', `import xml.etree.ElementTree as ET; ET.fromstring('''${xml.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}''')`], { encoding: 'utf-8' });
    expect(result.status).toBe(0);
  });

  it('parses Ran N tests and reports correct count', () => {
    const xml = createJunitReport({
      app: 'myapp',
      site: 'test_site.local',
      benchRoot: '/tmp/bench',
      startTime: Date.now(),
      endTime: Date.now(),
      duration: 200,
      success: true,
      exitCode: 0,
      timedOut: false,
      stdout: 'Ran 2 tests in 0.123s\nOK\n',
      stderr: '',
      error: null,
      errorCategory: null,
    });
    expect(xml).toContain('tests="2"');
    const result = spawnSync('python3', ['-c', `import xml.etree.ElementTree as ET,sys; r=ET.fromstring('''${xml.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'''); print(r.attrib['tests'])`], { encoding: 'utf-8' });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('2');
  });

  it('falls back to 1 test when no summary available', () => {
    const xml = createJunitReport({
      app: 'myapp',
      site: 'test_site.local',
      benchRoot: '/tmp/bench',
      startTime: Date.now(),
      endTime: Date.now(),
      duration: 50,
      success: false,
      exitCode: 1,
      timedOut: false,
      stdout: 'some output',
      stderr: '',
      error: 'fail',
      errorCategory: 'test_failure',
    });
    expect(xml).toContain('tests="1"');
    const result = spawnSync('python3', ['-c', `import xml.etree.ElementTree as ET; r=ET.fromstring('''${xml.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'''); print(r.attrib['tests'])`], { encoding: 'utf-8' });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('1');
  });

  it('preserves unicode checkmark and parses XML', () => {
    const xml = createJunitReport({
      app: 'myapp',
      site: 'test_site.local',
      benchRoot: '/tmp/bench',
      startTime: Date.now(),
      endTime: Date.now(),
      duration: 100,
      success: true,
      exitCode: 0,
      timedOut: false,
      stdout: '✔ All good',
      stderr: '',
      error: null,
      errorCategory: null,
    });
    expect(xml).toContain('✔');
    const tmpFile = path.join(os.tmpdir(), `junit-test-${Date.now()}.xml`);
    fs.writeFileSync(tmpFile, xml);
    const result = spawnSync('python3', ['-c', `import xml.etree.ElementTree as ET; ET.parse('${tmpFile}')`], { encoding: 'utf-8' });
    fs.unlinkSync(tmpFile);
    expect(result.status).toBe(0);
  });
});
