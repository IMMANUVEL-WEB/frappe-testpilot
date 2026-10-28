import fs from 'fs';
import path from 'path';

export function writeJsonReport(reportData, outputPath) {
  try {
    const resolvedPath = path.resolve(outputPath);
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const jsonContent = JSON.stringify(reportData, null, 2);
    fs.writeFileSync(resolvedPath, jsonContent, 'utf-8');
    return { success: true, path: resolvedPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export function createJsonReport({
  app,
  site,
  benchRoot,
  startTime,
  endTime,
  duration,
  success,
  exitCode,
  timedOut,
  stdout,
  stderr,
  error,
  errorCategory,
  reportWarnings = [],
}) {
  let category = errorCategory;
  if (!category) {
    if (timedOut) category = 'timeout';
    else if (success) category = null;
    else if (error && exitCode === null) category = 'execution_error';
    else category = 'test_failure';
  }
  return {
    schemaVersion: '1.0',
    tool: {
      name: 'frappe-testpilot',
      version: '0.1.0',
    },
    app: app,
    site: site,
    benchRoot: benchRoot,
    timestamps: {
      start: startTime ? new Date(startTime).toISOString() : null,
      finish: endTime ? new Date(endTime).toISOString() : null,
    },
    duration: duration !== undefined && duration !== null ? duration : null,
    status: success ? 'passed' : timedOut ? 'timeout' : 'failed',
    executionStatus: success ? 'success' : 'failure',
    processExitCode: exitCode !== undefined && exitCode !== null ? exitCode : null,
    timeout: timedOut === true,
    stdoutSummary: stdout ? (stdout.length > 1000 ? stdout.substring(0, 1000) + '... (truncated)' : stdout) : null,
    stderrSummary: stderr ? (stderr.length > 1000 ? stderr.substring(0, 1000) + '... (truncated)' : stderr) : null,
    errorCategory: category,
    error: error || null,
    reportWarnings: reportWarnings,
    note: 'Individual test counts not included as they cannot be reliably parsed from native Frappe output.',
  };
}
