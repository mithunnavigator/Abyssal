# Darkweb Collector

A crawler framework that centrally manages collection of public dark web information and extraction of threat intelligence.

The project has evolved from "one standalone script per site" to a structure of "unified CLI + site adapters + SQLite + optional Celery/Redis queue", which makes it easy to keep adding new sites while reusing existing fetching, deduplication, storage and output logic.

## Current capabilities

- Unified site onboarding:`parser + adapter + sites.yaml`
- Unified run entry point:`scripts/crawl.py`
- Supports one-off runs and continuous polling
- Supports storing results in SQLite and `crawl_jobs` auditing
- Supports incremental checks on list pages and fetching detail pages on change
- Data leak sites support newest-page discovery, persistent historical backfill cursors and a detail pending-fetch queue
- Supports both browser and non-browser fetch modes
- Automatically chooses between the Tor path and the regular proxy path based on the target URL's hostname

## Currently onboarded sites

- `changan`
- `dragonforce`
- `darkforums`
- `cracked`
- `breachforums`(BreachForums, `bf.st`)
- `spear`(Spear, `spear.cx`)
- `leakforum`(LeakForum, `leakforum.io`)
- `raidforums`
- `xforums`(XForums, `xforums.st`)
- `pwnfrm`
- `chaos`
- `lynx`

Site configuration is in [sites.yaml](./sites.yaml).

## Fetch routing rules

The current proxy selection rule does not depend on the `http://` / `https://` scheme, but on the target URL's hostname:

- Hostname ends with `.onion`: uses Tor
- Hostname does not end with `.onion`: uses the regular HTTP/HTTPS proxy; direct connection is allowed when no proxy is configured

Therefore:

- `http://abc.onion/...` uses Tor
- `https://abc.onion/...` also uses Tor
- `https://darkforums.as/...` Prefers direct connection and falls back to browser fetching on failure
- `https://cracked.st/...` Executed by the browser queue, still preferring direct connection; on 403 it falls back to Chromium and stores an isolated anonymous site state in the data directory
- `https://raidforums.im/...` Uses the generic MyBB parsing logic, preferring direct connection and falling back when page validation fails to Chromium
- `https://bf.st/...` Onboards four entries, Databases, Other Leaks, Leaks Market and Sellers Place, using a separate `breachforums` source identifier and the public browser queue; each entry saves its own pagination cursor, the two trading entries are grouped into the seller trading board, and topics are deduplicated by URL
- `https://spear.cx/...` Onboards four public boards, Databases, Stealer Logs, Other Leaks and Leaked Tools, using a separate `spear` source identifier and the public browser queue; no account configuration is needed, each round claims at most 10 details with a detail concurrency of 1, and it checks again 15 minutes after completing. Only body text and evidence visible to guests are collected, and hidden content keeps a restricted state; post links and attachments are not downloaded, and other boards such as Database Discussion, NSFW and Doxes are not onboarded.
- `https://leakforum.io/...` Onboards three boards, Cloud Logs, Source codes and Other Leaks, using a separate `leakforum` source identifier and the public browser queue; collection is anonymous by default, each round claims at most 10 details with a detail concurrency of 1, and it checks again 15 minutes after completing. Only guest-visible body text and evidence are kept; partially hidden posts show a restricted notice and fully hidden posts are recorded as restricted. Links and attachments are not downloaded and other boards are not onboarded.
- `https://xforums.st/...` Onboards six public boards, Index Database, Databases Leads, Database Crypto Leads, Other Databases, Other Leaks and Database Dumps Mail Access Leads, using a separate `xforums` source identifier and the public browser queue; it checks again 20 minutes after a collection round completes, each round claims at most 10 details with a detail concurrency of 1, and the browser state is saved in the data directory at `browser-state/xforums/storage-state.json`

XForums Uses the XenForo parser for topic lists and first posts, reuses persistent cursors, historical backfill and cross-entry deduplication through `collect_paginated_seed`, and pages via the `/page-N` path. Only publicly visible body text, HTML, JSON and screenshots are kept; attachment binaries are not downloaded, login restrictions are not bypassed, and credential or log-trading boards and private paid boards are not onboarded.

