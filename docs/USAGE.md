# Installation and Operations

[Back to project home](../README.md)

All of the following commands are run from the project root.

## Requirements

Manual startup requires:

- Python 3.10+
- Node.js 18+
- Redis or a compatible service; Windows one-click startup can prepare it automatically Garnet
- npm

When using the Windows / WSL startup scripts, the scripts try to detect and install missing dependencies automatically.

To use the built-in Tor bridge, the Windows, Linux and WSL startup scripts automatically download, verify and update a project-private Tor Expert Bundle, so Tor Browser does not need to be pre-installed on the host.

## Manual startup

### Backend

```bash
cd darkweb_collector
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
export PYTHONPATH="$PWD/src"
python -m uvicorn darkweb_collector.api_app:app --host 127.0.0.1 --port 8000
```

Windows PowerShell:

```powershell
cd darkweb_collector
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:PYTHONPATH = "$PWD\src"
python -m uvicorn darkweb_collector.api_app:app --host 127.0.0.1 --port 8000
```

### Frontend

```bash
cd threat-intelligence-dashboard
npm install
npm run dev
```

The default frontend port is `5174`, and the development proxy forwards to `127.0.0.1:8000`.

## Healthcheck Diagnostics entry

Open `/healthcheck` directly to load the standalone diagnostics page served by the backend, and log in with an existing administrator account to run checks. There is no diagnostics entry in the regular frontend menu or modules; the `/system-diagnostics` page has been removed. Results can be copied or downloaded as JSON, with no AI service binding or extra client required.

The page and diagnostic data APIs are all under `/healthcheck`: `GET /healthcheck` returns the page, `GET /healthcheck/api` provides check items and working directories, and `POST /healthcheck/api/run` runs commands or quick checks. The frontend development server and the preview server used by Windows one-click startup forward `/healthcheck` to the backend. You can also access the backend address directly, for example `http://127.0.0.1:8000/healthcheck`; when using a custom reverse proxy, forward `/healthcheck` and its sub-paths to the backend.

After login, "Command Execution" is shown by default. Choose the project, runtime logs, collection output, project data or update state directory, and optionally enter a relative or absolute path to an existing subdirectory within it; the page shows the full startup directory. Enter a command in the PowerShell box and click "Run command" or press Ctrl+Enter; the backend actually launches the built-in Windows `powershell.exe` and returns standard output, error output, exit code and timeout status. Example buttons only fill in the command and never run it automatically.

The command box supports free-form PowerShell commands, pipelines, multi-line scripts and external programs, with no restriction on command names. For example `Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 Id,ProcessName,CPU`. Commands run with the backend API service account's existing Windows permissions, without extra elevation, and modifying operations are allowed. The selected directory only determines where the process starts; scripts can change directory or access any absolute path the service account can access. Each run is independent and does not keep variables or the directory from the previous command.

Command text is limited to 16,384 characters, each run lasts at most 15 seconds, and at most 256 KiB of combined standard and error output is kept; exceeding the timeout or output limit terminates the command and its child processes. The initial working directory must exist within the selected directory, and directory junctions or symbolic links are not accepted. Background processes explicitly started may keep running after a normal finish, but their later output is not collected; the result indicates whether output was not fully collected. Command content and output are not written to the diagnostic audit log.

File queries in quick checks use the project directory, runtime log directory and collection output directory determined by the server, and the page takes relative paths. The log directory corresponds to `darkweb_collector/.runtime/windows/logs`, and the collection output directory follows the project's current configuration. Directory entries can be clicked to open; sensitive files, hidden directories, database files, symbolic links and Windows directory junctions are never exposed.

“Quick Checks" keeps the fixed read-only queries. Source queries read the start of a file and log queries read the end of a file, scanning at most 256 KiB each time; directory, process, port and file content queries return 200 items or lines by default, adjustable from 1–500. Keywords match plain text; directory queries match file names. Reaching the scan or return limit shows a truncation notice, and a log keyword query does not mean the whole file was searched. Common sensitive fields such as passwords, authentication headers, cookies and tokens are filtered, and the diagnostic log only records the operator, check item and result status, not the query content.

