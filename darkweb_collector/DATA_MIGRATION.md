# Integrated Database and Mirror File Migration

This feature does not rely on AI. An external command-line tool packages the old SQLite database and mirror directory into a single `.dwti` file; after an administrator uploads it on the project's "Data Migration" page, the backend completes pre-checks, isolated PostgreSQL import, data verification and a controlled switch-over.

## 1. Preparing the target PostgreSQL

First create a persistent PostgreSQL database and a dedicated account. The account needs permission to connect to the target database and create schemas, tables, indexes, foreign keys and functions. The importer never uses or overwrites the `public` schema; instead it creates a separate `dwti_<batch ID>` schema for each migration package.

Windows On first startup, if no target PostgreSQL has been configured, the startup script calls the project's built-in `scripts\setup_postgresql_windows.ps1` to automatically install or reuse PostgreSQL 16 and create the project database and account. When a target configuration already exists or PostgreSQL is already active, it does not reinstall or reset the password. This step only prepares the migration target and does not automatically switch or overwrite existing SQLite data. You can use the `plan` and `status` subcommands to preview or check respectively, without running an import:

```powershell
.\scripts\setup_postgresql_windows.ps1 plan
.\scripts\setup_postgresql_windows.ps1 status
```

Windows A new environment can place runtime data on a non-system drive before first startup:

```powershell
.\configure-data-root.cmd plan -DataRoot D:\DarkWebThreatIntel
.\configure-data-root.cmd apply -DataRoot D:\DarkWebThreatIntel
```

For existing data, use `migrate` instead of `apply`. The tool stops the project, copies only the database, output, migration batches, configuration, credentials and managed runtime data, verifies SHA-256 file by file, rewrites the data paths in `installation.json` in place and runs a health check. Installation pointers, update state and locks in the control root are not copied, and the current application version directory stays in the old application root; only the next update moves into the new `DARKWEB_APP_ROOT`. On failure the old configuration is restored, and the old directory is kept even on success. Only after re-testing lists, details, mirrors and new writes should you run `.\configure-data-root.cmd cleanup`; the cleaner re-checks all hashes and deletes only old data that was copied successfully. Never manually delete the whole control directory on drive C or the old application root. A brand-new PostgreSQL cluster is created at `<data root>\postgresql\16\data`; existing PostgreSQL clusters are never migrated by file copy, to avoid damaging a running database service.

Debian / Ubuntu / WSL / Codespaces Use `scripts/setup_postgresql_linux.sh` for the same first-time installation and idempotent checks. The script installs PostgreSQL 16 from the official PostgreSQL PGDG repository, verifies the official signing fingerprint, uses the local `postgres` system account to create the project role and database, and saves the application password to `postgresql-target.json` private to the current user (mode `600`):

When a Debian / Ubuntu release has been removed from the main PGDG repository, the script verifies the distribution `Release` file of the main repository and automatically switches to the official `apt-archive.postgresql.org` archive; if an explicitly configured repository is unavailable it does not silently fall back.

```bash
bash ./scripts/setup_postgresql_linux.sh plan
bash ./scripts/setup_postgresql_linux.sh status
```

When using an external PostgreSQL, set the target connection explicitly before starting the project; the startup script then does not install a local PostgreSQL. The connection string is a server-side secret; never put it in source code, the frontend or Git:

Windows PowerShell:

```powershell
$env:DARKWEB_MIGRATION_TARGET_DATABASE_URL = 'postgresql://<user>:<password>@127.0.0.1:5432/<database>'
.\scripts\start_all_services_windows.ps1 start
```

WSL / Linux:

```bash
export DARKWEB_MIGRATION_TARGET_DATABASE_URL='postgresql://<user>:<password>@127.0.0.1:5432/<database>'
./scripts/start_all_services_wsl.sh start
```

Automatic installation only supports Windows and Debian / Ubuntu / WSL / Codespaces using `apt-get`; other Linux distributions must explicitly provide an external target. Set `DARKWEB_POSTGRESQL_AUTO_INSTALL=0` to disable automatic installation on Linux. Everything installed automatically is a local single-node PostgreSQL with no cross-host high availability; the target service must remain accessible after the project restarts.

## 2. Generating a migration package on the old system

Stop collection tasks that produce large amounts of new writes, then run:

