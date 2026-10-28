import { discoverBench, getAppsFromTxt, inspectApp, getAppVersion } from '../core/bench.js';
import path from 'path';

export function inspectCommand(options = {}) {
  const jsonMode = options.json || false;

  try {
    if (jsonMode) {
      const benchDiscovery = discoverBench(process.cwd());

      if (!benchDiscovery.found) {
        const errorResult = {
          error: 'Bench not found',
          message: 'No Frappe Bench root found when searching upward from current directory',
          cwd: process.cwd(),
        };
        process.stdout.write(JSON.stringify(errorResult));
        process.exitCode = 1;
        return;
      }

      const appsInfo = getAppsFromTxt(benchDiscovery.sitesPath);
      const appResults = [];

      for (const appName of appsInfo.apps) {
        const appInspection = inspectApp(benchDiscovery.benchRoot, appName);
        const versionInfo = getAppVersion(benchDiscovery.benchRoot, appName);
        appResults.push({
          name: appName,
          validName: appInspection.validName,
          directoryExists: appInspection.hasDirectory,
          appPath: appInspection.appPath,
          isPythonPackage: appInspection.isPythonPackage,
          metadataFiles: appInspection.metadataFiles,
          warnings: appInspection.warnings,
          version: versionInfo.version,
          versionSource: versionInfo.source,
          versionNote: versionInfo.note,
        });
      }

      const result = {
        cwd: process.cwd(),
        benchRoot: benchDiscovery.benchRoot,
        benchStructure: {
          appsExists: true,
          sitesExists: true,
          valid: true,
        },
        appsTxt: {
          exists: appsInfo.exists,
          path: appsInfo.exists ? path.join(benchDiscovery.sitesPath, 'apps.txt') : null,
          count: appsInfo.apps.length,
        },
        apps: appResults,
        summary: {
          totalListed: appsInfo.apps.length,
          validNames: appResults.filter((a) => a.validName).length,
          directoriesFound: appResults.filter((a) => a.directoryExists).length,
          missingDirectories: appResults.filter((a) => !a.directoryExists && a.validName).length,
          withMetadata: appResults.filter((a) => a.metadataFiles.length > 0).length,
        },
        note: 'apps.txt lists apps known to the Bench installation; not necessarily installed on every site',
      };

      process.stdout.write(JSON.stringify(result, null, 2));
      return;
    }

    console.log('Frappe TestPilot - Inspect');
    console.log(`Current working directory: ${process.cwd()}`);
    console.log('');

    const benchDiscovery = discoverBench(process.cwd());

    if (!benchDiscovery.found) {
      console.error('Error: No Frappe Bench root found.');
      console.error('Searched upward from current directory for apps/ and sites/ directories.');
      console.error('Please run this command from within a Frappe Bench (root or any subdirectory).');
      process.exitCode = 1;
      return;
    }

    console.log(`Bench root: ${benchDiscovery.benchRoot}`);
    console.log(`apps/ exists: yes`);
    console.log(`sites/ exists: yes`);
    console.log(`Basic Bench structure appears valid`);
    console.log('');

    try {
      const appsInfo = getAppsFromTxt(benchDiscovery.sitesPath);
      console.log(`sites/apps.txt exists: ${appsInfo.exists ? 'yes' : 'no'}`);

      if (!appsInfo.exists) {
        console.log('Warning: sites/apps.txt not found.');
        console.log('\nSummary: No app list available from sites/apps.txt');
        return;
      }

      console.log(`Apps listed in sites/apps.txt: ${appsInfo.apps.length}`);
      console.log('');
      console.log('App inspection:');

      let missingDirs = 0;
      let withMetadata = 0;

      for (const appName of appsInfo.apps) {
        const appInspection = inspectApp(benchDiscovery.benchRoot, appName);
        const versionInfo = getAppVersion(benchDiscovery.benchRoot, appName);

        console.log(`  - ${appName}`);
        if (!appInspection.validName) {
          console.log(`    Valid name: no (invalid format)`);
        } else {
          console.log(`    Valid name: yes`);
        }
        console.log(`    Directory: ${appInspection.hasDirectory ? appInspection.appPath : 'NOT FOUND in apps/'}`);
        if (appInspection.hasDirectory) {
          console.log(`    Python package: ${appInspection.isPythonPackage ? 'yes' : 'no'}`);
          console.log(`    Metadata files: ${appInspection.metadataFiles.length > 0 ? appInspection.metadataFiles.join(', ') : 'none found'}`);
          if (appInspection.metadataFiles.length > 0) {
            withMetadata++;
          }
        } else {
          if (appInspection.validName) {
            missingDirs++;
          }
        }
        console.log(`    Version: ${versionInfo.version}${versionInfo.source ? ` (from ${versionInfo.source})` : versionInfo.note ? ` (${versionInfo.note})` : ''}`);
        if (appInspection.warnings.length > 0) {
          appInspection.warnings.forEach((w) => {
            console.log(`    Warning: ${w}`);
          });
        }
        console.log('');
      }

      console.log('Summary:');
      console.log(`  Total listed in sites/apps.txt: ${appsInfo.apps.length}`);
      console.log(`  Valid app names: ${appsInfo.apps.filter((a) => /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(a)).length}`);
      console.log(`  Directories found in apps/: ${appsInfo.apps.length - missingDirs}`);
      console.log(`  Missing app directories: ${missingDirs}`);
      console.log(`  Apps with metadata files: ${withMetadata}`);
      console.log('');
      console.log('Note: sites/apps.txt lists apps known to the Bench installation, not necessarily installed on every site.');
    } catch (error) {
      console.error('Error:', error.message);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exitCode = 1;
  }
}