Diagnostic APIs always require administrator login and are not opened even when `DARKWEB_API_AUTH_DISABLED=1` is set. Database checks in quick checks use a read-only connection, and queue checks never take out or delete tasks. A worker health snapshot without errors does not mean all workers are online.

The module runs inside the existing backend API; when the backend is stopped or the website is unreachable, troubleshooting must still go through your existing server operations channels.

## One-click startup

### WSL / Linux

```bash
bash darkweb_collector/scripts/start_all_services_wsl.sh start
```

Common commands:

```bash
bash darkweb_collector/scripts/start_all_services_wsl.sh start
bash darkweb_collector/scripts/start_all_services_wsl.sh status
bash darkweb_collector/scripts/start_all_services_wsl.sh attach
bash darkweb_collector/scripts/start_all_services_wsl.sh stop
```

WSL / Linux The script prepares the backend virtual environment, frontend dependencies, Redis, Playwright, a local PostgreSQL 16 migration target, the runtime database and Tor bridge runtime components, and brings up the API, frontend, workers, scheduler and other services; when an external PostgreSQL is explicitly configured, local installation is skipped.

### Windows

For normal use you only need to double-click one entry point:

```powershell
.\darkweb.cmd
```

The first run lists the available local disks and free space; enter a drive letter such as `C`, `D` or `E`. Business data and program versions from future online updates are placed on the chosen drive automatically and the configuration is saved, then dependency installation and startup continue; afterwards you only need to run `darkweb.cmd` and it will not ask again. Choosing the system drive uses `%LOCALAPPDATA%\DarkWebThreatIntel`, and choosing another drive uses `<drive>:\DarkWebThreatIntel`. The current version still runs from the release package's extraction directory; if you want the program itself on the chosen drive too, extract the release package to that drive first.

If existing managed data is detected during first configuration, the script automatically switches to a safe migration: it stops services, copies files one by one with SHA-256 verification, restores the old configuration if switching fails, and keeps the old directory for review. Only when you need to change the data drive again later do you use the advanced migration tool to pre-check and migrate:

```powershell
.\configure-data-root.cmd plan -DataRoot D:\DarkWebThreatIntel
.\configure-data-root.cmd migrate -DataRoot D:\DarkWebThreatIntel
```

After re-testing database queries, lists, details, mirror downloads and new collection writes, run the controlled cleanup:

```powershell
.\configure-data-root.cmd cleanup
```

The cleaner re-checks the old copies against the per-file SHA-256 manifest saved during migration, confirms the files in the new directory still exist, then asks you to type `CLEANUP` and deletes only unmodified old data. Do not manually delete the whole `%LOCALAPPDATA%\DarkWebThreatIntel`, which still contains small control configuration, command entry points and the encrypted PostgreSQL target configuration.

Output or database paths that were explicitly specified in an existing environment and were already outside the old data root are kept, to avoid silently rewriting business data references during migration; the `status` command and the frontend storage card mark these external paths as "Some data is still in other directories".

Application version directories are separate from business data. The default is `DARKWEB_APP_ROOT=<data root>\app`; when migrating existing data, the running Release is not copied and the current version stays in its old location temporarily, and only the next one-click update writes to the new application root. To put program versions on another dedicated drive, set `DARKWEB_APP_ROOT` explicitly before migrating or starting.

Automated deployments can also pass the data directory explicitly to skip the interactive selection:

```powershell
.\darkweb.cmd install -DataRoot D:\DarkWebThreatIntel
```

You can also call the PowerShell script directly:

```powershell
%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -ExecutionPolicy Bypass -File .\darkweb_collector\scripts\start_all_services_windows.ps1 start
```

Install the environment without starting services immediately:

