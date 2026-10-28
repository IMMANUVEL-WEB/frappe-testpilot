#!/usr/bin/env node
import { Command } from 'commander';
import { checkCommand } from './commands/check.js';
import { inspectCommand } from './commands/inspect.js';
import { testCommand } from './commands/test.js';
import { analyzeCommand } from './commands/analyze.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json');

const program = new Command();

program
  .name('frappe-testpilot')
  .description(packageJson.description)
  .version(packageJson.version);

program
  .command('check')
  .description('Check the current environment for Frappe Bench')
  .action(checkCommand);

program
  .command('inspect')
  .description('Inspect the Bench and discover installed app candidates')
  .option('--json', 'Output in JSON format')
  .action(inspectCommand);

program
  .command('test <app>')
  .description('Run native Frappe tests for a custom app')
  .requiredOption('-s, --site <site>', 'Site name (must start with test_)')
  .option('-t, --timeout <milliseconds>', 'Timeout in milliseconds')
  .option('-r, --report <format>', 'Generate report (json or junit)')
  .option('-o, --output <path>', 'Output path for report')
  .action(testCommand);

program
  .command('analyze <app>')
  .description('Static analysis for Frappe custom apps')
  .option('-f, --format <format>', 'Output format (text or json)', 'text')
  .action(analyzeCommand);

program.parse();
