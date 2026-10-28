import { discoverBench, getAppsFromTxt } from '../core/bench.js';

export function checkCommand() {
  try {
    console.log('Frappe TestPilot');
    console.log(`Node.js version: ${process.version}`);
    console.log(`Current working directory: ${process.cwd()}`);
    console.log('');

    const benchDiscovery = discoverBench(process.cwd());

    if (!benchDiscovery.found) {
      console.error('Error: Not a Frappe Bench root directory found.');
      console.error('Searched upward from current directory for apps/ and sites/ directories.');
      console.error('Please run this command from within a Frappe Bench (root or any subdirectory).');
      process.exitCode = 1;
      return;
    }

    console.log(`✓ Discovered Frappe Bench root: ${benchDiscovery.benchRoot}`);
    console.log(`  apps/ exists: yes`);
    console.log(`  sites/ exists: yes`);
    console.log(`  Basic Bench structure appears valid`);
    console.log('');

    try {
      const appsInfo = getAppsFromTxt(benchDiscovery.sitesPath);
      console.log(`sites/apps.txt exists: ${appsInfo.exists ? 'yes' : 'no'}`);
      if (!appsInfo.exists) {
        console.log('Warning: sites/apps.txt not found. Unable to list installed apps.');
      } else if (appsInfo.apps.length === 0) {
        console.log('Warning: sites/apps.txt is empty or contains no valid app entries.');
      } else {
        console.log(`Apps listed in sites/apps.txt (${appsInfo.apps.length}):`);
        appsInfo.apps.forEach((app) => {
          console.log(`  - ${app}`);
        });
      }
    } catch (error) {
      console.log(`sites/apps.txt exists: error`);
      console.log('Warning: Could not read sites/apps.txt:', error.message);
    }

    console.log('');
    console.log('Note: Structural check only - does not verify services, sites, or runtime health.');
  } catch (error) {
    console.error('Error:', error.message);
    process.exitCode = 1;
  }
}
