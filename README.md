# Frappe TestPilot

CLI tool to help Frappe developers test custom apps before deploying them to production.

## Installation

```bash
npm install -g frappe-testpilot
```

Or use with npx:

```bash
npx frappe-testpilot --help
```

## Development

```bash
npm install
npm run dev -- --help
npm run dev -- check
npm run dev -- inspect
npm test
```

## Supported Commands

- `frappe-testpilot --help` - Display help information
- `frappe-testpilot --version` - Display version
- `frappe-testpilot check` - Check the current environment for Frappe Bench
- `frappe-testpilot inspect` - Inspect the Bench and discover installed app candidates
- `frappe-testpilot inspect --json` - Output inspection results as machine-readable JSON

### Bench Discovery

Frappe TestPilot discovers the Bench root by searching upward from the current working directory through parent directories. It looks for the nearest directory containing both `apps/` and `sites/` directories. Discovery will search up to the filesystem root and handles inaccessible directories gracefully. You can run commands from the Bench root or from any nested directory (e.g., inside `apps/my_app/`).

### App Discovery

- `sites/apps.txt` lists apps known to the Bench installation. This does **not** prove that every listed app is installed on every site - it's a Bench-level list.
- Apps listed in `sites/apps.txt` are "app candidates" - their presence in the file doesn't guarantee they're installed on a specific site or are fully functional.
- App names are deduplicated, trimmed, and validated before inspection.
- The CLI checks for app directories in `apps/<app_name>/`, looks for Python package indicators (`__init__.py`), and checks for common metadata files (`hooks.py`, `modules.txt`, `pyproject.toml`, `setup.py`, `setup.cfg`).

### Version Detection

Framework/app versions are detected from local source metadata only (e.g., `__version__` in `__init__.py`, version in `pyproject.toml` or `setup.cfg`). Versions are never invented - if not found, "unknown" is reported with a note about the source. No Frappe modules are imported and no Python code is executed for version discovery.

### JSON Output

`frappe-testpilot inspect --json` outputs machine-readable JSON to stdout with a stable structure containing bench information, app details, versions, warnings, and a summary. Diagnostics do not interfere with JSON output.

## Examples

```bash
# From Bench root
cd /path/to/frappe-bench
frappe-testpilot check
frappe-testpilot inspect
frappe-testpilot inspect --json

# From a nested directory
cd /path/to/frappe-bench/apps/my_custom_app
frappe-testpilot inspect
```

## Current Limitations (Phase 2)

- Only structural discovery and inspection - no actual app testing functionality yet
- Version detection only from local metadata files, not from installed packages or site configuration
- Does not verify if apps are actually installed on specific sites
- Does not check service status (MariaDB, Redis, etc.) or runtime health
- Does not modify Frappe sites, databases, files, or configuration
- Does not run migrations, install apps, or execute arbitrary code

## Requirements

- Node.js >= 18.0.0

## License

MIT


### Testing Apps

**Syntax:**
```bash
frappe-testpilot test <app> --site <site> [--timeout <milliseconds>]
```

**Native command invoked:**
```bash
bench --site <site> run-tests --app <app>
```
The command is executed from the discovered Bench root with `shell: false` and arguments passed as arrays for safety.

**Requirements:**
- A working Frappe Bench environment with `bench` in PATH
- App must exist in `apps/<app>` and be listed in `sites/apps.txt`
- Site must exist under `sites/` and **must start with `test_`** (safety guard)
- The site must be a dedicated test site that you have verified is safe to run tests against

**Safety notes:**
- The `test_` prefix is a **safety guard only** - it does not guarantee the site contains disposable data. You must verify the site is genuinely intended for testing.
- Tests may change database state. Never run tests against production sites.
- The tool will never create sites, install apps, run migrations, reset data, or modify configuration.
- The tool does not create isolated databases or guarantee production safety.