```powershell
%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -ExecutionPolicy Bypass -File .\darkweb_collector\scripts\start_all_services_windows.ps1 install
```

After installation, reopen PowerShell or CMD and you can use:

```powershell
darkweb
darkweb status
darkweb stop
```

Windows The script reuses a reachable explicit `REDIS_URL` first. When no service is configured, it automatically downloads and verifies Microsoft Garnet 2.2.1 and a project-private .NET 10.0.11, listens on `127.0.0.1:6380` and always uses DB 0, no longer requiring Memurai Developer to be installed via `winget`. For new installations, Garnet checkpoints, AOF, SQLite, migration batches, evidence mirrors and caches all use the configured data root, with a background checkpoint every 6 hours by default; see [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) for full third-party licenses.

Each time the project-managed Garnet is started or taken over, the Windows launcher automatically applies CPU affinity and `BelowNormal` priority: it selects roughly the second half of the originally available logical CPUs, reapplies the setting after process restarts, and repeated starts do not keep halving it. This policy follows the original CPU-limiting script and its original settings saved per PID/start time; it requires 64-bit PowerShell, a single processor group and 1–64 logical CPUs, and with only one CPU it can only lower the priority. The CPU limit does not set a memory cap.

Windows Collection workers in one-click startup are managed by a background daemon that checks processes and queue types every 15 seconds and retries unexpected exits with back-off from 15 seconds to 5 minutes. A worker is marked running only after Celery is ready; an offline daemon, a worker that is not ready or an abnormal queue type shows the error reason on the sites that depend on that queue. When the queue type is abnormal, data is not deleted automatically; preserve the state and handle it specifically before recovering. Daemon state is in `darkweb_collector/.runtime/windows/worker-health/` of the current release, and logs use each worker's own log. This mechanism does not replace fixes in Garnet itself, nor does it guarantee that stuck but still alive tasks have recovered.

Windows Online updates protect the updater and the service-stop execution chain, stopping old services one by one by process identity. The "System update" check in Healthcheck can read the restricted, redacted update log. If an update from an old version was interrupted while stopping the API, use the one-time recovery tool attached to the Release and launch the upgrade separately from an administrator PowerShell; the tool keeps a persistent queue backup and verifies a clone, without clearing data automatically.

The historical failure section of the task list shows records from the last 7 days, 30 per page, and search covers all failure records in that time range. Report time sorting in intelligence search matches the time shown in the list; on first startup, canonical times of old records are backfilled in batches of 500 and the full-text search sort index is synced, so first initialization of a large database may take longer than usual.

For a brand-new PostgreSQL installation, the program files are still installed by EDB into the system program directory, but the database cluster is created at `<data root>\postgresql\16\data` via the official `--datadir` parameter. An existing PostgreSQL service is reused and is never copied or rewritten directly by the script; if its cluster is still on drive C, `darkweb status` and the data migration page show a clear warning, and you need to perform a PostgreSQL backup and restore separately before freeing the old cluster's space.

Use `DARKWEB_GARNET_CHECKPOINT_INTERVAL_SECONDS` to adjust the background checkpoint interval, with a minimum of 300 seconds; offline deployments can point `DARKWEB_GARNET_ARCHIVE_PATH` and `DARKWEB_DOTNET_RUNTIME_ARCHIVE_PATH` at downloaded official archives, and the launcher still performs the pinned hash verification.

The current managed Garnet path covers the Redis commands the project already uses, the Celery broker/result backend and state locks; it does not support being used as a complete replacement for arbitrary Redis features. Do not introduce Redis Streams or non-DB 0 dependencies for this instance; external Redis, Valkey or other compatible services can still be configured explicitly via `REDIS_URL`.

## Safe uninstall

The "keep data" mode is used by default: it only stops project services and removes the `darkweb` command, the project virtual environment, frontend dependencies, runtime files and project-private Tor components; the database, collection output, login sessions and account configuration are kept and can be used again after reinstalling:

