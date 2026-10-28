import fs from 'fs';
import path from 'path';

function stripAnsiCodes(text) {
  if (text === null || text === undefined) {
    return '';
  }
  // Remove ANSI escape sequences (CSI, OSC, etc.)
  return text
    .toString()
    .replace(/\u001B\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)/g, '')
    .replace(/\u001B[PX^_].*?\u001B\\/g, '')
    .replace(/\u001B[NOc]/g, '');
}

function sanitizeXmlString(text) {
  if (text === null || text === undefined) {
    return '';
  }
  let result = text.toString();
  // Remove ANSI codes first
  result = stripAnsiCodes(result);
  // Remove XML 1.0 invalid control characters except tab, LF, CR
  result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '');
  return result;
}

function escapeXml(unsafe) {
  if (unsafe === null || unsafe === undefined) {
    return '';
  }
  return sanitizeXmlString(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapCdata(text) {
  const sanitized = sanitizeXmlString(text);
  // CDATA cannot contain the sequence ]]>
  // Split on ]]>
  if (sanitized.includes(']]>')) {
    return sanitized.replace(/]]>/g, ']]]]><![CDATA[>');
  }
  return sanitized;
}

function parseTestCount(stdout, stderr) {
  const combined = sanitizeXmlString(`${stdout || ''}\n${stderr || ''}`);
  // Look for "Ran N tests" pattern (Frappe/Django style)
  const match = combined.match(/Ran\s+(\d+)\s+tests?/i);
  if (match && match[1]) {
    const count = parseInt(match[1], 10);
    if (!isNaN(count) && count >= 0) {
      return count;
    }
  }
  return null;
}

export function writeJunitReport(xmlContent, outputPath) {
  try {
    const resolvedPath = path.resolve(outputPath);
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(resolvedPath, xmlContent, 'utf-8');
    return { success: true, path: resolvedPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export function createJunitReport({
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
}) {
  const suiteName = `frappe-testpilot.${app}.${site}`;
  const durationSec = duration !== undefined && duration !== null ? (duration / 1000).toFixed(3) : '0.000';
  const timestamp = startTime ? new Date(startTime).toISOString() : new Date().toISOString();

  const cleanStdout = sanitizeXmlString(stdout || '');
  const cleanStderr = sanitizeXmlString(stderr || '');
  const parsedTestCount = parseTestCount(stdout, stderr);

  let testCasesXml = '';
  let failures = 0;
  let errors = 0;
  let testsCount = parsedTestCount !== null ? parsedTestCount : 1;

  if (timedOut) {
    errors = 1;
    if (testsCount < 1) testsCount = 1;
    testCasesXml = `  <testcase classname="${escapeXml(suiteName)}" name="frappe-tests" time="${durationSec}">
    <error message="${escapeXml(error || 'Test execution timed out')}" type="timeout"><![CDATA[${wrapCdata(cleanStdout + '\n' + cleanStderr)}]]></error>
  </testcase>`;
  } else if (!success) {
    if (errorCategory === 'execution_error' || (error && exitCode === null)) {
      errors = 1;
      if (testsCount < 1) testsCount = 1;
      testCasesXml = `  <testcase classname="${escapeXml(suiteName)}" name="frappe-tests" time="${durationSec}">
    <error message="${escapeXml(error || 'Execution error')}" type="${escapeXml(errorCategory || 'execution_error')}"><![CDATA[${wrapCdata(cleanStdout + '\n' + cleanStderr)}]]></error>
  </testcase>`;
    } else {
      failures = 1;
      if (testsCount < 1) testsCount = 1;
      const msg = errorCategory === 'test_configuration_error' ? (error || 'Test configuration error') : 'Frappe tests failed';
      testCasesXml = `  <testcase classname="${escapeXml(suiteName)}" name="frappe-tests" time="${durationSec}">
    <failure message="${escapeXml(msg)}" type="${escapeXml(errorCategory || 'test_failure')}"><![CDATA[${wrapCdata(cleanStdout + '\n' + cleanStderr)}]]></failure>
  </testcase>`;
    }
  } else {
    if (testsCount < 1) testsCount = 1;
    testCasesXml = `  <testcase classname="${escapeXml(suiteName)}" name="frappe-tests" time="${durationSec}"></testcase>`;
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="${escapeXml(suiteName)}" tests="${testsCount}" failures="${failures}" errors="${errors}" time="${durationSec}" timestamp="${escapeXml(timestamp)}">
${testCasesXml}
  <system-out><![CDATA[${wrapCdata(cleanStdout)}]]></system-out>
  <system-err><![CDATA[${wrapCdata(cleanStderr)}]]></system-err>
</testsuite>`;

  return xml;
}