**Common validation errors:**
- "Site must start with test_" - Use a site name starting with `test_` (e.g., `test_site.local`)
- "App not found in sites/apps.txt" - Add the app to `sites/apps.txt` or ensure it's properly installed
- "App directory not found" - Ensure the app exists in `apps/<app_name>/`
- "Site directory not found" - Create or configure the test site under `sites/`
- "No Frappe Bench root found" - Run from within a Frappe Bench or its subdirectories


## Static Analysis

**Syntax:**
```bash
frappe-testpilot analyze <app> [--format text|json]
```

**Supported formats:** `text` (default), `json`

**What it does:**
- Static analysis only - does **not** import, execute, install, or modify app code
- Discovers Bench root and validates app safely (prevents path traversal)
- Checks app structure, Python syntax (using AST parsing via Python), DocType JSON validity
- Scans for security issues: `eval()`/`exec()` usage, potentially unsafe SQL construction, hardcoded credentials
- Checks patches.txt for duplicates and possible missing references
- Ignores `node_modules`, `.git`, `__pycache__`, virtual environments, build dirs

**Rule IDs (implemented):**
- `APP001` - Missing `__init__.py` (warning)
- `APP002` - Missing `hooks.py` (info)
- `APP003` - Missing `modules.txt` (info)
- `PY001` - Python syntax error (error)
- `PY998` - Syntax check failed (warning)
- `PY999` - Python interpreter not found (warning)
- `JSON001` - Malformed JSON (error)
- `PATCH001` - Duplicate patch entry (warning)
- `PATCH002` - Possible missing patch reference (warning)
- `PATCH999` - Cannot read patches.txt (warning)
- `SEC001` - Use of eval() (warning)
- `SEC002` - Use of exec() (warning)
- `SEC003` - Potentially unsafe SQL construction (warning)
- `SEC004` - Possible hardcoded credential (warning, value not shown)

**Severity levels:** `error`, `warning`, `info`

**Exit code policy:**
- Exit code 0 if no errors found (warnings/info don't fail by default)
- Exit code 1 for errors found, invalid input, analyzer errors, or missing bench/app
- JSON output goes to stdout with no diagnostic prose mixed in

**Limitations:**
- Static analysis only - does **not** prove production readiness
- May produce false positives/negatives; review findings manually
- SQL/credential detection uses conservative pattern matching
- Does not execute app code, import Frappe modules, or read `.env` files
- Does not scan outside the requested app directory
- Python3 required for syntax checking (if missing, syntax check is skipped with warning)
- No automatic fixes, no AI analysis, no report exports beyond JSON

**Examples:**
```bash
cd /path/to/frappe-bench
frappe-testpilot analyze my_custom_app
frappe-testpilot analyze my_custom_app --format json
```


## Test Reports

**JSON reports:**
```bash
frappe-testpilot test my_app --site test_site.local --report json
frappe-testpilot test my_app --site test_site.local --report json --output reports/results.json
```

**JUnit XML reports (CI compatible):**
```bash
frappe-testpilot test my_app --site test_site.local --report junit
frappe-testpilot test my_app --site test_site.local --report junit --output reports/junit.xml
```

**Report behavior:**
- Reports are only written when `--report` is specified
- Output paths are resolved relative to current working directory
- Parent directories are created automatically when writing reports
- Reports do **not** contain credentials, environment variables, or passwords
- Reports may contain application paths and test output
- Individual test counts are not fabricated - if unavailable, represented as null/not included
- Schema versioned (JSON schemaVersion: 1.0)
- JUnit XML is properly escaped for special characters

**Exit codes:**
- 0: Tests passed and report generation succeeded (if requested)
- Non-zero: Preflight validation failure, test failure, timeout, spawn/execution error, or report generation failure

**CI usage example (GitHub Actions):**
```yaml
- name: Run Frappe tests
  run: |
    npx frappe-testpilot test my_custom_app --site test_ci.local --report junit --output test-results/junit.xml
```
*Note:* GitHub-hosted runners do not automatically have a Frappe Bench/database. You must set up a dedicated test environment.

**Limitations:**
- Native Frappe output parsing for individual test counts is not implemented (fragile); suite-level reporting only
- Reports may contain sensitive test output - treat them as build artifacts
- Does not modify site configuration or database data