```bat
D:\path\to\database-migration-kit\tools\migration-export.cmd pack ^
  --database "C:\path\to\collector.db" ^
  --artifacts "C:\path\to\output" ^
  --output "D:\backup\darkweb-20260812.dwti"
```

Windows The graphical tool can directly select `\\wsl.localhost\<distribution>\...\collector.db` and the `output` directory in the same WSL distribution. The tool copies the database and its stable `-wal`, `-shm` and `-journal` side files to a Windows temporary directory and then creates a snapshot through the SQLite Backup API; if file sizes or modification times change before and after copying it aborts, so you must still stop the API, worker, scheduler and other database-writing processes in WSL first.

You can also copy the database snapshot and the complete `output` directory to Windows first and then package them, but you must keep all relative directories and file names under `output`; do not copy only a single site, flatten directories or create an extra `output/output` level.

The exporter follows this fixed process:

1. Creates a consistent snapshot through the SQLite Backup API, leaving the source database unchanged.
2. Brings the database schema up to the current version on the snapshot only, and runs `PRAGMA quick_check`.
3. Exports each table as database-independent JSONL data.
4. Converts WSL/Linux/Windows absolute paths in `html_path`, `screenshot_path` and `raw_artifact_path` to portable relative `dwti-artifact://` paths; packaging aborts if any non-empty path has no corresponding file in the selected mirror directory.
5. Writes the mirror directory into the same ZIP64 container and checks one by one that the database path references really exist in the package. When code/library mirrors contain Windows reserved device names, illegal characters, trailing dots or spaces, Unicode-equivalent names, over-long components or case conflicts, they are moved into a compatible directory with stable hash-based names and the database references are updated; dark web core mirrors without an explicit path field are refused for packaging in these cases.
6. Records the row count, null counts, XOR256 and SUM256 digests of each table, and generates a SHA-256 for each payload.

SQLite Index column order, uniqueness, partial index conditions and the `ASC` / `DESC` direction of each column are written to the schema manifest and created in the same direction in PostgreSQL. Expression indexes and non-`BINARY` custom collations are still safely blocked to avoid silently changing query semantics.

Platform sessions, cookies, tokens and credential directories are not packaged; session paths, session metadata and error text in `platform_sessions` are cleared. You need to log in to these external platforms again after migration.

## 3. Importing into the project

Log in with an administrator account and open:

```text
System Settings -> Data Migration
```

Select the `.dwti` file and click "Upload and start verification". The backend performs, in order:

- File name, path traversal, symbolic link, duplicate path, count, size and zip bomb checks;
- SHA-256 verification of all payloads;
- Item-by-item verification that database mirror paths match files in the package;
- PostgreSQL Table creation and batched import in a separate schema;
- Rewriting portable mirror paths to the new mirror root of the current migration batch;
- Table-by-table joint digest re-check of the database;
- Extraction of mirror files into a separate batch directory.

Only when the database and mirror files all verify consistently does the task enter the "Awaiting switch-over" state. A failed import does not modify the current active database or overwrite the current mirror directory.

## 4. Confirming the switch-over and rolling back

After confirming the switch-over, the project writes the new active version configuration and calls the existing startup script to stop and restart services. After the restart it checks the PostgreSQL schema fingerprint, migration version, database queryability and API health; if any step fails, the old active version is restored and started again.

The activation controller first clears `DARKWEB_COLLECTOR_DATABASE_URL`, `DARKWEB_COLLECTOR_DATABASE_SCHEMA` and `DARKWEB_COLLECTOR_OUTPUT_ROOT` inherited from the old process, and then the active version file selects the database and mirror directory again, preventing the file from existing while `/collector-output` still points to the old directory.

The active version configuration is located in the data root by default:

- Windows: `<data root>\active-release.json`
- WSL / Linux:`$HOME/.local/share/darkweb-threat-intel/active-release.json`

Linux PostgreSQL The target configuration is located at `$HOME/.local/share/darkweb-threat-intel/postgresql-target.json` by default, with directory mode `700` and file mode `600`; it contains the application database password, so do not copy it into source repositories, logs or tickets.

Migration batches, import reports and mirror directories are stored in the `migrations` directory under the same user data root. Batch directories still referenced by the current active version cannot be deleted; only after confirming that the database, lists, details, mirror downloads and new collection writes all work, and that the batch is no longer the current or rollback version, can the corresponding old batch be cleaned up. When switching from SQLite for the first time, the original SQLite file is not deleted; in later migrations, the previous active PostgreSQL schema and mirror directory are also kept.

