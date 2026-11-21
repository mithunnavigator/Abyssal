# Changelog

## v20261111.1.0 - 2026-11-11

The release branch is `main`.

- Unified intelligence search supports selecting multiple event types at once and combining filters for time, industry, region, country, threat actor, risk level and minimum risk score. Query results include per-category totals and last-24-hour statistics.
- An already-initialized PostgreSQL database is confirmed structurally complete through a read-only check. When initialization is required, it follows the lock order of the intelligence normalization pipeline, avoiding the reproduced deadlock between initialization and normalization.
- Static screenshot startup and execution now share a single timeout budget. A screenshot timeout cleans up that task's browser processes, keeps the already-parsed body text and records the reason the screenshot failed.

## v20261110.1.0 - 2026-11-10

Release branch:`main`

- Public forum body extraction supports original posts that contain only public images or media, storing media type, count and real attachment URLs. Media URLs are not mixed into body entity recognition, and existing body text and summaries for plain-text and image-and-text posts remain compatible.
- When the browser confirms an empty first post after its normal wait, the exact error reason is kept and retries back off progressively at 15 minutes, 1 hour and 6 hours. Lazy loading, attachment placeholders and unknown page structures keep their original validation boundaries.
- Image-backfill failures for the same body version back off progressively at 1 hour, 6 hours and 24 hours; an interrupted backfill keeps its accumulated retry state, and the schedule is recalculated when the body changes. Failures of old tasks do not delay an already-observed newer version, and existing body text and intelligence are kept.
- The existing database schema, queue protocol, ingestion transaction order, dependencies, Garnet component and update/startup flow are unchanged. Special embedded media and media URLs containing unencoded commas still report explicit errors; source certificate, CAPTCHA and over-long screenshot issues must be handled separately.
- Verification covered 16 real-browser entry scenarios each for Chromium and Firefox on Python 3.14.6 / Playwright 1.64.1, 35 retry and data-compatibility checks across SQLite and isolated PostgreSQL, plus parsing, pagination and rate-limit regressions. Tests used local simulated sources, so production collection results must be confirmed after updating; test scripts, mock data and runtime credentials are not included in the release package.

## v20261103.1.0 - 2026-11-03

Release branch:`main`

- Integrates the completed Spear and LeakForum public-board onboarding, reusing persistent tasks, newest-posts-first and capacity-based historical backfill. When a post body is restricted the explicit reason is kept; content is not automatically unlocked and attachments are not downloaded.
- Adds a 15-second page request interval shared across tasks and processes for these two sources. On hitting a rate limit or verification page, subsequent boards and fallback fetches stop and cool down for at least 30 minutes, or longer if `Retry-After` says so. Restarts and forced collection keep an active cooldown, and a single restricted post does not wrongly stop the whole site.
- Fixes HTTP fetching not reusing a verified browser session, inconsistent user agents and wrong status after verification redirects. Sessions are isolated per source and proxy, failed pages do not overwrite valid sessions, and recoverability after concurrent saves and interrupted writes is verified.
- Fixes quoted body text being removed, nested body text being truncated and replies polluting the original post on several forums; quote sources are distinguished and the correct first-post author and time are kept. Old posts returning 404/410 back off separately, and once the final browser has passed verification an earlier 403 no longer wrongly stops the whole site.
- When the body text is obtained but the screenshot fails, the body is kept and the pending-evidence reason is recorded; later evidence backfill reuses the session to load protected images. Static screenshots wait for the actual ready state, avoiding fixed delays and pointless waits when optional regions are missing.
- Removes the duplicate "Task History" and "Task List" entries from the sidebar; task history inside the collection overview and existing detail pages remain available.
- This release verified fetching, sessions, rate limiting, data retention and the update-package contract in local and isolated environments; live source availability still depends on actual runtime results. Releasing does not automatically deploy to or restart production servers, and test scripts, mock data and runtime credentials are not included in the release package.

## v20261102.1.0 - 2026-11-02

Release branch:`main`

- Fixes the site-wide recent-task window crowding out other sites' success and failure records; status, last success and consecutive failures are now calculated independently per site. Disabled, running, awaiting scheduling, waiting for resources and needs-attention reasons are shown separately, and list success no longer masks detail failures.
- Completes takeover of old task logs across versions, restoring placeholders after verifying process creation time, the managed process tree and database identity. Details from all sources are persistently queued first and released by capacity; busy and back-off states no longer trigger immediate re-dispatch loops. Clustered detail parse failures back off separately, newest-list discovery keeps advancing, and historical backfill resumes according to processing capacity.
- Fixes normal forum lists being misidentified because of a login box in the page header; error types and reasons from HTTP, fallback paths and the queue are preserved. Source shutdowns, entry-point migrations and browser verification pages are recognized; migration addresses are kept as pending-verification information, and existing body text and evidence are kept.
- Adds a collection overview: shows site scope based on the actual onboarding configuration, provides output trends, task throughput and backlog changes, and supports paginated filtering of site summaries and real task history. Entries for Site Management, Platform Onboarding, Sync Center and Runtime Environment are kept.
- Newly visible intelligence is recorded by first publication and deduplicated identity, so updates to existing data and full rebuilds are not double-counted. New-post and historical-backfill backlogs are sampled periodically; missing history is explicitly left blank with the covered time range noted. Site-wide metrics are not affected by list pagination or search.
- SQLite, isolated PostgreSQL, real Windows Job process trees, controlled stop/recovery ordering, page classification and browser integration verification passed. Test scripts, mock data and runtime credentials are not included in the release package; releasing does not automatically deploy to or restart production servers. Source shutdowns, verification restrictions and pending-verification migrations still need to be handled accordingly.

## v20261026.2.0 - 2026-10-26

Release branch:`main`

- Document libraries are now included in continuous monitoring, supporting library-only, netdisk-only and mixed sources. Tasks run with the sources, file types and advanced parameters that are enabled and actually selected for the current target, and the library candidate limit and detail switch are passed to scheduled scans.
- The page shows monitoring status and records according to the real scope returned by the backend. The scope of a running task is locked, and it must be stopped before the scope can be changed. Single scans keep a separate draft, and adjusting the monitoring interval does not accidentally carry over the single-scan draft scope.
- Each target's task starts and stops independently; enabling it again reuses the existing task, and changing the interval wakes it up and recalculates the wait time. After stopping, no further rounds are dispatched and it exits once the current round finishes; while winding down it shows "Stopping" and overlapping restarts are blocked.
- Remains compatible with the old netdisk API and keeps the original netdisk-only scope. Each round rechecks the target, profile and source configuration without automatically widening the scope; a netdisk source failure does not block document library sources.
- 75 controlled verifications covered real thread scheduling, SQLite scan records, API validation and authentication, and compiled browser interactions. All external sources used mock data and no production collection was run. After updating, re-enable continuous monitoring and confirm the sources; releasing does not automatically deploy to or restart servers.

## v20261026.1.0 - 2026-10-26

Release branch:`main`

- Netdisk and document library monitoring automatically generate base search terms from the current target's company name, aliases and domains. Profile expansion searches combine company identifiers with expansion terms and require the same document or file to satisfy the match conditions. Short-term protection, excluded aliases and domain boundaries are kept, and expansion terms by themselves are no longer treated as company identity.
- Match evidence is limited to a specific document body, a real file path or an explicit single-file title, excluding search-page echoes, recommendation areas, query-term fallback titles and cross-file concatenation. Historical hit records are kept, and the new rules apply to subsequent scans.
- Monitoring targets are now explicitly linked to exposure configurations, fixing multiple targets of the same organization sharing configurations, and expansion terms, source switches and policy drafts being overwritten by stale data when saving a target.
- Code monitoring can export the full main list and suppressed leads under the current filters, and can export the suppressed section separately. The full result set is retrieved at once, keeping code file links, repository links, suppression reasons, review status and discovery times with seconds and time zone. Code links are never guessed when missing, and no partial file is produced if the download fails or data is incomplete.
- Controlled verification covered company attribution, SQLite and isolated PostgreSQL persistence, API permissions, real browser CSV downloads and target-saving interactions; 503 synthetic samples exported completely, including 252 suppressed leads. Verification used synthetic data and simulated external sources and does not replace production collection verification.
- The release package uses the existing system update method and keeps existing data, configuration and history; releasing does not automatically deploy to or restart servers.

## v20261021.1.0 - 2026-10-21

Release branch:`main`

