# Garnet 2.2.1-dwti.4

This is a DWTI project patch compiled from Microsoft Garnet v2.2.1 and verified locally; it is not an official Microsoft release binary. The component and the application are released separately, and servers are updated by their operators.

dwti.4 Fixes the save and restore contract of object checkpoints: the serialized byte count is reset per record, and empty objects explicitly write a one-byte Null marker; overflow keys with inline values no longer write an object marker by mistake. Recovery respects in-page start and end boundaries and no longer reads the first half of a page that has already been excluded. Unregistered object types fail explicitly instead of being silently dropped after returning null.

Zero-length objects in old checkpoints are discarded in recovery memory only when rebuilding the index chain can prove that a valid version with the same key at a higher address exists. A latest version that is empty, a replacement version that cannot be verified, an unknown format or actual truncation still block startup. This compatibility handling does not modify input backups, does not clear queues and does not turn off `fail-on-recovery-error`.

Three superseded zero-length objects were found in the faulty checkpoint this time. The old component reproduces the original recovery exception on an unmodified copy; all keys, types, values and queue order after recovery with the candidate component match an independent local reference copy that only discards these three historical records. This proves the direct failure condition; it cannot be used to reconstruct the timing of every past write in production, nor to claim that all historical corruption can be repaired automatically.

Keeps the dwti.1 producer notification lock-order fix and the dwti.2 session lifecycle fix: timed-out initialization events no longer access old storage sessions, consume messages or delete new observers on the same connection; storage destruction cancels observers first and promptly cleans up stale references in all key queues. Blocking reads and AOF commit waits check for client disconnects, covering plaintext TCP, TLS, disconnects with pending commands and input half-close. Live connections still only receive a success response after the required commit completes.

dwti.3 Fixes AOF transaction writing and recovery: internal transactions that have started are still closed when the `RENAME` source does not exist or the `RENAMENX` target already exists; reading a valid transaction abort record from a single log no longer accesses the multi-log-only sequence manager. When a full single-log recovery of standalone DB0 has incomplete transactions, a native checkpoint is created for the committed state before connections open, and new session writes are allowed only after the log start has been persisted, preventing restarts from reusing session numbers and attributing later writes to old transactions. A checkpoint failure or a failure to write the log or recovery metadata blocks this recovery flow from continuing.

The recovery checkpoint is triggered only after a fully successful replay that actually scanned to a frozen tail with the tail unchanged; no incomplete transactions, partial replay, clusters and multiple logs do not take this branch. Log truncation commits now publish their state only after the recovery metadata is written, and metadata or truncation errors are propagated to waiters and reject subsequent commits; fast commits that do not advance the log start keep their original behavior. Corrupted logs that already contain nested transactions are still strictly rejected and the data must be verified and recovered separately first; the official component has no recovery switch to skip bad records. Old production logs cannot prove all the trigger conditions of the original interruption from transaction headers alone.

The production event with 7,367 threads left no thread stacks this time, and its full trigger conditions have not yet been directly proven. Local deterministic regressions confirmed resource-retention mechanisms such as infinitely blocking disconnects, expired events accessing old sessions and commit waits lacking disconnect cancellation; control runs with a normal 1-second BRPOP and normal AOF commits both passed. The AOF stall test deliberately paused the local fixture's commit task, so it cannot be concluded that production commit tasks ever stopped.