```powershell
darkweb uninstall
# is equivalent to
darkweb uninstall keep-data
```

To also delete the database, collection output, login sessions and account configuration, you must explicitly choose "completely delete data" and type `DELETE` when prompted; automated environments can add `-Force`:

```powershell
darkweb uninstall purge-data
darkweb uninstall purge-data -Force
```

WSL / Linux uses the same two modes:

```bash
darkweb uninstall keep-data
darkweb uninstall purge-data
darkweb uninstall purge-data --yes
```

Uninstall only handles paths explicitly managed by the project. Custom databases, output directories or Tor runtimes outside the project directory and default data directory are kept with a notice; the source directory and shared system dependencies such as Python, Node.js, external Redis or Docker are never deleted. On Windows, `keep-data` deletes the project-managed Garnet/.NET binaries but keeps checkpoints, and only `purge-data` deletes Garnet data; PostgreSQL clusters are always managed by their Windows service and are never deleted directly by project uninstall. Preview the operations with `-WhatIf` on Windows or `--dry-run` on WSL / Linux.

## One-click update

After logging in, the version menu in the top-right corner of the page provides a "One-click update" button. When clicked, the system:

1. Reads `latest-stable.json` from the stable update channel and compares release versions.
2. Downloads the release ZIP while the old services keep running, and verifies the manifest, download size and SHA-256; when a public key is configured it also enforces Ed25519 signature verification.
3. Safely extracts it into a separate version directory under `<DARKWEB_APP_ROOT>\releases` and prepares the new version's dependencies in advance; the default application root is `<data root>\app`.
4. Stops the old services, atomically switches `installation.json`, starts the new version and checks the API, frontend and all managed processes.
5. If the new version's health check fails, the old version is restored automatically; on success the page redirects to the login page automatically.

You need to log in again after the update completes. Windows online updates do not read `.git`, do not run Git commands and do not overwrite the database, collection output, cookies, account configuration, Tor or Garnet data. After first installing the transitional version that includes this updater, later versions can be updated entirely via the button; `darkweb.cmd` in the original installation directory automatically forwards to the current active version.

Windows Updates reuse a verified virtual environment based on the base Python interpreter identity, the normalized `requirements.txt` and a digest of installed package versions; old environments keep their original absolute paths, and new dependencies are created in separate directories under `<data root>\runtimes\python-envs`. The current version's environment binding is in `darkweb_collector/.runtime/windows/python-environment.json`, and old virtual environment directories that are still bound must be kept. Reuse checks dependency version ranges, imports and `pip check`, and never installs or upgrades in an old environment; a new environment is created only when one is missing, dependencies changed or verification failed, and first-time preparation or new dependencies may still need network access.

Frontend dependency comparison ignores the project's own release version number while keeping changes to dependency versions, download URLs, integrity and install configuration; a compatible and complete `node_modules` is copied locally into the new version, and npm reinstalls prefer the existing cache. Shared Playwright browsers are reused based on file and real launch checks, and reinstalls keep the old browser version for rollback. The new frontend is built before the old services stop, and on startup it is rebuilt only when the source, build environment or output has changed; directory junctions, symbolic links and invalid dependency records are rejected or no longer reused.

When switching from a plain source directory to a managed version directory for the first time, `installation.json` keeps referencing the original `darkweb_collector\output` to avoid copying large historical mirrors. Do not delete or move the original source directory until the mirrors have been moved to the new shared data location via the data migration feature.

Data root migration does not copy the running application version directory; after migration the current Release stays in the old application root temporarily, and only the next one-click update installs into the new `DARKWEB_APP_ROOT`. Do not manually delete the old application root until you have confirmed that the new version runs and rolls back correctly.