- The scan page uses a streamlined workbench layout: on the left, choose the monitoring target, netdisk and document library sources and file types; on the right, start scans, configure netdisk scheduled tasks, view records by date and open source execution details. Advanced settings are collapsed by default, keeping only the library candidate limit and library detail fetching.
- The candidate limit per library source and per search term is passed independently, so mixed scans do not change the number of netdisk pages traversed; old scan requests remain compatible. When there are no valid search terms or no source is selected, the page shows a clear message and blocks the empty scan.
- Newly added intelligence is now published incrementally from change records, covering onboarded sites and RansomLive; historical context is completed in bounded batches. Body text, search index, cache version and pending-notification state are committed together; failed notifications are left for retry and no longer block intelligence publishing.
- The intelligence list refreshes every 30 seconds while keeping the current filters, page number and scroll position; details still open in a new tab.
- Fixes collection failure classification, detail status and task ownership reclamation, limits pointless repeated retries, and keeps error boundaries for each site adapter and the browser lifecycle.
- Verification: 365 controlled backend regressions, 34 browser interactions and the frontend build passed, covering mixed-source scans, SQLite, isolated PostgreSQL, incremental atomic commits, notification retries, list-state preservation and opening details in new tabs. Collection and page verification used local synthetic data and simulated sources and does not replace production verification.
- The release package uses the existing system update method and does not include local test scripts, mock data or runtime credentials; releasing does not automatically deploy to or restart servers.

## v20261019.1.0 - 2026-10-19

Release branch:`main`

- The overview reads statistics fields by time window and only loads body previews for selected events. Cache hits bypass the build lock, task status refreshes independently, and startup warm-up now targets the current overview. The historical statistics basis is kept when there are no recent events, and special JSON content and single-connection database pools are supported.
- Historical details read body text by record primary key or exact URL first; the vulnerability list deduplicates and filters before loading content, and vulnerability details are located by CVE, reducing reads of unrelated body text.
- HTML Mirrors are displayed in an isolated iframe, supporting long-page scrolling and mobile layout while keeping screenshot-first display, download links and missing-resource notices; if the screenshot fails to load, an available HTML archive can be used instead. Mirror scripts and access to the parent page remain disabled.
- Completes body text for ransomware and vulnerability details, keeps the original vulnerability text, and filters error content returned by the translation service. When original text is available it is shown immediately as a fallback; when it is not, a clear prompt to resync the source is shown. When historical files are missing the reference is kept and marked unavailable.
- Country and industry recognition adds a conservative text pre-filter while keeping existing match results and priority rules.
- Verification: 21 local real-browser checks, the frontend build and SQLite and PostgreSQL regressions passed. For 45,678 synthetic records the current-window overview dropped from 24.54 s to 1.31 s, and historical fallback statistics from 22.30 s to 10.72 s; two full normalization runs verified that 55 new records were searchable, with peak private memory around 117.6 MiB. These measurements do not represent production latency.
- Normalization still runs in full batches, so new data must wait for the current round to commit; missing historical files or original text still need to be recollected. Repeated retries for the `NoGoods` source, empty bodies and load failures are not part of this fix. Publishing an update package does not automatically update production servers.

## v20261012.2.0 - 2026-10-12

Release branch:`main`

- Garnet The project component is upgraded to `2.2.1-dwti.3`, keeping the earlier queue lock-order, disconnect and session resource release fixes. Fixes internal AOF transactions missing an end record when the `RENAME` source does not exist or the `RENAMENX` target already exists, which caused later normal transactions on the same connection to be misidentified as nested transactions on restart.
- If a full single-log recovery of standalone DB0 finds incomplete transactions, it creates a native checkpoint for the committed state and waits for the log start to persist before opening connections, preventing the next process from reusing session numbers and swallowing normal writes or creating nested transactions again. Startups with no leftover transactions add no checkpoint; partial replay, cluster and multi-log recovery do not take this branch. Fixes a null reference caused by accessing the multi-log-only manager when the single-log reader encounters a valid transaction abort record.
- Fixes the commit state being persisted before the recovery metadata during log truncation. Commits that advance the log start now wait for the metadata write to complete; a metadata or truncation failure makes the wait and subsequent commits report errors, and a checkpoint failure does not proceed to open the service. Fast commits for normal non-truncating logs keep their original behavior.
- Windows The launcher adds a separate digest and manifest check for `Tsavorite.core.dll`, recognizes dwti.1 and dwti.2 managed instances for compatibility, and prepares dwti.3 side by side. Updates must deliver the complete component runtime.
- Local verification covered multiple cold starts after transaction interruption, retention of committed strings and queue data, early return of real RENAME commands, old dwti.2 reading new checkpoints, recovery boundaries, disk write errors and metadata blocking. Nested transactions in already-corrupted logs still fail strictly and require a dedicated, data-verified recovery; the official component contains no switch to skip bad records and no instance data. Releasing does not touch production servers.

## v20261012.1.0 - 2026-10-12

Release branch:`main`

- Garnet The project component is upgraded to `2.2.1-dwti.2`, keeping the previous producer notification lock-order fix. Blocking reads and AOF commit waits now respond to client disconnects and release processing sessions promptly; live connections still only receive a success response after the required commit completes, covering plaintext TCP, TLS, pipeline disconnects and input half-close.
- Fixes expired initialization events continuing to access ended or destroyed storage sessions, consuming messages or deleting later observers on the same connection. Initialization and storage destruction are synchronized through the observer lock, registrations are cleaned up by observer identity, and stale references are promptly removed from all key queues.
- API Full text of monitoring events is no longer kept resident in memory. The country and industry inference cache now uses a content digest as its key, the response cache is limited to an 8-entry LRU, and heavy response builds run serially to avoid concurrent cold requests repeating full reads. Full history, statistics and monitoring rule semantics are kept.
- Windows The launcher separately verifies the digests of the Garnet ZIP, EXE, server DLL and common DLL, uses a separate component directory, and recognizes the previous dwti.1 for compatibility. Update preparation can prepare the new component side by side with the old instance, and normal startup refuses to reuse the old component.
- Verification: 9 lifecycle and commit-stall regressions, 11 API memory and behavior regressions and 22 offline launcher checks passed. A 15-minute sustained load completed 82,620 tasks and 31,184 active disconnects with zero duplicates, zero queued and zero unacknowledged leftovers. Peak thread sampling was 42, dropping to 16 when idle, with private memory around 66.5–88.6 MiB in the steady phase. 200 tasks on a real Celery worker, Kombu/collection details and old message migration, FIFO, WATCH conflicts and AOF recovery all passed.
- Updates must deliver the whole component runtime tree; the fix touches both `Garnet.server.dll` and `Garnet.common.dll`. The component uses its own Release while the application Release stays at latest; a normal online update prepares the component and switches services by itself, with no manual DLL replacement needed. Old component Releases are kept for online rollback.
- This release does not touch servers. The production event with 7,367 threads lacks the thread stacks from the time; a triggerable resource-retention mechanism has been verified, but the complete on-site trigger chain cannot yet be directly proven, and local accelerated verification does not replace several days of production verification. High Windows StorSvc usage and page file settings must be handled separately.

## v20261010.1.0 - 2026-10-10

Release branch:`main`

- New posts now take priority over historical backfill. Per-site dispatch reservations, queued items and the execution window are together limited to twice the detail concurrency, and new work is dispatched into free slots after details complete. Historical list discovery advances according to remaining capacity, and completed pagination cursors are not automatically rescanned in the next round.
- Distinguishes short-term dispatch reservations, published queue entries and actual running leases. Queued items are no longer re-dispatched because a running lease expired; a failure only releases its own reservation, and late messages and fast-finishing workers are protected by token and version checks.
- When an old backlog message is delivered for the first time, it is transactionally returned to the database pending-fetch queue and the old delivery is ended, keeping version and evidence progress, then dispatched by the new window. Old messages are not re-delivered in a loop and historical candidates are not cleared. During migration, newly added work waits for at most the limited historical tasks that have already been granted permission.
- Builds project patch `2.2.1-dwti.1` on Microsoft Garnet 2.2.1: transaction producers deliver queue notifications asynchronously, eliminating the circular wait between queue key locks and observer locks, and handling missed wakeups when observers re-register after a timeout. The source patch, build provenance and license are in `patches/garnet/`; this component is distributed as a project patch.
- Windows The launcher pins the SHA-256 of the patch ZIP, EXE and actual server DLL and uses a separate runtime directory. During update preparation the patch can be prepared side by side while the old managed instance is still running, reusing the .NET that actually passed verification; a production start never silently reuses the old version, and external Redis services are kept. Dependency reuse, the Garnet CPU limit and diagnostics from `v20261010` are retained, along with existing data and checkpoint paths.
- Worker Status probing is moved out of the request cache lock and only one background probe is kept. Queue anomalies show "Status unknown" instead of misreporting an unknown state as having no worker. Connection and read timeouts are added; page requests and body reads end after 30 seconds and show an error.
- Verification: 25 backlog and task simulations, 7 real PostgreSQL concurrency and transaction scenarios, and 20 post-merge Windows runtime and upgrade preparation checks passed. The real patched Garnet with Kombu reclaimed 543 old messages and processed 545 details with no duplicate or unacknowledged leftovers. 180 concurrent transactional queue tasks, 64 FIFO tasks, WATCH conflicts, AOF restart recovery, status and request timeout regressions and the frontend build also passed. All collection verification used local synthetic data; no production fault injection or full real-site collection was performed.
- Deployment notes: the companion Garnet component uses its own release tag `garnet-2.2.1-dwti.1`, and the launcher verifies the download automatically; offline installation continues to support `DARKWEB_GARNET_ARCHIVE_PATH`. Merging and releasing do not automatically update production servers; the new code and patched runtime are loaded only after the service is upgraded.