Spear and LeakForum seed pages, details and fallback fetch methods share their own persisted 15-second page fetch interval, which is honored across tasks and processes. On HTTP 429, a site verification page or a login wall, the site's remaining requests for this round stop immediately without switching fetch methods to keep trying; it cools down for at least 30 minutes, or waits for the seconds or HTTP-date in `Retry-After` if a 429 specifies longer. The cooldown is stored in the database, so restarts or forced collection do not clear protection that has not yet expired; valid pages and pagination positions obtained earlier are kept. Hidden content in a single post is still handled as a target-level restriction and does not trigger a site-wide cooldown. The page interval covers the collector's top-level page fetch actions and does not rate-limit redirects or browser resource requests such as images and CSS one by one.

`sites.yaml` in:

- `seed_fetch_mode`
- `detail_fetch_mode`
- `browser_queue`
- `max_concurrent_details`

only indicates the fetch method:

- `tor_http`: direct fetch without a browser
- `browser`: browser rendering

Browser tasks are isolated by source: public forums use `browser_public`, and `.onion` sites use
`browser_onion`. `browser_render` is only used for compatibility with tasks queued before the upgrade.
`max_concurrent_details` limits the number of detail tasks executing at the same time for one site; the default is `1`.

Whether Tor is used is decided automatically by the target URL.

## Prerequisites

### 1. Python environment

It is recommended to enter a virtual environment first:

```bash
cd /path/to/project/darkweb_collector
source venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

### 2. Tor environment

The startup script automatically installs and updates a project-private Tor Expert Bundle, so Tor Browser does not need to be pre-installed or running on the Windows side. The script sets the SOCKS address by default; you only need to override it manually when connecting to an external Tor:

```bash
export TOR_SOCKS_HOST=127.0.0.1
export TOR_SOCKS_PORT=9150
```

Quick check:

```bash
curl --socks5-hostname 127.0.0.1:9150 https://check.torproject.org/api/ip
```

### 3. Clearnet HTTP/HTTPS proxy

To route clearnet sites through a regular proxy, set:

```bash
export PROXY_HOST=127.0.0.1
export PROXY_PORT=7890
```

If these two variables are not set, clearnet sites try a direct connection.

## Common ways to run

First enter the project directory:

```bash
cd /path/to/project/darkweb_collector
```

## Start all services with one click

If you want to start Redis, the backend API, frontend, collection workers, scheduler and sync tasks in one go, it is recommended to use WSL:

```bash
bash scripts/start_all_services_wsl.sh start
```

The script automatically:

- Checks `tmux`, `python3`, `python3-venv`, `python3-pip`, `npm`, `redis-server`, `redis-cli`,`curl`
- On Debian/Ubuntu/WSL, installs missing system dependencies automatically via `apt-get`
- Creates the backend virtual environment automatically and installs `requirements.txt`
- Installs the Playwright Firefox/Chromium runtimes automatically and adds browser system dependencies on Debian/Ubuntu/WSL
- Checks the frontend `node_modules` and, if missing, automatically runs `npm install`
- Installs or reuses PostgreSQL 16 automatically and idempotently prepares the project migration database and account; skips local installation when an external PostgreSQL is explicitly configured
- Prepares the WSL local runtime database; if there is no historical database, an empty one is initialized automatically
- Uses `tmux` to bring up all services and keep each window's logs

Common subcommands:

```bash
# Start
bash scripts/start_all_services_wsl.sh start

# Show status
bash scripts/start_all_services_wsl.sh status

# Enter the tmux session
bash scripts/start_all_services_wsl.sh attach

# Stop
bash scripts/start_all_services_wsl.sh stop

# Uninstall runtime components but keep the database, collection output and login configuration
bash scripts/start_all_services_wsl.sh uninstall keep-data

# Completely delete project-managed data (requires typing DELETE)
bash scripts/start_all_services_wsl.sh uninstall purge-data
```

After default startup you can access:

- Frontend:`http://localhost:5174`
- Backend health check:`http://127.0.0.1:8000/api/health`

### List current sites

```bash
python scripts/crawl.py list-sites
```

### Run one site once

