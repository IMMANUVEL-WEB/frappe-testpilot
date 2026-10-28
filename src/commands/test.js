import { discoverBench, getAppsFromTxt, isValidAppName } from '../core/bench.js';
import { runFrappeTests } from '../core/test-runner.js';
import { createJsonReport, writeJsonReport } from '../core/reporters/json-reporter.js';
import { createJunitReport, writeJunitReport } from '../core/reporters/junit-reporter.js';
import fs from 'fs';
import path from 'path';

function isValidSiteName(name) {
  // Site names typically allow alphanumeric, dots, hyphens
  // But we require test_ prefix for safety
  const basicValidRegex = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
  return basicValidRegex.test(name);
}

function getDefaultReportPath(reportFormat) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  if (reportFormat === 'junit') {
    return path.join('reports', `junit-${timestamp}.xml`);
  }
  return path.join('reports', `test-results-${timestamp}.json`);
}

export function testCommand(app, options = {}) {
  try {
    console.log('Frappe TestPilot');
    console.log('----------------------------------------');

    // Validate app argument
    if (!app) {
      console.error('Error: App name is required.');
      console.error('Usage: frappe-testpilot test <app> --site <site>');
      process.exitCode = 1;
      return;
    }

    // Validate site argument
    if (!options.site) {
      console.error('Error: Site name is required.');
      console.error('Usage: frappe-testpilot test <app> --site <site>');
      process.exitCode = 1;
      return;
    }

    const siteName = options.site;

    // Validate report format
    if (options.report) {
      if (options.report !== 'json' && options.report !== 'junit') {
        console.error("Error: Invalid report format. Supported formats: json, junit");
        process.exitCode = 1;
        return;
      }
    }

    // Validate site name safety - must start with test_
    if (!siteName.startsWith('test_')) {
      console.error('Error: Site must start with "test_" for safety.');
      console.error('This is a safety guard to prevent accidentally running tests on non-test sites.');
      console.error('Note: A site name starting with test_ does not guarantee the data is disposable.');
      console.error('You must verify the site is intended for testing.');
      process.exitCode = 1;
      return;
    }

    if (!isValidSiteName(siteName)) {
      console.error('Error: Invalid site name format.');
      process.exitCode = 1;
      return;
    }

    // Validate timeout if provided
    let timeout;
    if (options.timeout !== undefined) {
      const timeoutNum = parseInt(options.timeout, 10);
      if (isNaN(timeoutNum) || timeoutNum <= 0 || timeoutNum.toString() !== options.timeout.toString()) {
        console.error('Error: Timeout must be a positive integer (milliseconds).');
        process.exitCode = 1;
        return;
      }
      timeout = timeoutNum;
    }

    // Discover Bench root
    const benchDiscovery = discoverBench(process.cwd());
    if (!benchDiscovery.found) {
      console.error('Error: No Frappe Bench root found.');
      console.error('Searched upward from current directory for apps/ and sites/ directories.');
      console.error('Please run this command from within a Frappe Bench (root or any subdirectory).');
      process.exitCode = 1;
      return;
    }

    console.log(`Bench: ${benchDiscovery.benchRoot}`);

    // Validate app name
    if (!isValidAppName(app)) {
      console.error('Error: Invalid app name format.');
      process.exitCode = 1;
      return;
    }

    // Check app directory exists
    const appPath = path.join(benchDiscovery.benchRoot, 'apps', app);
    if (!fs.existsSync(appPath) || !fs.statSync(appPath).isDirectory()) {
      console.error(`Error: App directory not found: ${appPath}`);
      process.exitCode = 1;
      return;
    }

    // Check if app appears in sites/apps.txt
    try {
      const appsInfo = getAppsFromTxt(benchDiscovery.sitesPath);
      if (appsInfo.exists) {
        if (!appsInfo.apps.includes(app)) {
          console.error(`Error: App '${app}' not found in sites/apps.txt.`);
          console.error('The app must be listed in sites/apps.txt before running tests.');
          process.exitCode = 1;
          return;
        }
      } else {
        console.log('Warning: sites/apps.txt not found. Skipping apps.txt validation.');
      }
    } catch (error) {
      console.error(`Error reading sites/apps.txt: ${error.message}`);
      process.exitCode = 1;
      return;
    }

    // Verify site directory exists
    const sitePath = path.join(benchDiscovery.sitesPath, siteName);
    if (!fs.existsSync(sitePath) || !fs.statSync(sitePath).isDirectory()) {
      console.error(`Error: Site directory not found: ${sitePath}`);
      console.error('Make sure the test site exists under sites/.');
      process.exitCode = 1;
      return;
    }

    console.log(`App: ${app}`);
    console.log(`Site: ${siteName}`);
    console.log('');
    console.log('Running native Frappe tests...');
    console.log('');

    // Execute native tests
    const result = runFrappeTests({
      benchRoot: benchDiscovery.benchRoot,
      app: app,
      site: siteName,
      timeout: timeout,
    });

    // Print native output
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }

    console.log('');
    console.log('----------------------------------------');

    // Generate reports if requested
    if (options.report) {
      const reportFormat = options.report;
      const reportWarnings = [];
      let reportPath = options.output;
      if (!reportPath) {
        reportPath = getDefaultReportPath(reportFormat);
      }
      // Resolve relative to cwd (documented behavior)
      reportPath = path.resolve(process.cwd(), reportPath);

      try {
        if (reportFormat === 'json') {
          const reportData = createJsonReport({
            app: app,
            site: siteName,
            benchRoot: benchDiscovery.benchRoot,
            startTime: result.startTime,
            endTime: result.endTime,
            duration: result.duration,
            success: result.success,
            exitCode: result.exitCode,
            timedOut: result.timedOut,
            stdout: result.stdout,
            stderr: result.stderr,
            error: result.error,
            errorCategory: result.errorCategory,
            reportWarnings: reportWarnings,
          });
          const writeResult = writeJsonReport(reportData, reportPath);
          if (!writeResult.success) {
            console.error(`Error writing JSON report: ${writeResult.error}`);
            process.exitCode = 1;
            return;
          }
          console.log(`JSON report written to: ${writeResult.path}`);
        } else if (reportFormat === 'junit') {
          const junitXml = createJunitReport({
            app: app,
            site: siteName,
            benchRoot: benchDiscovery.benchRoot,
            startTime: result.startTime,
            endTime: result.endTime,
            duration: result.duration,
            success: result.success,
            exitCode: result.exitCode,
            timedOut: result.timedOut,
            stdout: result.stdout,
            stderr: result.stderr,
            error: result.error,
            errorCategory: result.errorCategory,
          });
          const writeResult = writeJunitReport(junitXml, reportPath);
          if (!writeResult.success) {
            console.error(`Error writing JUnit report: ${writeResult.error}`);
            process.exitCode = 1;
            return;
          }
          console.log(`JUnit report written to: ${writeResult.path}`);
        }
      } catch (reportError) {
        console.error(`Error generating report: ${reportError.message}`);
        process.exitCode = 1;
        return;
      }
      console.log('');
    }

    if (result.timedOut) {
      console.error('[FAIL] Test command timed out.');
      if (result.error) {
        console.error(`Error: ${result.error}`);
      }
      process.exitCode = result.exitCode !== null ? result.exitCode : 124;
      return;
    }

    if (result.error && result.exitCode === null && !result.timedOut) {
      console.error(`[FAIL] ${result.error}`);
      process.exitCode = 1;
      return;
    }

    if (result.success) {
      console.log('[PASS] Test command completed successfully.');
      process.exitCode = 0;
      return;
    } else {
      console.log(`[FAIL] Frappe tests failed.`);
      if (result.error) {
        console.log(`Error: ${result.error}`);
      }
      if (result.exitCode !== null && result.exitCode !== 0) {
        console.log(`Exit code: ${result.exitCode}`);
      }
      process.exitCode = result.exitCode !== null && result.exitCode !== 0 ? result.exitCode : 1;
      return;
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exitCode = 1;
  }
}