## v20261010 - 2026-10-10

Release branch:`main`

Fix sources:`fix/update-runtime-reuse-garnet-cpu-20261010`

- Windows Updates reuse a verified environment based on the base Python identity, dependency files and a digest of all installed versions, remaining compatible with old in-place virtual environments. When dependencies change or the environment is damaged, a separate cached environment is created; old environments and per-version bindings are kept for rollback, and the unconditional pip upgrade during preparation is removed.
- The frontend dependency fingerprint ignores the project's own version, which changes on release, while changes to the dependency graph and install configuration still invalidate it. After verification the old `node_modules` is copied to the new version; if missing, installation from the npm cache is preferred. Directory junctions and symbolic links are rejected before any cleanup, copy or install.
- Shared browsers are reused based on file checks and a real launch check, so reinstall is no longer decided by a marker file inside the virtual environment; reinstalls keep the old browser version. The new UI is built before services stop, and unchanged source and complete build output are reused on restart.
- Each time the project-managed Garnet starts or is taken over, it is automatically restricted to roughly the second half of the originally available CPUs with `BelowNormal` priority. The original affinity is kept per PID and start time so repeated starts do not keep halving it; if the CPU setting fails, the new process is stopped and the failure is clearly reported.
- The updater in a shared Python environment continues to protect both levels of venv processes; worker commands explicitly carry the current collection directory so orphan process ownership and stop checks can still distinguish old and new versions.
- Healthcheck After login a free-form PowerShell command box is shown by default, supporting pipelines, multi-line scripts and external programs, and the command-name allowlist is removed. The full startup directory is shown and the project, log, output, data and update-state directories can be selected. Commands run with the backend service account's existing Windows permissions, and the initial working directory does not restrict the script's later file access.
- Administrator authentication and quick read-only checks remain separate. Commands are passed via standard input and support 16,384 characters; each run is limited to 15 seconds and 256 KiB of total output, exceeding either terminates the owning process tree, and background output after normal completion no longer leaves the API hanging.
- Fixes high CPU and a stuck API caused by the output-redaction regex repeatedly backtracking over large continuous text; when the input thread fails to start, the original error is kept and the process and pipes are closed.
- During upgrades existing dependencies are verified first, and installation happens only when dependencies change, are damaged or on first install. CPU affinity and priority are applied automatically by the new launcher when it starts or takes over Garnet. Publishing to GitHub does not automatically deploy to or restart servers.
- Provides a same-version, one-time recovery attachment for old installations whose update was interrupted, reusing the existing recovery flow and syncing this release's service-stop protection functions. Recovery stops services temporarily and keeps PostgreSQL, collected documents and the original queue, without automatically clearing the queue.
- Verification: 28 dependency fingerprint and path checks, 18 reuse/failure/rollback cases, 19 worker regressions and 25 updater/read-only diagnostics/unpacking baselines passed. 16 CPU limit and boundary checks, official Garnet 2.2.1 multi-instance and restart PING, and real service stop and orphan isolation with a shared interpreter passed. With network installs disabled, real Python/Node dependencies completed the new UI build and the original dependency tree SHA stayed identical. Dependency installation faults and business service fault injection used isolated stand-ins; no production server was deployed.
- Healthcheck Verification: 25 real API checks, 9 process lifecycle checks and 6 redaction performance checks passed; 12 fixed update diagnostics, 13 updater/unpacking regressions and real HTTP login and command execution passed. Coverage included free-form scripts, Chinese text on both output streams, native exit codes, administrator authentication, working directories, concurrency, the 15-second timeout and output limit, all using isolated local data and self-created processes.
- Page verification: 14 real browser function checks and 6 logout cleanup checks passed; desktop and 375px mobile layouts work and the console shows no errors. Test sessions, temporary services and credentials were cleaned up.

## v20261009.1.0 - 2026-10-09

Release branch:`main`

- Fixes updater protection when Windows updates stop services: the controller PID, start time and both levels of venv processes are explicitly identified, and the controller and service-stop execution chain are kept. Processes are terminated only after their identity is checked one by one, and the `taskkill /T` fallback that could also end the updater is removed. Normal services are still cleaned up as usual.
- When process status queries are restricted, the updater is no longer falsely reported as dead; when an abnormal exit is confirmed the last stage is kept, and the command log records the real exit code and the Windows hexadecimal exit code.
- Update commands explicitly pass the current data directory, preventing an old directory in the Windows user environment from overriding the directory specified by the updater and recovery tool.
- Healthcheck Adds a fixed "System update" diagnostic item that can read the redacted, restricted update state and the tail of `update.log`, without widening the command line's directory permissions.
- Provides a one-time recovery tool launched separately from an administrator PowerShell, which patches the old side's service-stop protection and then uses the verified official offline update package. The first upgrade from an old version still runs the old version's service-stop script; installations interrupted during service stop need to use this recovery method.
- After stopping services the recovery tool keeps a full persistent backup of the queue and verifies the queue and commit functions using a clone on a random loopback port; it does not automatically clear the queue or change production Garnet I/O parameters. If the clone fails, the specific stage is recorded and the original data is kept.
- Verification: 21 Windows service-stop protection regressions, 3 sets of real isolated process lifecycles, a two-version AST patch application matrix and 22 updater and log diagnostic checks passed. Real PowerShell orchestration verification covered preparation failure, version switching, startup-failure rollback and SQLite original data recovery. The Garnet cold clone also passed 12 safeguard checks and verification with about 100 MiB of data. No fault injection was performed on production servers.

## v20261009 - 2026-10-09

Release branch:`main`

- Patches the Playwright browser lifecycle: the owned Playwright driver still exits when closing the browser fails, and resources already created are cleaned up when startup fails midway, preventing later tasks on the same thread from repeatedly triggering Sync API / asyncio errors.
- Patches Windows worker daemon recovery: when process cleanup hits an insufficient page file or a query failure, the error is logged, the process identity is kept and the operation retried; a worker is recreated only after the old process is confirmed stopped, preventing the daemon from exiting or starting duplicates.
- Raises the Windows launcher's pinned official Garnet version and SHA-256 to 2.2.1; when restoring storage fails, startup stops and the original data is kept, preventing automatic updates from reinstalling the old version or running with an empty queue after a failed restore.
- Continuous web collection checks whether a site is due based on its last successful run and configured interval; the 20-minute interval for XForums now takes effect, while manual forced runs and failure cooldowns are kept. A submission failure for a single site is logged and other sites continue to be processed.
- Web, scheduled dispatch and local thread/process runs share the seed task submission flow: a task ID is allocated and the queue record committed first, then the task is published, and the queue status is no longer written back after publishing. A submission failure only updates its own reserved, not-yet-started record, preserving running, completed or retrying states; cleanup of expired tasks also checks the status and time read at the time.
- Local threads and the browser process pool pass the same task ID and force-run flag, and a failure is recorded when a process fails to start. After a queue publish error a second local task is not started automatically, avoiding duplicate execution when the message was delivered but acknowledgement failed; the local run mode is still kept when no queue worker is found.
- Verification: 23 browser lifecycle and daemon regressions passed, covering a real reproduction of leftover same-thread Playwright loops, startup and shutdown failures, injected WinError 1455, keeping processes when a stop is not confirmed, PID reuse and health status retries. Official Garnet 2.2.1 empty-directory start, 20 queue priority keys, BGSAVE and recovery after forced termination passed; memory exhaustion was not simulated and full-site collection was not verified on production servers.
- Scheduling verification: both original faults were reproduced before the change, and 32 isolated regressions passed afterwards, covering collection intervals, fast worker status, submission and startup failures, legitimate retries, expiry cleanup, the CLI, PostgreSQL SQL conversion and real SQLite dual connections. Message transport and worker execution were simulated; these fault injections were not run on production servers, and cross-process concurrent site claiming was not verified.
- Page file capacity still needs to be handled according to the server's memory commit, commit limit and disk space; this code fix does not change Windows page file settings or clear the queue and failure history. `NoGoods`, site 403s and list parsing errors continue to be verified as separate issues.
- Deployment notes: publishing a Release does not automatically update servers; run a system update on the server so services and workers load the new code. Existing failure history is kept, and the effect of the fix should be judged by the results of new tasks after updating.

## v20261008 - 2026-10-08

Release branch:`main`

### Social platform monitoring

