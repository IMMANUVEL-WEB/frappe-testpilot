import { spawnSync } from 'child_process';
import path from 'path';

function isTestingDisabled(stdout = '', stderr = '') {
  const combined = `${stdout}\n${stderr}`;
  return /Testing is disabled for the site/i.test(combined);
}

export function runFrappeTests({ benchRoot, app, site, timeout }) {
  const startTime = Date.now();
  try {
    const args = ['--site', site, 'run-tests', '--app', app];

    const spawnOptions = {
      cwd: benchRoot,
      encoding: 'utf-8',
      shell: false,
      env: process.env,
    };

    if (typeof timeout === 'number' && timeout > 0) {
      spawnOptions.timeout = timeout;
    }

    // Set reasonable buffer limits
    spawnOptions.maxBuffer = 10 * 1024 * 1024; // 10MB

    const result = spawnSync('bench', args, spawnOptions);
    const endTime = Date.now();
    const duration = endTime - startTime;

    if (result.error) {
      // Check if it's a timeout error
      if (result.error.code === 'ETIMEDOUT') {
        return {
          success: false,
          exitCode: null,
          timedOut: true,
          stdout: result.stdout || '',
          stderr: result.stderr || '',
          error: 'Command timed out',
          startTime,
          endTime,
          duration,
          errorCategory: 'timeout',
        };
      }
      // Check if bench command not found
      if (result.error.code === 'ENOENT') {
        return {
          success: false,
          exitCode: null,
          timedOut: false,
          stdout: result.stdout || '',
          stderr: result.stderr || '',
          error: 'Bench executable not found. Make sure bench is installed and in PATH.',
          startTime,
          endTime,
          duration,
          errorCategory: 'execution_error',
        };
      }
      return {
        success: false,
        exitCode: null,
        timedOut: false,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        error: result.error.message,
        startTime,
        endTime,
        duration,
        errorCategory: 'execution_error',
      };
    }

    if (result.signal) {
      const timedOut = result.signal === 'SIGTERM' || result.signal === 'SIGKILL';
      return {
        success: false,
        exitCode: null,
        timedOut,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        error: `Process terminated by signal ${result.signal}`,
        startTime,
        endTime,
        duration,
        errorCategory: timedOut ? 'timeout' : 'execution_error',
      };
    }

    const stdout = result.stdout || '';
    const stderr = result.stderr || '';

    if (isTestingDisabled(stdout, stderr)) {
      return {
        success: false,
        exitCode: result.status !== null ? result.status : 1,
        timedOut: false,
        stdout,
        stderr,
        error: 'Testing is disabled for the site. Enable with: bench --site <site> set-config allow_tests true',
        startTime,
        endTime,
        duration,
        errorCategory: 'test_configuration_error',
      };
    }

    const exitCode = result.status !== null ? result.status : 1;

    return {
      success: exitCode === 0,
      exitCode: exitCode,
      timedOut: false,
      stdout,
      stderr,
      error: null,
      startTime,
      endTime,
      duration,
      errorCategory: exitCode === 0 ? null : 'test_failure',
    };
  } catch (error) {
    const endTime = Date.now();
    return {
      success: false,
      exitCode: null,
      timedOut: false,
      stdout: '',
      stderr: '',
      error: error.message,
      startTime,
      endTime,
      duration: endTime - startTime,
      errorCategory: 'execution_error',
    };
  }
}