```bash
python scripts/crawl.py run-site --site dragonforce --once
python scripts/crawl.py run-site --site darkforums --once
python scripts/crawl.py run-site --site chaos --once
```

### Run one site continuously

Continuous polling, running at each site's configured default interval:

```bash
python scripts/crawl.py run-site --site darkforums --continuous
```

Specify the polling interval manually:

```bash
python scripts/crawl.py run-site --site darkforums --continuous --interval-seconds 120
```

### View recent run records

```bash
python scripts/crawl.py show-runs --limit 20
```

## Bot assistant push

`darkweb_collector.bot_assistant` and `darkweb_collector.dingtalk_bot` support configuring a WeCom smart bot and a DingTalk custom bot at the same time. WeCom can receive threat intelligence summaries and monitoring notifications; after code monitoring completes, both kinds of bot receive records that are new and enter the "code leak monitoring main list", and the suppressed list is not pushed.

### Frontend configuration

After starting the backend API and frontend, go to:

```text
http://localhost:5174/collector-control
```

Fill in the "Bot Assistant Push" card:

- `Bot ID`: The Bot ID shown in the WeCom "Smart Bot" API configuration.
- `Secret`: The Secret shown in the WeCom "Smart Bot" API configuration.
- `DingTalk Webhook`: The full webhook provided by the DingTalk group custom bot; you can also enter only the `access_token`.
- `DingTalk signing Secret`: Fill this in when the custom bot has the "signing" security setting enabled; leave it empty if signing is not enabled.

In the WeCom admin console choose "API configuration" and select "Use long connection" as the connection method. After clicking "Save configuration", the configuration is saved to `bot_assistant_settings.json` in the backend runtime data directory; the page only shows a redacted Bot ID and never echoes the full Secret. After saving, add the bot to the target group chat or message it directly; the backend receives the callback over the long connection and registers that session automatically. Monitoring events and test pushes are sent to all registered sessions.

The DingTalk configuration is saved separately to `dingtalk_bot_settings.json` in the same runtime data directory, and the page only shows a redacted webhook. WeCom and DingTalk configurations do not overwrite each other and can both receive new hit notifications from the code leak monitoring main list.

### API configuration

Show configuration status:

```bash
curl http://127.0.0.1:8000/api/bot/status
```

Save the WeCom bot configuration:

```bash
curl -X POST http://127.0.0.1:8000/api/bot/config \
  -H "Content-Type: application/json" \
  -d '{"provider":"wechat_work_aibot","bot_id":"WeCom smart bot Bot ID","secret":"WeCom smart bot Secret"}'
```

Save and test the DingTalk bot configuration:

```bash
curl -X POST http://127.0.0.1:8000/api/dingtalk/config \
  -H "Content-Type: application/json" \
  -d '{"webhook_url":"https://oapi.dingtalk.com/robot/send?access_token=TOKEN","secret":"SEC..."}'
curl -X POST http://127.0.0.1:8000/api/dingtalk/send \
  -H "Content-Type: application/json" \
  -d '{"title":"Test push","content":"### Abyssal\n> DingTalk bot test message"}'
```

Trigger an intelligence summary push:

```bash
curl -X POST http://127.0.0.1:8000/api/bot/send \
  -H "Content-Type: application/json" \
  -d '{"type":"digest","limit":5}'
```

Local debugging without actually sending requests:

```bash
curl -X POST http://127.0.0.1:8000/api/bot/send \
  -H "Content-Type: application/json" \
  -d '{"type":"markdown","content":"### Test push","dry_run":true}'
```

### CLI and environment variable fallback

CLI uses the configuration saved in the backend and automatically registered session targets first; you can also pass the Bot ID, Secret and push target temporarily as arguments:

```bash
python scripts/crawl.py send-bot-message --type digest --limit 5
python scripts/crawl.py send-bot-message --type digest --bot-id "Bot ID" --secret "Secret" --chat-id "userid or chatid"
python scripts/crawl.py send-bot-message --type text --content "Abyssal test message"
python scripts/crawl.py send-bot-message --type markdown --content "### Abyssal\n> Test push"
python scripts/crawl.py send-bot-message --type digest --bot-id "Bot ID" --secret "Secret" --chat-id "userid or chatid" --dry-run
```