- Adds X/Facebook public index monitoring, supporting monitoring targets, scan schedules, deduplication, scan records and manual review.
- Details read public content on demand and show a redacted preview of up to 600 characters; Facebook metadata is clearly marked as not full text, and the original text is not stored.
- Adds a separate module permission; configuration is grouped by monitoring target, execution schedule, search discovery and local filtering, with a clean, simple interface.
- Scan leases support continuous renewal and task ownership checks, so old tasks cannot overwrite the status of later scans or release their leases; when a thread fails to start, the failure is recorded and the claim released.
- Facebook Public page redirects must keep the original post identity; filtering of sensitive fields such as quoted passwords and API keys is added, and stale request results are discarded when switching monitoring targets.
- Only covers public single X/Facebook posts already indexed by search engines; search snippets cannot replace verification of the original post, and candidate hits are not confirmed events. The module does not use account pools, does not access private content and does not send notifications automatically.

### XForums(xforums.st) onboarding

- Adds six public database and leak information boards, using a separate `xforums` source identifier and XenForo list and first-post parsers.
- Reuses the `collect_paginated_seed` persistent pagination cursor, historical backfill and cross-entry deduplication, adapted to XenForo `/page-N` pagination.
- Enabled by default; after a collection round completes it checks again after 20 minutes, slightly less often than the 15-minute frequency of DarkForums, Cracked and BreachForums. Each round claims at most 10 details, uses the public browser queue with a detail concurrency of 1, and stores a separate browser state.
- Keeps publicly visible body text, HTML, JSON and screenshots; does not download attachment binaries or bypass login restrictions, and does not onboard credential, log-trading or private paid boards.

### Healthcheck Server diagnostics

- Adds a standalone `/healthcheck` page served directly by the backend, reusing existing administrator accounts. There is no diagnostics entry in the regular frontend menu or modules; it is used directly via the backend address.
- Supports runtime environment, project processes, listening ports, database and queue status, plus source and log queries within specified directories; results can be copied or downloaded as JSON.
- Provides real Windows PowerShell read-only command queries, supporting approved commands for directories, files, processes, services, listening ports and more, showing the working directory, standard output, error output, exit code and quantity limits.
- Diagnostic endpoints always require administrator authentication; out-of-bounds paths, sensitive files, symbolic links, Windows directory junctions and alternate data streams are blocked. Commands do not accept arbitrary scripts, pipelines, command chaining or modifying operations.
- A single command runs for at most 15 seconds, and at most 256 KiB of combined standard and error output is kept; exceeding the limit terminates the command. Logs and output filter sensitive fields such as passwords, tokens, cookies, API keys and PASS2.
- The standalone diagnostics session does not change the main interface login state; displayed content is cleared when the session expires or on logout. When using a custom reverse proxy, forward `/healthcheck` and its sub-paths to the backend.

### Merged fixes and upgrade notes

- This update package includes the Tor bridge background auto-recovery fix previously merged into `main`: recovery is based on process, SOCKS and connection state checks, and auto-reconnect stops after a manual disconnect.
- The new XForums configuration is appended during updates, keeping existing site enable/disable settings. Social monitoring is only available to accounts granted the `social_monitoring` permission, and administrators can configure targets and scan schedules.
- Release verification used isolated data and simulated external sources; it makes no promise about current forum availability or real-time or full coverage of social platforms. The release candidate excludes test scripts, local runtime data, databases, screenshots and credentials.

### Verification

- XForums 18 offline checks passed, covering pagination cursors, claiming and quotas, cross-board deduplication, detail evidence retention, failure release and transaction rollback.
- 30 offline tests for public social monitoring passed, covering permissions, scan ownership and lease renewal, old table migration, cleanup after thread start failure, redirected post identity and sensitive field filtering; the existing PostgreSQL adapter also passed 79 offline SQL checks.
- Healthcheck 24 Windows backend tests passed, covering administrator permissions, path boundaries, real PowerShell, redaction, timeouts and output limits; the integrated page and standalone session operations were verified.
- The frontend production build, page-switch race regressions, Python compilation, Windows PowerShell 5.1/7 syntax and full candidate tree checks passed. No production database load test or full real-platform collection was performed.

## v20260920 - 2026-09-20

Release branch:`main`

### Collection keep-alive, failure history and intelligence time ordering

- Windows One-click startup adds separate daemons for list, detail and browser workers; after an exit they retry with back-off from 15 seconds to 5 minutes, and are rebuilt if they stay not-ready after starting.
- Distinguishes a Celery worker that is ready from a process that is merely alive, and handles the process relationship between the Windows Python launcher and the actual worker, avoiding duplicate consumers left over after recovery.
- The message queue type is checked periodically in read-only mode; if a non-list type is found an error is shown and startup is paused, and the message queue is never deleted or renamed automatically.
- The site matrix and collection control page show fault reasons according to the queues actually depended on, and missing consumers are no longer masked by historical success records.
- The existing Garnet 2.1.4 is kept. This release does not include upstream candidate builds that have not passed additional persistence stress verification, and does not claim to have fully fixed Garnet queue corruption.
- Historical failure records support server-side pagination and cross-page search for the last 7 days, no longer limited to the most recent 30 in total; refreshing keeps the page number, and older database records are not deleted.
- Intelligence search sorts globally in the database by the report time shown on the page, with a unified time zone and stable ordering by event ID; empty keywords, full-text search and search fallback use the same rules, and missing times sort last.
- On first startup, canonical sort times for existing intelligence are backfilled in batches and the search index is synced; an interrupted migration rolls back entirely and can be retried, and original source times are not changed.

## v20260908 - 2026-09-08

Release branch:`main`

### Global intelligence search

- Adds a character search index supporting single Chinese characters, abbreviations, full company names, English, numbers and existing wildcard rules; long terms are verified through candidate filtering and full-condition rechecks, keeping full-database hit coverage.
- Search results, category counts and pagination reuse match results, with a short-lived cache invalidated by data version; empty keywords continue to use the sort index.
- Submitting a search no longer reloads the whole page; while loading, the previous results are kept and actions on them disabled, stale responses do not overwrite a new query, and switching accounts clears the search cache.
- The API adds `Server-Timing` to separate connection, query and result conversion time, and logs do not record the original keywords.

### BreachForums(bf.st) onboarding

- Adds four entries: Databases, Other Leaks, Leaks Market and Sellers Place, reusing the persistent pagination cursor, historical backfill and detail task deduplication.
- Extracts the first-post body, author and publish date, excluding pinned notice posts and replies; the same topic appearing in several entries is deduplicated by URL.
- The site is enabled by default and checked every 15 minutes; updating the configuration keeps existing site enable/disable settings.

### Upgrade and verification

- The first upgrade builds the search index in the background and needs extra disk space; the original query path is kept until the index is ready, after which only changed documents are updated. Data and index are updated in the same transaction.
- SQLite and PostgreSQL each passed 612 search semantics checks; a simulated corpus of 17,000 records (about 207 MB) covered full company names, high-frequency terms, no results, sorting, pagination and concurrent requests. Performance figures only represent the isolated simulated environment.
- BreachForums Offline parsing, pagination, cross-entry deduplication and configuration merge checks passed; the release candidate does not include test scripts, mock databases or runtime credentials.

## v20260906 - 2026-09-06

Release branch:`main`

### External domain access and one-click startup

- Vite The development and preview servers both allow `darkweb-monitor.threatbook-inc.cn`, so access through a reverse proxy is no longer blocked by Host validation, while other unconfigured domains are still rejected.
- Windows The default frontend port for one-click startup is changed to `5174`, and the startup script, frontend defaults, stop-cleanup scope and local API CORS origins are kept consistent.

### Verification

- Vite Configuration loading, access via a specified Host, rejection of unknown Hosts, Windows PowerShell syntax, Python compilation, the frontend production build and update package generation were verified.
- The release candidate tree excludes test scripts, runtime data, databases, screenshots and sensitive configuration.

## v20260905.2.0 - 2026-09-05

Release branch:`main`

### Data leak site pagination and historical backfill

- Changan, DarkForums, Cracked, RaidForums and PwnedForums use the shared pagination mechanism; each round checks the newest page of each section first and fairly backfills historical pages according to per-site budgets. PwnedForums keeps its existing disabled state.
- Section cursors are persisted and resume after restart, and failed pages keep their retry position. Duplicate pages, invalid lists and the source's actual page size are recognized, avoiding collecting only the first page or mistaking a parse failure for the last page.
- By default each site backfills at most 5 historical pages per round; when unfinished tasks reach 500, historical backfill pauses while newest pages continue to be checked.

### Detail queue and evidence completion

- Adds a persistent pending-fetch state compatible with SQLite and PostgreSQL, separately recording the discovered version, fetched version and task lease; tasks can continue after insufficient detail quota, dispatch failures and worker interruptions.
- Detail quota is consumed only after a successful dispatch, and claims are fair across sections and newest/historical sources. Expired or duplicate tasks cannot overwrite new ones, and detail writes and version completion are confirmed in the same database transaction.
- Changes to display fields such as Changan view counts no longer trigger a body refetch; when a screenshot is missing, saved JSON/HTML whose hash matches the database body is reused as supplementary evidence.
- Site management and run details show pending, running, queue-completed and pagination progress; a unified onboarding specification and scaffolding hints for new sites are added.

### Update permissions