Source basis: upstream tag `v2.2.1`, commit `b0255a31de95b1e903ee187feb59ceb04819a639`. The SHA256 of the [official source archive](https://github.com/microsoft/garnet/archive/refs/tags/v2.2.1.zip) is `29d682d40e1e9e715201097d438016729224794de1684ca90ba9365c936a0fb1`. See [build.json](build.json) for the SHA256 of the patch and delivered files, and [LICENSE.txt](LICENSE.txt) for the upstream license.

## Build

Use .NET SDK 10.0.400, Python 3.11 or later, and the original source ZIP above. The build tool first checks the SHA256 of the source ZIP, the patch and all modified files, then builds with a fixed source mapping and deterministic compiler settings; the output directory must not already exist. Delivery is refused if the runtime files or final ZIP do not match the locally verified output.

```powershell
python scripts/build_garnet_component.py `
  --source-archive 'D:\build\garnet-v2.2.1.zip' `
  --sdk 'D:\tools\dotnet-sdk-10.0.400\dotnet.exe' `
  --output-dir 'D:\build\garnet-2.2.1-dwti.4'
```

The patch applies to the original upstream tree without project patches. The patch has been verified to apply, and after applying it the byte digests of all seventeen files match the actual build source; rebuilding from the original ZIP in a separate directory produced identical digests for the full runtime and the final component ZIP.

Running requires .NET 10; this verification used 10.0.11. The archive is named `garnet-2.2.1-dwti.4-win-x64.zip`, and its root contains `LICENSE.txt`, `README.txt`, `garnet-build.json` and `net10.0/`. Copy the whole runtime tree; the actual fix touches `Garnet.server.dll`, `Garnet.common.dll` and `Tsavorite.core.dll`, so replacing only the exe cannot deliver the fix. The launcher verifies the exe and the three DLLs separately and rejects old manifests and missing, old or tampered DLLs. Packaging excludes `testcert.pfx`, `.snk`, `.pdb`, source code, tests, logs and native libraries for other platforms.

## Local verification

Test processes use newly created loopback ports and isolated data directories. Production backups were copied through read-only diagnostics with digests checked, and recovery was always done on local copies only; production services, configuration and data were not modified.

dwti.4 Local regressions:

- Deterministic control of saving again after serializing Null: the old version wrongly reused the previous object's length; a single-object fixture saved, exited, recovered and saved again normally, writing the length from 1 to 0, and recovering again produced the original exception, without forced termination. The new version keeps one byte across four consecutive rounds. The fixture verifies the storage/serialization contract and does not claim to reproduce the full production RESP write timing. Four kinds of input, latest zero-length objects, unknown types, unregistered custom types and actual truncation, are all strictly rejected.
- Six rounds of normal checkpoint/exit and forced-interruption recovery, comparing all types and values, queue order and unacknowledged indexes round by round; 30 consumed and acknowledged messages did not come back. With 32 MiB of memory and disk-tiered storage holding 92 MB of multi-page data, 2,380 keys stayed consistent across three consecutive save/recover rounds.
- After verifying the archive SHA256 and the CRC of all ZIP entries, the complete backup of the real fault (checkpoint and AOF) reproduced the old version's exception on an unmodified input copy; the new version's recovery matched the independent reference key by key, by type, by full value and by queue order, and three consecutive save/recover rounds passed. Across multiple restarts, only TTL keys whose absolute expiry had passed were allowed to disappear naturally; persistent queues and unacknowledged tasks were not allowed to disappear.
- Real Garnet with active release processes verified the production PowerShell shutdown logic: stop writers first, then confirm commits, and finally decide whether to keep or terminate the queue process. Commit failures and shutdown failures never clear the queue or mask errors.
- SQLite and isolated PostgreSQL update/rollback verification used real signed manifests, downloaded ZIPs, hashes and HTTP health checks, with service startup faults injected by a controlled fixture. When the health check failed after the new version wrote data, rollback still kept the newly added intelligence.
- Integration of the real old and candidate APIs, each with its own built Vite frontend, native Garnet and Kombu: after two full restarts and running the production rollback function, searches, details and HTML evidence of both old and new SQLite intelligence remained readable, acknowledged consumed items did not come back, and queued and unacknowledged items were fully preserved. Actually serving old frontend assets was rejected by the new health check. This scenario replaced the launcher installation steps with self-built processes and did not register a user environment, start clearnet site crawlers or perform browser rendering acceptance.

dwti.3 Local regressions:

- Five kinds of restart scenarios each with and without an existing native checkpoint: reusing a session number after an incomplete transaction to write an ordinary key or a full transaction, a valid Abort, no incomplete transactions, and strict rejection of existing nested transactions. Before the new process became READY, the checkpoint and persisted log start had moved past the old tail; two subsequent cold starts kept the data and did not create duplicate checkpoints. The originally released dwti.2 could read the new checkpoint and later writes in all four scenarios.
- Two real same-connection command sequences reproduced the old version's problem: a missing RENAME source and an existing RENAMENX target, followed by a normal MULTI/EXEC. After the fix the start and end records match, and command returns, data and cold starts are consistent.
- Foreground checkpoint metadata write failures, AOF flush errors, commit metadata blocking and disk write errors were all verified with controlled I/O faults. When blocked, recovery does not confirm early; after a failure the current wait and later commits report errors, and queued callbacks cannot skip past the error; the normal fast-commit control kept its original behavior.
- Real recovery verification without listening covered partial replay, cluster configuration and dual replay tasks on a single physical log; the new checkpoint logic did not trigger in any of them. The existing metadata rewrite behavior of dual replay tasks matched dwti.2; for multiple physical logs and multiple logical databases only the exclusion conditions were checked, and no full cluster verification was performed.

The following are the existing local verification records for dwti.2:

- Nine lifecycle and commit-stall regressions: expired initialization, later observer registration, destroyed storage sessions, finite and infinite blocking disconnects, pipeline disconnects, live-connection pipelines, input half-close and disconnect cancellation after pausing local commits; no completed observers were left behind.
- Real Kombu/collection tasks: 101 normal details completed, and after migrating 543 old messages 545 details completed, with recent items prioritized, a concurrency window limit of 2, zero duplicates and zero unacknowledged leftovers.
- 15 minutes of continuous transactional send/receive, repeated disconnects and periodic checkpoints completed 82,620 tasks and 31,184 active disconnects with zero duplicates and no unacknowledged leftovers. Peak thread sampling was 42, dropping to 16 when idle; private memory in the steady phase was 66.5–88.6 MiB. After AOF recovery, the business queue, metadata and unacknowledged index of the whole run had no leftovers, and the pending and unacknowledged canaries were kept.
- Twenty-two offline launcher checks: full candidate package extraction, rejection based on three hashes and the manifest, ownership recognition and side-by-side preparation of the old dwti.1, normal startup refusing the old component, reuse of a valid .NET and repair of a damaged one; no real service start or stop was performed.

## First safe upgrade and later rollback

The application manifest requires `minimum_updater_version=2`. An old updater must reject this manifest before stopping services; an old updater that is already running does not become the new version just because it downloaded the new package. When releasing, first publish the `garnet-2.2.1-dwti.4` component with matching digests, then publish the application package using protocol 2. The application Release workflow downloads and verifies the published component, and blocks the application release if it is missing or the digest does not match. This branch itself does not create component or application Releases.

For the first migration from protocol 1, after the new application Release is published, extract the verified application package into the managed `DataRoot\app\releases\<new version directory>` and run from that package:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File 'D:\DarkWebThreatIntel\app\releases\<new version directory>\darkweb_collector\scripts\safe_upgrade_windows.ps1' `
  -DataRoot 'D:\DarkWebThreatIntel'
```

The bootstrap script checks the current installation record and directory, prepares dependencies first, and then the new updater verifies the published manifest, signature, version and archive. If the target still uses the old protocol, migration is refused and the current services are kept. Later protocol 2 updates can continue to use the page's update entry. When preparing the component offline, point `DARKWEB_GARNET_ARCHIVE_PATH` at the corresponding complete ZIP; the manifest and application package downloads of the first bootstrap still follow the existing verification rules, so this is not a fully offline installer.

The new manager also uses the new shutdown logic when stopping the old application; the Garnet process is kept when the component is the same and healthy. When a component upgrade requires a restart, it stops only after all writer processes have exited and the AOF commit address covers the log tail. When an update fails, it first confirms that the new application has stopped and then restores the old application pointer; the old application is started with the new manager and the repaired compatible queue runtime, without restoring the old SQLite snapshot over newly added records. Only compatible data structures declared in the manifest and verified are supported; this flow does not replace a separate recovery plan for incompatible database migrations.

After rollback, the registered `darkweb` command still points to the new manager and uses the old application directory as the service root. Do not run `.\darkweb.cmd` directly from the old release directory; that file is still the old manager and cannot be patched backwards by the new package. Test scripts, real backups, databases, logs and local component artifacts are not uploaded with the Git branch; merging, releasing and production deployment are performed separately.