For deployment you can also keep using environment variables as fallback configuration:

```bash
export WECOM_BOT_ID="WeCom smart bot Bot ID"
export WECOM_SECRET="WeCom smart bot Secret"
export WECOM_HOME_CHANNEL="userid or chatid"
export DINGTALK_BOT_WEBHOOK="DingTalk custom bot Webhook"
export DINGTALK_BOT_SECRET="DingTalk signing Secret"
```

Group bot webhooks are still kept as a compatibility mode and can be used after explicitly setting `BOT_PROVIDER=wechat_work_webhook`:

- `WECHAT_WORK_BOT_WEBHOOK`
- `WECHAT_WORK_BOT_SECRET`
- `WECHAT_BOT_WEBHOOK`

### Start API

```bash
export PYTHONPATH="$PWD/src"
python -m uvicorn darkweb_collector.api_app:app --host 127.0.0.1 --port 8000
```

## Compatibility scripts

The project also keeps some compatibility or helper scripts:

- [fetch_dragonforce.py](./scripts/fetch_dragonforce.py)
- [fetch_darkforums.py](./scripts/fetch_darkforums.py)
- [fetch_onion_playwright.py](./scripts/fetch_onion_playwright.py)
- [fetch_onion_playwright_windows.py](./scripts/fetch_onion_playwright_windows.py)

Of these:

- `fetch_dragonforce.py` and `fetch_darkforums.py` are essentially thin wrappers around the unified CLI
- It is recommended to use `scripts/crawl.py`

## Queue mode

If you need to run tasks through a Celery/Redis queue:

Set Redis:

```bash
export REDIS_URL=redis://127.0.0.1:6379/0
```

Windows When one-click startup has no explicit `REDIS_URL`, it automatically prepares the project-managed Microsoft Garnet and uses `redis://127.0.0.1:6380/0`. This compatibility path always uses DB 0 and supports the Celery and state-lock commands the project currently uses; it should not be extended to Redis Streams or other unverified commands.

Start the worker:

```bash
python scripts/crawl.py worker --queue seed_http
python scripts/crawl.py worker --queue detail_http
python scripts/crawl.py worker --queue browser_public
python scripts/crawl.py worker --queue browser_onion
```

The one-click startup script starts two public browser workers and one Onion browser worker by default.
You can use `DARKWEB_BROWSER_PUBLIC_CONCURRENCY`,`DARKWEB_BROWSER_ONION_CONCURRENCY`
to scale each separately; the old `DARKWEB_BROWSER_CONCURRENCY` is still accepted as a total compatibility setting.
To ensure both queues can be consumed, the total number of browser workers in isolated mode is at least `2`.

Deliver due tasks:

```bash
python scripts/crawl.py enqueue-due
```

See [QUEUE_WORKFLOW.md](./QUEUE_WORKFLOW.md) for details.

## Output and data

### Output directory

Each site's output is in:

- `output/<site_name>/`

For example:

- `output/dragonforce/`
- `output/darkforums/`
- `output/chao/`

Common outputs include:

- `latest.json`
- `latest.html`
- `details/*.json`
- `details/*.html`
- Per-board output directories, for example `output/darkforums/databases/`

### Database

SQLite Default path:

- `data/collector.db`

After PostgreSQL data publishing is activated, the API and workers each reuse a thread-safe connection pool within their own process,
and roll back unfinished transactions before returning connections. By default each process uses at least `1` and at most `8` connections, waiting for a connection
for at most `10` seconds; these can be adjusted via `DARKWEB_POSTGRES_POOL_MIN`,
`DARKWEB_POSTGRES_POOL_MAX`and `DARKWEB_POSTGRES_POOL_WAIT_SECONDS` respectively.

Mainly contains:

- Collection results table
- forum topic/detail table
- `crawl_jobs` audit table
- `crawl_frontier` detail pending-fetch queue and `crawl_page_cursors` historical pagination cursors

## Continuous collection for data leak sites

`changan`, `darkforums`, `cracked`, `breachforums`, `spear`, `leakforum`, `raidforums`, `xforums` and `pwnfrm` use the unified pagination backfill and detail pending-fetch mechanism; `pwnfrm` is still disabled by default in the configuration.