- System updates can only be started by admin users; regular users calling the update API get 403, and unauthenticated or expired sessions get 401.
- The main interface version menu and the Sidebar disable the update button for regular users, and the click handler checks again; version information and update status during restart can still be read.

### Verification

- 41 SQLite, task chain and pagination regressions, 13 PostgreSQL state and concurrency regressions, and 10 update-permission regressions passed; verification used isolated databases and simulated network/updater.
- API Batch query and backlog boundary checks, the frontend production build, and real page and permission interactions were verified; no production data load test or full real-site backfill was performed.
- Verification scripts, test data, databases, screenshots and runtime state are kept outside the release tree.

## v20260905.1.0 - 2026-09-05

Release branch:`main`

### RaidForums Data leak sources

- Adds the RaidForums public site with three boards, Databases, Other Leaks and Sellers Place, enabled by default and using a separate `raidforums` source identifier.
- Reuses the MyBB list and detail parsing logic; list pages ignore the pinned area and start collecting from Normal Threads, and detail pages extract body, author, publish time, attachments, victim and threat actor information.
- Collection tasks go to the `browser_public` queue, preferring direct HTTP and falling back to Chromium when page validation fails. By default it checks every hour, reading at most 20 topics per board and fetching 10 details per round, with detail concurrency limited to 1 per site.
- The updater appends RaidForums to the server's persisted site configuration while keeping the enable/disable state of existing sites, with no need to manually edit configuration files in the data directory.

### Verification

- The three public boards parsed successfully online, retrieving 51 normal topics in total; real detail page body, author, time, database writes and output files were verified.
- RaidForums Configuration, registration, parsing and update-config merge regressions and Ransomware.live persistent sync regressions passed.
- Python Compilation, the frontend production build, candidate tree test paths and exclusion checks for sensitive runtime files and high-confidence keys passed.

## v20260905 - 2026-09-05

Release branch:`main`

### ransomware.live Persistent auto-sync

- ransomware.live Auto-sync is now run by the existing scheduler and Celery queue instead of an in-memory thread in the API process; after a service update or restart, scheduling can be restored from the persisted configuration.
- Auto-sync enabled state, run interval and quantity limit are written to the shared data directory, the original sync configuration is kept when the API key is updated, and manual syncs no longer overwrite the auto-sync state.
- Sync tasks are tracked in `crawl_jobs`, recording queued, running, retrying, succeeded and failed states; PostgreSQL uses a non-blocking transaction-level mutex to prevent concurrent duplicate syncs.

### Sync result visibility

- Sync results distinguish records fetched from the API, newly added, updated and duplicates, so repeated calls with the same data are no longer misreported as new records.
- The collection control page shows task queued or running status and the category statistics of the latest round, and refreshes the runtime status automatically every 30 seconds.
- Stopping auto-sync only blocks future scheduling and does not forcibly interrupt tasks that are being ingested, avoiding half-written data.

### Verification

- Auto-sync configuration persistence, duplicate-safe scheduled enqueueing, Celery success records, API start/stop and new/updated/duplicate count regressions passed.
- Python Compilation, API and Celery module imports, the frontend production build, candidate tree test paths and sensitive-file exclusion checks passed.

## v20260903 - 2026-09-03

Release branch:`main`

### Crawler throughput and PostgreSQL normalization fixes

- Collection tasks release the worker immediately after saving raw data, instead of synchronously rebuilding normalization for the whole table; the API background converges automatically based on the source data signature, checking every 30 seconds by default.
- PostgreSQL Normalization refresh adds a non-blocking transaction-level mutex, preventing multiple processes from deleting and rebuilding the event table at the same time and causing duplicate keys, long waits and lost worker heartbeats.
- When a normalization refresh fails the transaction rolls back automatically and the old data is kept; the source signature stays unconverged, later cycles retry automatically, and new data arriving during the refresh is not missed.
- Windows and WSL runtime capacity is restored to at least 2 public workers and 1 Onion worker, remaining compatible with the old 1+1 environment configuration inherited during upgrades.

### Site scheduling and task visibility

- DragonForce, Chaos and Lynx are changed to collect every 24 hours; DarkForums and Cracked keep the high-value collection configuration of every 15 minutes with 20 topics and 10 details per round.
- Retried tasks are marked as queued again, and the site page shows running and queued tasks separately; the 24-hour failure count now comes from real database statistics.
- The task page adds a separate historical failure list that keeps the database failure total and shows the latest 30; later successes do not hide old failures, and `stale` reconciliation records are not mixed with real failures.

### Verification

- Non-blocking mutex with dual connections on temporary PostgreSQL 16, transaction failure rollback, source signature convergence and failure recovery were verified.
- 31 failure records plus subsequent successful task regressions passed: the failure total stays at 31, the latest 30 are returned and timeout reconciliation records are excluded.
- API Background task startup, Windows PowerShell 5.1/7 and Bash syntax, Python compilation and the frontend production build passed.
- Real-browser verification of the site management and task list routes passed; running/queued and historical failure records display correctly with no console errors.

## v20260902 - 2026-09-02

Release branch:`main`

### Multiple DingTalk bots per monitoring target

- A single monitoring target can save several named DingTalk bots, supporting testing one by one, deleting one by one, testing all, clearing all and enabling/disabling them together.
- Intelligence keyword and code leak main-list hits are fanned out to all enabled bots of that target; a failure of one bot does not block the others.
- DingTalk send records are deduplicated per monitoring target and per bot, avoiding duplicate pushes to bots that already succeeded when retrying partial failures.
- Old single-bot configurations keep working and are migrated losslessly to the multi-bot configuration when the first new bot is added.

### Verification

- Multi-bot storage, old configuration migration, fan-out sending, failure isolation and one-by-one deletion regressions passed.
- Two bots were added successfully on the real `/settings` page and one of them deleted separately, with no browser console errors.
- Python Compilation, API route checks, the frontend production build and sensitive-information checks of the change set passed.

## v20260901.1.0 - 2026-09-01

Release branch:`main`

### PostgreSQL Connection and transaction optimization

- API and workers each reuse a thread-safe PostgreSQL connection pool within their own process, with at least 1 and at most 8 connections per process by default; when the pool is full, a request waits at most 10 seconds.
- Schema, the migration fingerprint and auto-increment table information are verified only once when the connection pool initializes, instead of querying system tables again for every API call.
- Unfinished transactions are forcibly rolled back before a connection is returned, preventing long-lived `idle in transaction` sessions from holding connections and MVCC snapshots.

### Code monitoring load optimization

- API The code monitoring summary cache is warmed up before startup completes, and after a code scan ends the cache is rebuilt by a single-flight background task, sparing users a cold computation of about 5.5 seconds.
- Monitoring targets, summary, main list and suppressed list now load in parallel; the page loading state ends as soon as core data is ready, and long-running scan status loads in the background.
- Scan status polling is actively cleared on page switch and unmount, and if the page has been destroyed when an async request returns, no new timer is created.

### Verification

- In an isolated real PostgreSQL schema the first connection takes about 189.7 ms, and pooled reuse averages about 0.4 ms; 12 concurrent requests are bounded by the configured limit, and there is no `idle in transaction` after return.
- Single-flight summary cache warm-up and startup order were verified; a scan status delayed by 10 seconds does not block core data from becoming ready, and polling stops increasing after leaving the page.
- Python Compilation, PowerShell and Bash syntax, the frontend production build, update package client extraction and sensitive path exclusion checks passed.

## v20260901 - 2026-09-01

Release branch:`main`

### Crawl scheduling and queue optimization

- DarkForums and Cracked are changed to check every 15 minutes with higher topic and detail collection quotas; Chaos is changed to check every 30 minutes with a lower detail quota, while DragonForce and Lynx keep hourly checks and reduce low-value duplicate detail tasks.
- Browser tasks are split into public and Onion queues; Windows and WSL use two public workers and one Onion worker by default, and the old `browser_render` queue remains compatible with tasks queued before the upgrade.
- Detail tasks record an audit time when enqueued, and Garnet/Redis concurrency slots limit the number of parallel details per site; lock waits and fetch failures use separate retry budgets.

### Auto-update fixes

- Windows The strict frontend health check now recognizes both the development entry `/src/main.js` and the production preview entry `/assets/*.js`, fixing the frontend being misjudged as failed and triggering a rollback when it had actually started.
- Frontend runtime status aggregation covers the public, Onion and old compatibility queues and accurately shows the number of browser workers after the split.

### Verification

- Site frequency, queue routing, per-site concurrency slots, detail enqueue auditing and retry budget regressions passed.
- Python Compilation, PowerShell and Bash syntax checks, the frontend production build, a real Vite preview home page and build asset probes passed.
- Update package build, client extraction rules, candidate tree test paths and sensitive-file exclusion checks passed.

## v20260831.1.0 - 2026-08-31

Release branch:`main`

### Overview and exposure monitoring load optimization

