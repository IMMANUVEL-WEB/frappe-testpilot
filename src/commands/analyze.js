import { discoverBench } from '../core/bench.js';
import { analyzeApp } from '../core/analyzer.js';

export function analyzeCommand(app, options = {}) {
  try {
    const format = options.format || 'text';

    if (format === 'text') {
      console.log('Frappe TestPilot — Static Analysis');
      console.log('----------------------------------');
    }

    if (!app) {
      if (format === 'json') {
        process.stdout.write(JSON.stringify({ error: 'App name is required' }));
      } else {
        console.error('Error: App name is required.');
        console.error('Usage: frappe-testpilot analyze <app> [--format text|json]');
      }
      process.exitCode = 1;
      return;
    }

    if (format !== 'text' && format !== 'json') {
      if (format === 'json') {
        process.stdout.write(JSON.stringify({ error: `Unsupported format '${format}'` }));
      } else {
        console.error(`Error: Unsupported format '${format}'. Supported formats: text, json`);
      }
      process.exitCode = 1;
      return;
    }

    const benchDiscovery = discoverBench(process.cwd());
    if (!benchDiscovery.found) {
      if (format === 'json') {
        const result = {
          error: 'Bench not found',
          message: 'No Frappe Bench root found when searching upward from current directory'
        };
        process.stdout.write(JSON.stringify(result));
      } else {
        console.error('Error: No Frappe Bench root found.');
        console.error('Searched upward from current directory for apps/ and sites/ directories.');
      }
      process.exitCode = 1;
      return;
    }

    const analysisResult = analyzeApp(benchDiscovery, app);

    if (analysisResult.error) {
      if (format === 'json') {
        const result = {
          error: analysisResult.error,
          app: app
        };
        process.stdout.write(JSON.stringify(result));
      } else {
        console.error(`Error: ${analysisResult.error}`);
      }
      process.exitCode = 1;
      return;
    }

    if (format === 'json') {
      const result = {
        app: analysisResult.app,
        appPath: analysisResult.appPath,
        findings: analysisResult.findings,
        summary: analysisResult.summary,
      };
      process.stdout.write(JSON.stringify(result));
      // Exit code policy: nonzero for analyzer errors? Or based on errors found
      // "Return a nonzero exit code for analyzer errors or invalid input. Warnings alone should not fail analysis by default."
      if (analysisResult.summary.errors > 0) {
        process.exitCode = 1;
      } else {
        process.exitCode = 0;
      }
      return;
    }

    // Text format
    console.log(`App: ${app}`);
    console.log('');

    if (analysisResult.findings.length === 0) {
      console.log('No issues found.');
    } else {
      for (const finding of analysisResult.findings) {
        const lineInfo = finding.line ? `:${finding.line}` : '';
        const fileInfo = finding.file ? `${finding.file}${lineInfo}` : '';
        console.log(`${finding.severity.toUpperCase().padEnd(7)} ${finding.ruleId.padEnd(6)} ${fileInfo}`);
        console.log(`        ${finding.message}`);
        if (finding.suggestion) {
          console.log(`        ${finding.suggestion}`);
        }
        console.log('');
      }
    }

    console.log('Summary:');
    console.log(`Errors: ${analysisResult.summary.errors}`);
    console.log(`Warnings: ${analysisResult.summary.warnings}`);
    console.log(`Info: ${analysisResult.summary.info}`);
    console.log('');
    console.log('Analysis completed.');

    if (analysisResult.summary.errors > 0) {
      process.exitCode = 1;
    } else {
      process.exitCode = 0;
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exitCode = 1;
  }
}