- Each round first checks the newest page of each section, by default `recent_pages_per_run=1`
- Each site backfills at most `backfill_pages_per_run=5` historical pages per round in total, distributed fairly across sections with saved cursors
- When the unfinished detail backlog reaches `frontier_max_pending=500`, historical backfill pauses and newest pages continue to be checked
- Discovered details are persisted; insufficient quota for this round, waiting for retry or task interruption never mark them as fetched by mistake
- Details count toward `max_detail_pages_per_run` only after being claimed successfully, rotating across sections; tasks in cooldown do not block later fetchable tasks
- The discovered version and the successfully stored version are recorded separately, and content that has been fetched successfully and has not changed is skipped

“Site Management" expanded information and collection run summaries show pending, running, queue-completed and each section's historical cursor. Queue-completed counts discovered tasks and does not equal the source's total; reaching the last page of a list scan does not mean all details have been backfilled.

If you use `--continuous`, it does not request endlessly without pauses; instead it:

1. Runs one round
2. Sleeps
3. Runs the next round

The default interval comes from the site's `effective_interval_seconds` in `sites.yaml`.

## Onboarding a new site

When adding a new site, it must be onboarded into the current unified architecture instead of writing a separate standalone script.

Standard onboarding points:

1. Implement in `src/darkweb_collector/sites/<site>.py` parser
2. Implement in `src/darkweb_collector/adapters/<site>.py` `SiteAdapter`
3. Register in [registry.py](./src/darkweb_collector/adapters/registry.py)
4. Add the site configuration to [sites.yaml](./sites.yaml)
5. Use:

```bash
python scripts/crawl.py run-site --site <site_name> --once
```

to verify that onboarding succeeded

Data leak sites with paginated lists must reuse the shared pagination and pending-fetch mechanism; see [CRAWLER_ADAPTER_GUIDE.md](./CRAWLER_ADAPTER_GUIDE.md) for the onboarding protocol, default budgets, failure recovery and acceptance criteria. Sources without pagination, with incremental APIs or with only a few announcements should choose a discovery method that fits their capabilities, still reusing stable identifiers, version confirmation and bounded retries; do not add pointless requests just to make things uniform.

## Local HTML import and sample-based development

If you have obtained HTML samples through authorized means, you can develop parsers against local samples instead of debugging online directly:

```bash
python scripts/import_html_sample.py \
  --site dragonforce \
  --input /mnt/d/project/darkweb_collector/output/dragonforce/latest.html \
  --source-url http://dragonforxxbp3awc7mzs5dkswrua3znqyx5roefmi4smjrsdi22xwqd.onion/ \
  --output-json /mnt/d/project/darkweb_collector/output/imported/dragonforce_from_sample.json
```

This mode is suitable for:

- Offline parser development
- Field extraction debugging
- Building up regression test samples

## Current stability strategy

- Request timeouts
- Bounded retries
- SQLite Deduplication and incremental updates
- List pages are refetched every round, and detail pages are fetched on change
- A single detail failure does not block the whole seed task round
- Raw HTML and structured JSON are both written to disk

## Known limitations

- If a clearnet target site rate-limits, has TLS errors or the proxy is unstable, a single detail may still fail, but the whole round is not interrupted
- `.onion` sites depend on the availability of the Tor Browser SOCKS proxy
- `browser` mode costs more resources than non-browser mode and should only be used when JS rendering is really needed
- The current continuous mode is "polling-style continuous running", not high-frequency fetching without pauses

## Database and mirror file migration

The project supports generating a `.dwti` migration package with a deterministic external tool and then importing PostgreSQL data and mirror files in one go from an administrator page. On first startup, Windows, Debian / Ubuntu, WSL and Codespaces automatically prepare PostgreSQL 16; when an external target is explicitly configured, no local service is installed. External packaging tools and migration packages should be stored separately outside the project directory; the project itself only keeps PostgreSQL runtime preparation, import, verification, activation and rollback. See [DATA_MIGRATION.md](./DATA_MIGRATION.md) for deployment prerequisites and the import process.