- The overview page now uses a compact aggregate API generated for today, the last 7 days and the last 30 days, instead of downloading and recomputing the full intelligence payload; cold and warm request times on large databases drop significantly.
- Netdisk and document library monitoring share a result cache that is invalidated automatically by data revision number, and summary statistics are no longer hard-truncated at 500 records; lists, filters, search and time ranges now use server-side pagination with 20 records per page.
- The code monitoring main list and suppressed leads continue to use server-side pagination, loading only the current page each time; a normal Windows start now builds and loads production frontend assets, avoiding a Vite development compile on first access.

### Monitoring interface fixes

- Zero-data trends for netdisk and document libraries show a complete line, the first zero value is no longer mislabeled as the peak, and the last point stays aligned with its date label.
- The code monitoring trend chart restores line segments between points, so non-zero trends clearly show the direction of change.
- Netdisk and document library pages add a "Scan Tasks" entry that opens the actual scan execution and history page.

### Verification

- 452 MB On a historical SQLite database, cold requests to the compact overview API take about 0.78 to 1.73 seconds and warm requests about 0.01 seconds, and the response shrinks from about 2.41 MB to about 19 KB.
- In production preview mode, real browser navigation, overview period switching, netdisk and document library pagination, server-side search, code monitoring pagination and the scan task entry were verified, with no browser console errors.
- Python Compilation, PowerShell parsing, the frontend production build, update package client extraction rules, the full candidate tree and release package sensitive path checks passed.

## v20260831 - 2026-08-31

Release branch:`main`

### Per-target notification isolation

- Each monitoring target separately stores its intelligence keywords, WeCom bot, DingTalk webhook and channel enable state, so bot credentials and push targets are no longer shared.
- Ransomware, data leak, vulnerability alert and code leak main-list notifications are first matched to a monitoring target and then sent only to that target's enabled channels; send records and deduplication signatures are isolated between targets.
- WeCom supports each target maintaining its own listener connection and registered sessions; deleting a target also stops its listener and cleans up its notification configuration without affecting other targets.

### Company profile and code search optimization

- Company names, brand aliases, English abbreviations, root domains and internal system keywords in the company profile automatically generate code search terms, deduplicated by term value.
- The former "Code Search Terms" is renamed to "Additional Code Search Terms" and is only used to add project, product and special search terms; the page shows the terms auto-generated from the company profile for review.
- Code sensitive rules, scan policies, intelligence keywords and notification channels all clearly show the current monitoring target; target-level configuration controls are disabled automatically when no target is selected.

### Verification

- Routing isolation regressions for dual-target keywords, WeCom, DingTalk and code leak notifications passed; unconfigured targets do not fall back to global environment credentials.
- Isolated SQLite and real PostgreSQL writes, deduplication of company-profile derived terms, cleanup on target deletion and target switching in the new UI were verified.
- Python Compilation, PowerShell parsing, Windows updater regressions, the frontend production build and the update package sensitive-file scan passed.

## v20260829 - 2026-08-29

Release branch:`main`

### Code monitoring quality and notifications

- The main list is tightened to real credentials, private keys, non-local connection strings or explicit evidence of access to company systems; company names, public domains, email addresses, annual reports, recruitment, datasets, reports and demo materials all go to suppressed leads.
- Historical hits are re-evaluated at read time using the new classification rules; time filters now use the server's current time, and search, monitoring target, platform, risk, layer and time conditions apply to both the main list and the suppressed list.
- Code leak notifications only send sensitive main-list hits that are new this round and not suppressed; WeCom and DingTalk no longer push ordinary keyword leads, and other intelligence keyword notifications are unchanged.
- After a long-running scan completes, trends, statistics and both lists refresh automatically, distinguishing new main-list items, new suppressed items, updated existing items, sensitive hits and ordinary leads.

### Site collection fixes

- DarkForums moved to `darkforums.as`; lists and details prefer direct connections and fall back to browser fetching on failure.
- Cracked lists and details are now all consumed by the `browser_render` worker; after a direct connection or proxy returns 403 it falls back to Chromium automatically, with no login needed.
- Cracked An isolated anonymous browser state is used to store anti-bot challenge results; the state lives in the data directory and is not included in the update package, the repository or login cookie management.
- Temporary HTML and cookie files are isolated per request, 403 is classified as a site block, and special characters in the Windows console no longer interrupt tasks.

### Verification

- Fixed true-positive and false-positive regressions, notification deduplication, dual-list pagination and filtering, SQLite compatibility and real PostgreSQL writes were verified.
- Cracked With both forced direct connection and proxy returning 403, real Chromium successfully parsed the list and details and produced screenshots; a low-frequency smoke test of real DarkForums lists and details passed.
- Python Compilation, PowerShell parsing, Windows updater regressions, the frontend production build and the release package credential scan passed.

## v20260828 - 2026-08-28

Release branch:`main`

### Dual-channel notifications for monitoring keywords

- Monitoring keyword hits for ransomware intelligence, data leaks and vulnerability alerts can be pushed to both WeCom and DingTalk; the two channels record send status independently, and a failure in one does not block the other.
- By default only events newly ingested this round are processed; saving bot configuration, changing keywords or restarting services does not resend historical hits, avoiding a flood of duplicate pushes.
- Notifications include the event title, source, victim, related entity, disclosure time, summary and source link, and never include code snippets or credential content.

### Long-running code scans in the new UI

- The rendered code monitoring home page adds a long-running scan control bar where you can choose a monitoring target and view the running status, last completion time and the number of sensitive hits and lead hits.
- “Start scan" runs the first round immediately and then scans automatically every hour by default; the long-running scan can be stopped from the same place, with no need to open the hidden old scan page.
- WeCom and DingTalk still only push records that are new and enter the code leak monitoring main list, and do not push suppressed leads.

### Verification

- WeCom/DingTalk channel isolation, new event filtering, duplicate skipping, isolated failure retries and legacy WeCom compatibility checks passed.
- New UI long-running scan binding checks, Python compilation and the frontend production build passed; real-browser verification showed the start and stop APIs returning success and the page state switching correctly.

## v20260827.2.0 - 2026-08-27

Release branch:`main`

### Windows Online update fixes

- Fixes the `Get-FileHash` module being unavailable when PowerShell 7 and Windows PowerShell 5.1 are mixed, which left updates stuck at "Preparing new runtime environment".
- Fixes the `run_self_update.py` update controller being killed by mistake when stopping old services, which left the page stuck at "Stopping old services".
- The runtime port state is now UTF-8 without BOM, and the updater also accepts files with a BOM, preventing a healthy new service from being misjudged as failed and rolled back.
- The update process status check confirms the Windows process is still active, so processes that have exited but still have open handles are no longer misjudged as running.
- Release Adds the `repair-v20260827-update.ps1` transitional repair tool so existing `v20260827` installations can get out of a stuck state and update again.

## v20260827.1.0 - 2026-08-27

Release branch:`main`

### Separate deletion of notification bots

- The WeCom bot and the DingTalk bot each have their own delete-configuration button and API; deleting either bot does not affect the other channel, monitoring targets, company profiles or historical data.
- Deleting the WeCom configuration also stops the smart bot listener and clears registered sessions; if environment variable configuration still exists, the interface clearly notes that it remains in effect.
- Adds dedicated checks for separate deletion, covering configuration file isolation, idempotent repeated deletion, environment variable fallback, and binding of frontend buttons to API routes.

## v20260827 - 2026-08-27

Release branch:`main`

### One-click updates without Git

- Windows Version checks now read the stable Release manifest; clicking the update button completes download, size and SHA-256 verification, safe extraction, dependency pre-installation, service switching and health checks, without requiring Git or a `.git` working copy.
- New versions are installed into a separate application root and switched atomically via `installation.json` in the control root; if the new version fails to start or fails its health check, the old version is restored automatically.
- Update state is stored in a fixed control root, application versions and downloaded packages are written to `DARKWEB_APP_ROOT`, and site configuration, cookies, SQLite backups and business data are written to `DARKWEB_DATA_ROOT`.
- Adds a deterministic Release update package build and publishing pipeline; Ed25519 manifest signing is optional, and production can be configured to reject unsigned manifests.

### Windows Configurable data drive

- Windows Standard installation is consolidated into a single `darkweb.cmd` entry point. The first double-click lists the local disks and free space; after you choose the drive for business data and future update versions, it automatically configures a new environment or verifies and migrates existing managed data, and later starts no longer ask again.
- Adds `configure-data-root.cmd`, supporting pre-checks and configuration for new environments, and for existing data: offline copy, per-file SHA-256 verification, configuration switch, health check and failure rollback. The source directory is kept by default; after retesting, `cleanup` re-verifies and only removes old data confirmed to be identical.
- For new installations, SQLite, migration batches, evidence mirrors, Garnet checkpoints, Tor, Playwright, authentication files and caches all follow `DARKWEB_DATA_ROOT`; drive C only keeps control state and command entry points, and application versions use a separate `DARKWEB_APP_ROOT`.
- Windows New PostgreSQL installations create the database cluster in the data root via EDB `--datadir`; existing PostgreSQL services are only reused, with the actual cluster path clearly shown, and no unsafe online file copy is performed.
- Free space on the data drive is checked before startup, and `darkweb status` and "Configuration Center → Data Migration" show the data root, remaining capacity and data components still located in external directories.