The default manifest URL is `latest-stable.json` in the repository's latest GitHub Release. You can point `DARKWEB_UPDATE_MANIFEST_URL` at an internal HTTPS update service, restrict allowed download domains with `DARKWEB_UPDATE_ALLOWED_HOSTS`, and disable button updates with `DARKWEB_SELF_UPDATE_ENABLED=0`. After configuring `DARKWEB_UPDATE_PUBLIC_KEY_FILE`, the Ed25519 signature in the manifest can be verified; production can also set `DARKWEB_UPDATE_REQUIRE_SIGNATURE=1` to reject unsigned release packages. The current Git-free release package updater supports Windows first; WSL / Linux still use the manual release upgrade process.

The repository's default Release pipeline never touches the signing private key, so default release packages rely on the GitHub HTTPS source constraint and SHA-256 integrity verification. When signing must be enforced, call `scripts/build_update_package.py --signing-key <private key path>` in a protected, separate signing environment, deliver the corresponding `update-signing-public.pem` to clients with a transitional version first, and then enable `DARKWEB_UPDATE_REQUIRE_SIGNATURE=1`.

## Database and mirror file migration

Administrators can import `.dwti` files generated by the external tool under "Configuration Center → Data Migration". The migration package contains both SQLite data and evidence mirrors; the backend first completes safety pre-checks, per-table import, digest re-checks and mirror extraction in a separate PostgreSQL schema, and only switches the active database and mirror directory after everything matches and you confirm again.

Windows and Debian / Ubuntu / WSL / Codespaces automatically install or reuse PostgreSQL 16 on first startup and create a project-specific database and account; existing SQLite data is never deleted or overwritten automatically. Windows downloads and verifies the official EDB installer of a pinned version directly, without depending on `winget` or Microsoft App Installer; offline deployments can point `DARKWEB_POSTGRESQL_INSTALLER_PATH` at a pre-downloaded installer, and the pinned SHA-256 verification still applies. On Linux the application password is stored in a configuration file private to the current user with mode `600`; when an external PostgreSQL URL is set explicitly, no local service is installed. The old system's offline packaging and verification tools and `.dwti` packages continue to be stored separately outside the project directory. See [`darkweb_collector/DATA_MIGRATION.md`](../darkweb_collector/DATA_MIGRATION.md) for the full process, rollback limits and capacity limits.

## Chaojiying CAPTCHA and Changan session keeper

Under "Configuration Center → Platform Onboarding" you can configure the "Chaojiying CAPTCHA service" and "Changan auto-login" separately. The Chaojiying configuration is a shared CAPTCHA service that other image-CAPTCHA login sites can reuse later; the Changan configuration only stores that site's account and password. The frontend never echoes the account, password or digest, and the configuration files are in the runtime output directory and never enter the Git repository.

You can also configure them with environment variables before starting the services:

```powershell
$env:DARKWEB_CHAOJIYING_USER = "<Chaojiying account>"
$env:DARKWEB_CHAOJIYING_PASSWORD = "<Chaojiying password>"
$env:DARKWEB_CHAOJIYING_SOFT_ID = "<Software ID, can be left empty>"
$env:DARKWEB_CHANGAN_USERNAME = "<Changan account>"
$env:DARKWEB_CHANGAN_PASSWORD = "<Changan password>"
```

Chaojiying uses CAPTCHA type `5000` by default, which supports the Chinese, English, numeric and arithmetic image CAPTCHAs in the Changan login flow; slider, click-to-select and QR code verification are not handled. When recognition is wrong, the login flow calls the Chaojiying error-report API to get the points refunded.

The scheduler checks the Changan session independently every minute, without waiting for the collection task to be due. When the session is found to be invalid or past its expiry time, it immediately performs automatic login and saves the new session; after a failure it cools down for 5 minutes before retrying. When the Changan API returns an authentication failure during collection, it also tries to recover the session and retries the original request once.

## GitHub Code monitoring

In `auto` mode code monitoring prefers the authenticated GitHub code search API. When the API is not configured or temporarily unavailable, manual scans continue to use the existing logged-in browser channel; long-running background scans never start a browser automatically.

