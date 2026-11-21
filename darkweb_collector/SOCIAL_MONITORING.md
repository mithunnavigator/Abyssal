# Social Platform Monitoring (Public Index Mode)

This module manages monitoring targets on the "Social Platform Monitoring" page and only processes public single posts on X and Facebook. No platform accounts, cookies or account pools are needed, and no paid platform APIs are called; it does not read comments, private content or posts not indexed by search engines.

## Sources and coverage limits

- X: First queries Social Searcher's X-specific programmable search page, then the X-specific search pages listed in the Awesome OSINT List.
- Facebook: Queries the Facebook-specific search pages listed in the Awesome OSINT List.
- These pages are all based on the Google index and cannot be treated as independent sources of fact, nor do they guarantee real-time or complete coverage. Only the first page is read for each search term; when a verification page, rate limiting or no readable results appear, a source error is recorded and no bypass is attempted.
- Only single X/Facebook post URLs are accepted; profile pages, groups and other domains are rejected. X text is completed through the public embed API; for Facebook only anonymously visible public metadata is read, which may be just a summary. When the original post is inaccessible, a search snippet can at most become an `unverified_search_hit` and never poses as verified body text.

## Usage

Administrators create monitoring targets on the page, entering a name, company aliases, risk terms and up to 4 groups of search terms. The CATL example button only fills in the form; it does not save automatically or claim any discovered events. Once saved and enabled, the API process checks for due tasks every minute and runs a round every 120 minutes by default; administrators can also click "Scan now". The system uses database leases to avoid overlapping scans and keeps scheduling based on `next_scan_at` after a restart.

Regular accounts must be assigned the `social_monitoring` module permission by an administrator to view and review results; creating, editing and manual scans can only be done by administrators, and the server enforces the same permissions. Results are deduplicated by monitoring target, platform and post ID, keeping first/last seen times, source mode, scan status and manual verdicts. `candidate` only means the original post text or public metadata matched both the company and a risk term; it is not a confirmed security event. "Independently corroborated" requires the analyst to provide an HTTPS evidence link from outside social platforms and a note. Post bodies and search snippets are only used for matching during scans and are not stored; only safe metadata such as the link, redacted title and matched terms is kept. When opening a lead's details, the public page can be re-read on demand to temporarily show a redacted preview of up to 600 characters; Facebook public metadata is clearly marked "not full text", and the preview is not stored and the API forbids caching it.

The backend depends on the existing `playwright` installation and an available Chromium; on Windows, if Playwright Chromium is missing, the installed Chrome is used. If the browser cannot start, a failed scan record is left and retried after 15 minutes. The module does not send notifications automatically or publish content to external platforms.

API prefix: `/api/social-monitoring`. The main endpoints are `status`, `watchlists`, `watchlists/{id}/scan`, `watchlists/{id}/hits`, `watchlists/{id}/scans`, `hits/{id}/preview` and `hits/{id}/review`.