### DingTalk code leak notifications

- Adds DingTalk code leak notification configuration, connection testing and a sending channel, isolated from other notification channels; a failure in one channel does not block the others.
- The frontend configuration page shows DingTalk status, and sensitive credentials are not echoed back.

### Verification

- The original 9 regressions of the Git-free updater and 3 path tests across the three roots passed; with Git removed from PATH, the same-version button check completed normally.
- Windows In isolated directories, data root migration, per-file verification, field-level rewriting of installation pointers, controlled cleanup, preservation of external paths and recovery from conflicting targets were completed.
- Mutual exclusion of the cross-process maintenance lock between data migration and the updater was tested; PowerShell 5.1/7 parsing, Python compilation, API path summaries and the frontend production build passed.
- The release candidate still needs deterministic packaging, remote assets and staged server verification after merging into `main`.

## v20260825 - 2026-08-25

Release branch:`main`

### Windows Native Garnet runtime

- Windows One-click startup no longer uses Memurai Developer as the default Redis backend; when no usable service exists, it automatically installs and starts the project-managed Microsoft Garnet 2.1.4.
- Downloads the pinned official Microsoft Windows x64 ReadyToRun asset and a project-private .NET 10.0.11 runtime, verifying SHA-256 and SHA-512 respectively, without relying on `winget`, Docker, Git, an SDK or a system-wide .NET install.
- Garnet Listens only on `127.0.0.1:6380` and always uses Redis DB 0; AOF, commit waits, checkpoints and recovery are enabled, with a background checkpoint every 6 hours by default. Data is stored in the user data directory, and normal stops and data-preserving uninstalls do not delete checkpoints.
- The launcher uses RESP `PING` to determine whether a service is truly Redis-compatible, so an ordinary occupied TCP port is no longer mistaken for a usable service; when the PID is lost, only the Garnet process matching this project's pinned runtime and checkpoint directory is recognized.
- Compatible with the `redis://127.0.0.1:6379/0` written by old versions: it continues to be reused when that endpoint is available and is migrated to the managed Garnet when it is not. Any other explicit `REDIS_URL` remains the user's authoritative configuration and is never silently overwritten when the connection fails.
- Garnet Not a complete Redis replacement: the current production path has verified Celery broker/result, `SET NX EX` state locks, lists, transactions and pub/sub. Do not introduce Redis Streams or non-DB 0 dependencies without re-running compatibility tests.

### Windows Server PostgreSQL Installation compatibility

- Windows The first PostgreSQL 16 setup no longer depends on `winget` or Microsoft App Installer; when no local service exists, it downloads the official EDB PostgreSQL 16.15-1 x64 installer directly, verifies the pinned SHA-256 and silently installs the service and command-line tools.
- Installed PostgreSQL and explicit external migration targets continue to be reused first; offline environments can supply the same official installer via `DARKWEB_POSTGRESQL_INSTALLER_PATH`, which is rejected if the hash does not match.

### Site collection and frontend

- Adds Cracked and PwnedForums list and detail parsing and collection adapters, wired into site registration, normalization refresh and source name display.
- PwnedForums Supports reading session cookies from environment variables or a Git-ignored local file and passing them safely through the Tor/HTTP fetch layer.
- The collection console adds cookie management for logged-in sites, supporting redacted viewing, saving, refreshing and clearing file cookies; Cracked is enabled by default and PwnedForums disabled by default.

### Versioning and updates

- The current version now uses the date-based number `v20260825`, and later versions continue to use `vYYYYMMDD`; historical version records are unchanged.
- Online updates track the `main` branch of `Threat-Intelligence-monitor/Dark-Web-Threat-Intelligence-System` by default, which can be explicitly overridden by an environment variable; whether an update is available is still determined by Git commits and a safe fast-forward, not semantic version comparison.

### Verification

- Microsoft Garnet The official v2.1.4 release asset was verified with the Redis protocol, the project's `RedisStateStore`, 10/100-task Celery round trips, the result backend, control ping, scheduled BGSAVE, AOF recovery after forced termination, recovery of unconsumed tasks and reconnection of running workers.
- Cracked Parsing and adapter tests, PwnedForums list/detail/time/cookie pass-through, the cookie API, Python compilation, PowerShell parsing and the frontend production build passed.
- The release candidate tree contains no test scripts, databases, logs, runtime data, cookies or credential files.

## v0.22.0 - 2026-08-17

Release branch:`v0.22.0`

### Integrated database and mirror migration

- Adds an administrator "Data Migration" page that supports uploading `.dwti` ZIP64 migration packages generated by an external tool, showing upload, pre-check, database import, mirror extraction and joint verification progress.
- Migration packages bundle SQLite table data and evidence mirrors together; before import, file count, path traversal, symbolic links, duplicate paths, zip bombs, size limits and the SHA-256 of every payload are checked.
- Each migration batch uses its own `dwti_<batch ID>` PostgreSQL schema and mirror directory, checking row counts, null counts, XOR256 and SUM256 table by table; any mismatch aborts the import without affecting the current active version.
- After verification, an administrator must confirm again before `active-release.json` is written and services restart; if the database, migration version or API health check fails, the previous active version is restored automatically.
- Platform sessions, cookies, tokens and credential files are never included in migration packages; this is still a full version replacement, multiple migration packages are not merged and no cross-package business deduplication is performed.
- Windows The migration tool can read SQLite directly from `\\wsl.localhost`: it first takes a stable copy of the database and its WAL/SHM side files and then creates a snapshot. Absolute mirror paths in the database are converted to portable paths, and after verifying the corresponding files in the package they are rewritten to the new mirror root during the PostgreSQL import.
- WSL When code/library mirrors contain Windows reserved device names, illegal characters, trailing dots or spaces, Unicode-equivalent names, over-long components or case conflicts, the migration package generates stable Windows-compatible archive names and updates database references accordingly; core mirrors that cannot be safely rewritten through explicit paths still block packaging.
- SQLite The `ASC` / `DESC` order in composite and single-column indexes is created as-is in PostgreSQL; the Windows import checks the final runtime path length before extracting mirrors, gives a clear message when directories are too deep, and can clean up failed batches containing long-path files.

### PostgreSQL Runtime and compatibility

- Adds a SQLite / PostgreSQL runtime selection layer and SQL compatibility adaptation; the active version can switch the database schema and mirror root at the same time.
- Fixes a PostgreSQL 500 caused by DragonForce and Lynx victim list and detail sorting mixing date text and integer IDs in the same `COALESCE`.
- Windows On first startup PostgreSQL 16 is automatically installed or reused, a project-specific database and least-privilege account are created, and the local recovery configuration is stored with DPAPI; an existing active version is never overwritten and its password is never reset.
- Debian / Ubuntu / WSL / Codespaces On first startup PostgreSQL 16 is installed from the PGDG repository with a verified official signing fingerprint; when a distribution leaves the main repository it automatically switches to the official PostgreSQL archive, creates the project database and role idempotently, and stores the current user's private password with directory mode `700` and config file mode `600`.
- Fixes misjudgment when `winget` completed the installation but returned a non-zero status, and Windows PowerShell treating PostgreSQL `NOTICE` as a terminating error; installation results only record redacted status.
- WSL / Linux The startup script can read the active PostgreSQL version and stops syncing the SQLite runtime database for an activated version.
- The migration activation controller clears old database and mirror directory environment overrides before restarting, ensuring the PostgreSQL active version and new mirror root actually take effect.
- Fixes PostgreSQL background warm-up failing because forum titles were not included in the aggregation grouping during normalized intelligence refresh.
- Invalid months, dates or minutes in historical forum records are safely downgraded to unparsed times and no longer interrupt the whole normalization batch.
- Entity context merging treats missing country and industry fields as empty and safely propagates valid information, so refreshes are no longer interrupted by missing keys in old records.
- Normalization refresh uses a safe directory of the same name under the migration mirror root for historical sources that are no longer configured, such as `dragonforceblog`, avoiding lost HTML, JSON and screenshot associations after a rebuild.
- Forum mirror rebuilds now look up canonical filenames exactly and inherit verified resource links from the previous normalized version, no longer repeatedly running fuzzy directory scans across nearly ten thousand records because a single screenshot is missing.

### Loading pages with large data

- The ransomware and data leak pages each return the latest 500 records on demand; global search no longer downloads and creates tens of thousands of DOM nodes at once.
- Global search now uses server-side pagination over the full history: the frontend renders only 20 records per page, while totals, company keywords, intelligence type, time or risk sorting and jumping to any page all run against every record in the database, no longer limited to the first 500.
- The first-screen list completes type filtering, keyword search, sorting and limited reads directly in the database, no longer loading the whole table or computing monitoring rules for list requests; full analysis stays in the existing statistics API.
- Fixes a frontend error where the global search URL keyword variable shared a name with a DOM query function, leaving the page stuck at "Loading live data".
- `/api/events/search` Supports page number, page size, database-wide keyword, intelligence type and sort parameters; the detail API stays at `/api/events/{id}`, gzip is enabled for all large API responses, and static mirror files are not compressed.