PowerShell Configuration example:

```powershell
$env:DARKWEB_GITHUB_CODE_SEARCH_MODE = "auto"
$env:DARKWEB_GITHUB_TOKEN = "<GitHub App installation token or fine-grained token>"
```

On the "Code Monitoring" page click "Configure GitHub App" and enter the App ID, Installation ID and private key; the service verifies the installation status and automatically issues and refreshes the installation token. The private key is stored in the Git-ignored runtime data directory and is never written to the database, scan results or API responses; on Linux the configuration file mode is `0600`.

An external process can also keep maintaining a token file; the collection service re-reads it on every request, with no restart needed:

```powershell
$env:DARKWEB_GITHUB_TOKEN_FILE = "C:\ProgramData\DarkWebThreatIntel\github-token"
```

Tokens are only kept in memory or read from environment variables or runtime files, and are never saved to the database, scan results or the Git repository. Available modes:

- `auto`: Uses the API when a token exists, and manual scans fall back to the logged-in browser when necessary.
- `api`: Uses only the API; returns a clear status when the token is missing or rate-limited.
- `browser`: Keeps the original logged-in web search method.

The system sends GitHub API requests serially, reads rate-limit response headers and enters cooldown, and reuses identical queries within a short period. GitHub global code search still only covers each repository's default branch; non-default branches cannot be fully discovered through global search.

The system does not rotate multiple personal accounts to get around GitHub limits. When you need to isolate different customers' authorization scopes, configure a separate GitHub App for each collection instance.

## Social platform monitoring

“Social Platform Monitoring" lets you set company aliases, risk terms and search terms for monitoring targets, periodically discovers single X/Facebook posts that public search engines have indexed, and keeps original post completion, deduplication, scan status and manual review records. It does not use account pools and does not claim to cover entire platforms. See the [social platform monitoring notes](../darkweb_collector/SOCIAL_MONITORING.md) for sources and runtime limits.

## Tor Bridges

The frontend provides a Tor bridge configuration page. When enabled, the backend generates a separate `torrc`, starts a local Tor process and provides a local SOCKS proxy to the collection logic.

Default SOCKS address:

```text
socks5h://127.0.0.1:9050
```

Windows The script automatically installs, and checks daily, a project-private Tor Expert Bundle from the official Tor Project release source, updates the built-in bridge configuration from the corresponding official build tag, and writes:

- `DARKWEB_TOR_EXECUTABLE`
- `DARKWEB_TOR_TRANSPORT_EXECUTABLE`
- `DARKWEB_TOR_PT_CONFIG_PATH`

The default installation location is `<data root>\tor-expert`. A local Tor Browser is only a compatibility fallback when automatic installation fails; the project never reads its `Browser/omni.ja`. Set `DARKWEB_TOR_BRIDGE_AUTO_INSTALL=0` or `DARKWEB_TOR_BRIDGE_AUTO_UPDATE=0` to disable runtime installation or update checks respectively.

## Runtime data

Windows Runtime data is all located in the directory specified by `DARKWEB_DATA_ROOT`; when not configured, `%LOCALAPPDATA%\DarkWebThreatIntel` is used. The main directories include:

- `<data root>\collector.db`
- `<data root>\output\`
- `<data root>\migrations\`
- `<data root>\garnet-data\`
- `<data root>\playwright\`
- `<data root>\app\` (default application root for future Releases)
- `<data root>\postgresql\16\data\` (for brand-new PostgreSQL installations)
- `darkweb_collector/.runtime/windows/`

WSL / Linux Default runtime data is located at:

- `$HOME/.local/share/bishe/collector.db`
- `darkweb_collector/output/`
- `darkweb_collector/.runtime/wsl/`

## Access URLs

After a successful startup, the default access URLs are:

- Frontend:`http://localhost:5174`
- Backend health check:`http://127.0.0.1:8000/api/health`