If the new PostgreSQL has already received business writes, rolling back to the old SQLite or old schema loses those new writes; automatic startup rollback must not be treated as a long-term dual-write or database merge solution.

## 5. Configuration options and limits

- `DARKWEB_MIGRATION_AUTO_RESTART=0`: Only writes the active configuration after import, without automatically calling the startup script.
- `DARKWEB_DATA_ROOT`: Unified Windows data root; a dedicated directory on a non-system drive with ample capacity is recommended.
- `DARKWEB_MIGRATION_MAX_BUNDLE_BYTES`: Upload file size limit, default 20 GiB.
- `DARKWEB_MIGRATION_MAX_UNCOMPRESSED_BYTES`: Total size limit after extraction, default 100 GiB.
- `DARKWEB_MIGRATION_MAX_ENTRIES`: Migration package entry limit, default 250,000.
- `DARKWEB_MIGRATION_MAX_ROW_BYTES`: JSONL limit for a single database record, default 64 MiB.
- Windows Final mirror paths are limited to 259 UTF-16 units according to the traditional runtime compatibility limit; overly deep directories abort and clean up the batch before files are extracted, so shorten `DARKWEB_MIGRATION_ROOT` or the user data directory.
- This is currently a full-replacement migration, without data merging or incremental sync between two databases.
- Migration packages generated by old tools without `portable_path_fields` metadata can still be verified and imported, but existing absolute paths are not rewritten automatically; when code monitoring or library monitoring mirrors are involved, regenerate the migration package with the new tool.
- SHA-256 is used to detect corruption and tampering and does not authenticate the publisher; only import migration packages from trusted sources.

## Completed verification

2026-08-12 Full verification with current real data in an isolated PostgreSQL environment: 33 business tables, 25,197 rows and 6,937 mirror files were all imported, totaling 897,376,770 bytes of mirrors, with the longest Windows path at 294 characters; another 416 session or sensitive files were excluded by rule. Per-table row counts, null counts, XOR256 and SUM256 all matched, and the number and bytes of extracted mirrors also matched the manifest. The project's database adapter layer could read the main API data and completed one write with `lastrowid` and a transaction rollback. The frontend production build, migration API authentication, Windows startup script parsing and WSL shell syntax checks all passed.

2026-08-18 Additionally verified local staging and read-only snapshots of WSL SQLite from Windows via `\\wsl.localhost\Ubuntu\...`; a small migration package with 5 WSL absolute mirror path fields completed export, in-package path checks, a real PostgreSQL import, target root rewriting and per-table digest re-checks, and missing mirror files were rejected at the export stage. The temporary PostgreSQL schemas and mirror extraction directories created for verification were cleaned up.

2026-08-19 A regression was completed with two `code_monitoring` HTML mirrors in WSL ext4 that differ only in case and have different content: the migration package generated different stable archive names for the two files and the database paths were updated accordingly; after extraction on Windows and import into PostgreSQL, both contents were kept, both paths were under the new mirror root and the digest re-check passed. A Windows file name compatibility regression was then added, covering reserved device names, colons, trailing dots or spaces, Unicode NFC equivalence conflicts and over-long components; all explicitly rewritable code/library paths were converted to safe archive names, and incompatible dark web core paths were refused for packaging per the safety boundary.

2026-08-19 A final regression was completed with real SQLite and `output.zip` supplied by the user: the source database had `quick_check=ok` and 0 foreign key errors, with 38 original tables and 222,642 rows; after the snapshot upgrade 39 tables were generated, and the two descending `ai_aggregation_runs` indexes were kept as `DESC` in PostgreSQL. The 29,556 files and 2,830,679,096 bytes of the ZIP passed CRC; after excluding 9 session or sensitive files, 29,547 mirrors totaling 2,830,630,704 bytes went into the migration package, and the 4 files involved in two Windows path conflicts were safely renamed. PostgreSQL per-table digests, full SHA-256 of the 29,547 extracted files, 30 samples each of JSON/HTML/PNG, DragonForce/Lynx list and detail mirrors and the renamed code details all passed. The deep-directory test was clearly refused and cleaned up before file extraction, and the short default runtime directory completed the import.