### Frontend and mirror adaptation

- Site management adds a "Site Runtime / Platform Onboarding" top switch, moving GitHub App, Chaojiying, Changan auto-login, code platform sessions, netdisk sources, library sources and library sessions entirely into site management; monitoring configuration keeps monitoring targets, sensitive rules and notification channels.
- The data migration page now uses the unified Abyssal sidebar, top bar, status cards, buttons and mobile layout, and correctly highlights the "Data Migration" navigation item.
- Mirror previews now keep the original aspect ratio; on desktop the maximum height is limited by the viewport, and narrow screens use the available width without horizontal overflow.
- PostgreSQL The active version clearly shows the database type and schema on the runtime environment page.

### PanSou Removed

- Removes the Windows local source clone and Go build, WSL Docker container, health checks, environment variable registration and service status display; PanSou is no longer installed or started with the project.
- Removes PanSou from netdisk discovery sources, platform configuration, normalized source labels and frontend onboarding; other public netdisk sources and the optional PanHub API are unaffected.
- The upgrade does not automatically delete existing historical hit records in the database; it only stops further PanSou queries and new data writes.

### Verification

- Adds regression tests for migration packages, the migration API, PostgreSQL SQL compatibility, the DragonForce / Lynx event pipeline, Windows PostgreSQL installation and frontend layout.
- Verified the offline migration package structure and whole-package SHA-256, real PostgreSQL temporary table queries, Windows PostgreSQL installation permissions and the frontend production build.

## v0.21.0 - 2026-08-10

Release branch:`v.0.21.0`

### CAPTCHA service and session keeper

- Adds a reusable Chaojiying CAPTCHA service configuration that can be set from the frontend or via environment variables; credentials are only stored in the local runtime directory and are never echoed in frontend responses.
- The built-in login browser can recognize image CAPTCHAs and fill in the result; after a wrong recognition, the Chaojiying error-report API can be called to get a refund of points.
- Changan supports storing a separate site account, performing two-layer CAPTCHA login, verifying the post-login API and updating the browser session; multiple processes use a mutex to avoid logging in at the same time.
- The scheduler checks session status every minute and proactively recovers it whenever the session has expired or passed its expiry time, even if the collection task is not yet due; after a failure it cools down for 5 minutes before retrying, avoiding repeated consumption of CAPTCHA credits.
- When the Changan API encounters an authentication failure, it retries the original request once after automatic recovery succeeds; the frontend adds Chaojiying shared configuration and Changan auto-login configuration cards.

## v0.20.0 - 2026-08-04

Release branch:`v.0.20.0`

### Intelligence search performance optimization

- Internal links in the new interface are switched to Vue routes, avoiding full page reloads when entering intelligence search or detail pages.
- The rendered intelligence search page is cached, so returning to the list restores data, filters and page state directly without rebuilding the full result set.
- The intelligence events API returns existing cache first and refreshes in the background, reducing waits when entering a section repeatedly.

### New interface and data adaptation

- Threat overview, ransomware intelligence, data leaks, vulnerability alerts, netdisk monitoring, library monitoring, code monitoring and collection control are all wired into the new interface, keeping the page structure and interactions defined by the new UI.
- Improves trend charts, distribution statistics, the world map, progress bars, site icons, filters, list pagination and return state from detail pages, and fixes overflow and misalignment of long text, mirrors and tables at different sizes.
- Adds linked filtering by monitoring target, code lead filtering and public identity cleanup, keeping placeholder data, internal fields and redundant summaries out of the display layer.

### Tor Bridges and collection runtime

- Windows, Linux and WSL startup scripts support automatic installation, verification and daily updates of a project-private Tor Expert Bundle, no longer requiring Tor Browser to be pre-installed on the host.
- Improves built-in bridge configuration for meek, obfs4, snowflake and others, SOCKS port conflict detection, old process cleanup, connection progress and exit status feedback.
- Adds daily automatic site availability probing, persistent connection status and collection proxy reuse; fixes site tasks being miscounted as real failures after abnormal reclamation.
- Enhances the browser worker, remote browser sessions and streamed screen control, supporting saving and restoring platform login sessions and browser fallback strategies on Windows / Linux.

### Intelligence collection and evidence mirrors

- Fixes entry points, detail parsing, victim identification and normalization sync logic for sources such as DragonForce, Chaos, Lynx and DarkForums.
- Improves page-load completion detection, mirror screenshot sizes, HTML evidence backfill and detail resource validation, avoiding premature screenshots of loading pages and invalid oversized mirrors.
- Changan detail mirrors add integrity checks for product name, title, price and main image; historical mirrors that did not finish loading re-enter the collection queue and are no longer mistaken for valid evidence.
- Optimizes data caching, monitoring target matching, hit statistics and detail translation for library, netdisk and code monitoring, reducing duplicate requests and page waits.

### Install, update and uninstall

- Windows / WSL Startup scripts are updated for the new frontend, backend services, Tor runtime and database paths.
- Adds two safe uninstall modes, `darkweb uninstall keep-data` and `darkweb uninstall purge-data`, with preview, path boundary checks and explicit confirmation.
- The project version is updated to `v0.20.0`, the frontend package version to `0.20.0`, and the online update target is switched to the `v.0.20.0` branch.

### Release safety

- The release branch contains no test scripts, test fixtures, runtime databases, logs, caches, browser sessions, cookies, authentication files or local Tor runtime state.
- Expands ignore rules for local credentials and runtime artifacts, and scans the final staged files for sensitive filenames and credential patterns before committing.

## v0.12.0 - 2026-07-14

Release branch:`main`

### Changan monitoring source

- Integrates the read-only Changan product list and detail APIs, writing the latest products into the existing "Data Leak Intelligence".
- Reuses the built-in browser for Tor access verification and manual login; login tokens and browser sessions are only stored in the runtime directory.
- Adds login status checks and expiry handling; when not logged in or the token has expired, the task is marked as skipped to avoid a flood of failure alerts.
- Deduplicates by product ID and content hash, checks every 30 minutes, and reads at most 30 list entries and updates 15 details per run.
- Detail screenshots keep the product image on the left and the product information area on the right, without capturing the sample images and long body text below.

### Tor Bridges

- Improves runtime dependency installation and transport plugin discovery for bridges on Linux / Codespace.
- Adds Tor startup stages, Bootstrap connection progress, error diagnostics and process recovery status.
- After a bridge connects successfully the Tor exit IP is shown, distinguishing proxy available, exit check failed and connection failed states.

### Sessions and collection control

- The built-in browser adds onion address and Tor SOCKS proxy support, and platform sessions can be saved and reused directly after login.
- Site health status adds display name, login requirement, login status, login platform and hint information.
- Single-site tasks return `auth_required` when no valid session exists, without entering failure cooldown or circuit breaking.

### Version update

- The project version is updated to `v0.12.0` and the frontend package version to `0.12.0`.
- Online updates by default always compare against and update from the GitHub `main` branch, preventing feature branches from being mistaken for official updates.

## v.0.10.0 - 2026-07-02

Release branch:`v.10.0`

### Document library monitoring

- Library monitoring is upgraded to a standalone monitoring dashboard, with interaction and visuals close to netdisk monitoring.
- Adds recognition of no-login-first library sources and default scan sources, including Renrendoc, Jinchutou, MBA Think Tank Docs, 360 Library, Tencent Library, Quark Docs, Taodou, Docs Home, Souhong Library and others.
- Platforms with heavy login restrictions are not used as default high-frequency sources, avoiding bypassing logins, CAPTCHAs or paid downloads.
- Adjusts the default library scan depth and fixes library hit lists being crowded out by netdisk results.
- The library detail page now follows the netdisk monitoring detail style, and the middle file list area is removed.

### Netdisk and document mirrors

- Netdisk and library monitoring gain the ability to retain mirror files.
- Netdisk hits support HTML mirror snapshots and backfilling mirrors for old data that lacks them.
- Library hits support retaining mirror leads such as public HTML, screenshots and snapshot paths.
- The detail page adds a "Mirror Files" entry to make it easier to review the page evidence from that time.

### Login and accounts

- `admin` The default password is changed to `123456`.
- Supports initializing a local password file, avoiding being unable to log in at startup because `DARKWEB_AUTH_PASSWORD` is not configured.
- Adds a change-password API and frontend entry so the default password can later be changed within the system.

### Versioning and release

- Adds `version.json` with version tag `v.0.10.0` and update branch `v.10.0`.
- Backend API version information is updated to `v.0.10.0`.
- The frontend package version is updated to `0.10.0`.
- Adds version checking to read the local version and compare it with the GitHub branch.
