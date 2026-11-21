# Code Monitoring False-Positive Classification and Suppression Playbook

## 1. Purpose and scope

This document systematically organizes the false-positive types, causes, suppression strategies, decision matrix and reusable industry approaches for the "Code Monitoring" module of this project, focusing on the scenario of "monitoring code leaks around a company".

Intended audience:

- Code monitoring rule designers
- Platform operators and manual reviewers
- Developers who need to improve the hit accuracy of company-related code leak detection

This document focuses on:

- How to distinguish between "mentions the company" and "company leak”
- How to reduce false positives from brand terms, email addresses, variable names, seed data and stock/securities contexts
- How to adopt mature industry practices (validity verification, allowlists, baselines, context suppression, auto-ignore) to guide the project's evolution

---

## 2. Overview of current false-positive problems

The core problem of the current project is not "too few sensitive rules", but that "company relevance" and "leak risk" are calculated together.

The main symptoms are:

1. After matching a company name, brand term or domain, results easily go straight into the high-risk scoring path.
2. Email domains (such as `@catl.com`) are often treated as high-risk signals, but in many cases they are just contacts, suppliers, test data or demo samples.
3. `token`, `password`, `api_key` and similar variable names, parameter names and function names are misidentified as real credentials.
4. Stock, securities, research report and market analysis code frequently mentions a company's full name or brand, but is essentially just public market data processing.
5. Company names, company emails, fake passwords and `localhost` connection strings in seed data, demos, samples and test repositories are misjudged as real leaks.
6. The same kind of false positive has no stable "suppression category", so manual review experience cannot be captured.

Judging from samples in the current project, at least the following typical false positives have occurred:

- Stock code mapping: `CATL -> 300750.SZ`
- Contact/supplier email: `ligang@catl.com`,`info@catl.com`
- Login flow variable: `token = access_token`,`password = user_input`
- Seed data:`seed_demo_data.py`
- Local database string:`jdbc:postgresql://localhost:5432/...`
- Local Redis:`redis://localhost:6379/0`
- Normal config flow:`config_flow.py`
- Repository/path names containing a short brand term: `catlink`,`scatl`

---

## 3. Layered decision principles

Company code monitoring should use a four-layer model instead of a single-layer "search term hit + sensitive rule hit" model.

### 3.1 Layer 1: Company relevance

First determine "whether this code is really related to the target company".

Suggested grading of company anchors:

- A Strong anchors
  - Company full name
  - Company primary domain
  - Company email domain
  - Company subdomain
- B Medium anchors
  - Manually maintained brand aliases
  - English abbreviations
- C Weak anchors
  - Short brand terms
  - Highly ambiguous abbreviations

Decision principles:

- Only when an A/B/C anchor holds does the result enter company risk scoring.
- Short terms (such as `catl`) cannot establish a company hit by substring alone.
- Weak anchors only take effect when they co-occur with strong anchors, company system terms, email domains, subdomains and so on.

### 3.2 Layer 2: Context intent

Once company relevance holds, determine the context in which the company name appears in the code.

Suggested context categories:

- Leak/integration context
  - Login
  - Connect
  - Call
  - Authentication
  - SDK/API Client
- Public information context
  - Stock
  - ticker
  - symbol
  - Market quotes
  - Securities
  - Financial reports
  - Research reports
  - News
- Test/demo context
  - seed
  - demo
  - sample
  - faker
  - test
  - password123
  - hashedPassword

### 3.3 Layer 3: Leak evidence

Only when company relevance holds and the context is not obviously "public information/test sample" do we go on to determine whether there is real leak evidence:

- Hard-coded token / AK/SK / secret / private key
- Company database connection string
- Internal network address
- Redis / MQ / VPN / SSO / Zabbix / Company API
- `login(...)`, `connect(...)`, `requests.post(...)`,`zapi.login(...)`

### 3.4 Layer 4: Validity and priority

Finally determine whether there is "real exploitability":

- Is it a literal or a variable name?
- Is it a real connection or `localhost`?
- Is it a demo sample or a real business system?
- Is it a fake or test value, or high-entropy and formatted like a real credential?

---

## 4. False-positive classification table + suppression strategy table

The table below lists the most common false-positive types in the project, their triggers, decision criteria and recommended suppression strategies.

| No. | False-positive type | Typical example | Cause | Recommended suppression | Default risk verdict |
|---|---|---|---|---|---|
| 1 | Company mentioned but not leaked | Company name appears in ordinary business code | Only shows "related", not "leaked" | Decouple company relevance from leak risk; company name does not raise risk directly | Low or lead only |
| 2 | Stock/securities/research/market data | `CATL -> 300750.SZ` | Company name appears in public securities semantics | Force down-weighting when `stock/ticker/symbol/A-share/market/securities/finance/news/research` matches | Low |
| 3 | Email hit without credentials | `ligang@catl.com` | Just contact, supplier or directory information | Email serves only as a company anchor; without credentials or access capability it is not raised to high | Below medium |
| 4 | Company email in seed data | `info@catl.com` in `seed_demo_data.py` | Test or initialization sample | Down-weight overall when `seed/demo/sample/faker/test` matches; email alone does not raise risk | Low |
| 5 | Variable name false positive | `token = access_token` | Just passing a variable, not a leaked value | Distinguish variable names from literals; down-weight when the right-hand side is a variable/function call | Low |
| 6 | Authentication logic false positive | `password = user_input`, `create_access_token(...)` | Normal login flow | Push down to medium/low when there is no company domain/company system URL/real credential | Low or medium |
| 7 | Hashing/encryption false positive | `hashedPassword`, `bcrypt.hash(...)` | Matches password but is not a plaintext leak | Down-weight hashing/encryption actions separately | Low |
| 8 | Local default configuration false positive | `redis://localhost:6379/0` | Development default | Always down-weight `localhost/127.0.0.1`; do not count it as real infrastructure | Low |
| 9 | Local database string false positive | `jdbc:postgresql://localhost:5432/...` | Local development connection | Suppress directly for non-company domains, non-production IPs and `localhost` | Low |
| 10 | README/Tutorial/documentation false positive | `.md`, installation guides | Example values, demo configuration | Down-weight documentation paths; only escalate with a real literal + company anchor | Low |
| 11 | Log/error/comment false positive | `Incorrect Password`, `token expired` | Just descriptive text | Prompt text and comment semantics do not count as credential hits | Low |
| 12 | Repository/path name substring false positive | `catlink`, `scatl` | Short brand term substring match | Short brand terms must use word-boundary matching; a path-only hit does not establish a company hit | Low |
| 13 | Demo account/fake password false positive | `password123`, `test@example.com` | Common test samples | Maintain a stopword set of test/example values | Low |
| 14 | Public customer/supplier directory false positive | `CATL supplierContact` | A public business directory, not a leak | Keep contact/directory data only as leads, not high | Below medium |
| 15 | Public API sample code false positive | `api_key = get_api_key()` | API wrapper code, not a leaked value | Down-weight function return values and environment variable reads | Below medium |
| 16 | Generic high-entropy string false positive | Random hashes, IDs, signature strings | Long strings look like secrets | Combine entropy + context + naming; length alone is not enough | Below medium |
| 17 | Temporary cloud credential unrelated to the target company | An AWS token that happens to contain `catl` | The credential itself is dangerous, but it is not a leak by this company | Suppress in the company monitoring pool; can go into a separate "generic sensitive leak pool" | Not a company event |
| 18 | Fork/Mirror duplicate false positive | The same problematic code appears in several forks | Noise amplification | Add content fingerprints and source aggregation | Aggregate by source |
| 19 | Config flow/form input false positive | Home Assistant config flow | Matches password but is only a user input field | Down-weight form inputs, config flows and schema definitions | Low |
| 20 | Company name + public market context + credential-like variable | `api_key` and company name co-occur in stock query code | Company relevance holds, but it is not an internal company leak | Down-weight the "public market/securities" context first, overriding ordinary sensitive-term bonuses | Below medium |

---

## 5. Why do "the same email hits get different levels”

When the same company email domain matches, some results are high and others medium because the email is only one kind of company anchor, and the final level also stacks the following factors:

1. Company anchor strength
   - `@catl.com`
   - `*.catl.com`
   - Company full name
   - Company system terms (such as `zabbix`, `eicc`)

2. Whether a real sensitive rule matched
   - `token`
   - `AK/SK`
   - `db_url`
   - `private_key`

3. Whether there is system access capability
   - `login(...)`
   - `api_token`
   - `requests.post(...)`
   - `connect(...)`

4. File type
   - `.env`and configuration files rank higher than ordinary source code

5. Whether it is recognized as a demo/test/localized context
   - `seed`
   - `demo`
   - `localhost`
   - `password123`

Therefore:

- `Email + no credentials + demo data` is better suited to medium/low
- `Email/domain + hard-coded credentials + system access calls` is what should be high

---

## 6. Recommended suppression priorities for the project

To maximize benefit, the following four kinds of suppression should be done first:

### Priority 1: Short brand term false-positive suppression

Applies to:

- `catl`
- `dbs`
- Other short, highly ambiguous brand terms/abbreviations

Strategy:

- By default, do not count a substring match directly as a company hit
- Requirements:
  - Word-boundary matching, or
  - Co-occurrence with company domains, email domains, subdomains or system terms

### Priority 2: Public securities/financial information suppression

Applies to:

- Stock code mapping
- Market analysis
- Financial news
- Research report parsing

Strategy:

- Recognize and suppress these context terms:
  - `stock`
  - `ticker`
  - `symbol`
  - `A-share`
  - `finance`
  - `market`
  - `news`
  - `research`
  - `Research reports`
  - `Securities`
  - `Market quotes`

### Priority 3: Seed/demo/test data suppression

Applies to:

- `seed_demo_data.py`
- `db_init.py`
- `sample`
- `faker`
- `test`

Strategy:

- Down-weight overall when these terms appear in file names, directory names or code context
- `password123`, `hashedPassword` and `localhost` as strong negative signals

### Priority 4: Variable names vs literal credentials

Applies to:

- `token = access_token`
- `api_key = _get_api_key()`
- `password = user_input`

Strategy:

- Variable passing, function returns and environment variable reads should not be escalated as real credentials
- What should really be escalated is:
  - Hard-coded literals
  - Connection strings, secret keys and token

---

## 7. High-risk escalation matrix (company-centric)

### 7.1 Recommended conditions for direct high risk

Any of the following combinations can be rated high directly:

1. Company domain/subdomain/email domain + hard-coded token/secret/AK/SK/private key
2. Company system URL + credentials + login/connect/call action
3. Company anchor + non-local database connection string + obvious integration code
4. Company anchor + credential literal + monitoring/ops/SSO/VPN/internal API calls

### 7.2 Recommended conditions for medium only

1. Company email/domain matched, but no real credentials
2. Company anchor holds, but it is only contact, supplier or directory data
3. Company anchor + function-style/variable-style token/password, not a literal
4. Company anchor + `localhost`, local Redis or local database

### 7.3 Recommended conditions for low only or exclusion

1. Only a short brand term substring matched
2. Stock/securities/market context
3. Seed/test/demo data
4. Example values in docs/tutorials/README

---

## 8. Related industry solutions and lessons for the project

Below are mature mechanisms in mainstream secret scanning/leak detection tools that relate directly to false-positive suppression.

### 8.1 GitHub Secret Scanning

References:

- [Supported secret scanning patterns](https://docs.github.com/en/code-security/reference/secret-security/supported-secret-scanning-patterns)
- [Secret scanning detection scope](https://docs.github.com/en/code-security/reference/secret-security/secret-scanning-detection-scope)
- [Defining custom patterns for secret scanning](https://docs.github.com/en/code-security/how-tos/secure-your-secrets/customize-leak-detection/defining-custom-patterns-for-secret-scanning)
- [Responsible detection of generic secrets with Copilot secret scanning](https://docs.github.com/code-security/secret-scanning/about-the-detection-of-generic-secrets-with-secret-scanning)

Lessons:

- GitHub Distinguish "known provider patterns" from "generic patterns".
- Generic secrets have higher false-positive rates and therefore need more caution.
- GitHub It states explicitly: **generic/non-provider patterns usually have no validity check**.
- GitHub Custom patterns are supported, but you take on the precision/recall trade-off yourself.

Implications for this project:

- Your "company term monitoring" is essentially closer to generic matching and should not be high-confidence by default.
- Company monitoring must additionally layer "company anchor + leak evidence + context".

### 8.2 Yelp detect-secrets

References:

- [Yelp/detect-secrets README](https://github.com/Yelp/detect-secrets)
- [detect-secrets design](https://github.com/Yelp/detect-secrets/blob/master/docs/design.md)
- [detect-secrets plugins](https://github.com/Yelp/detect-secrets/blob/master/docs/plugins.md)
- [detect-secrets filters](https://github.com/Yelp/detect-secrets/blob/master/docs/filters.md)

Lessons:

- detect-secrets The core idea is: **plugins discover, filters suppress false positives**.
- baseline The mechanism lets you record and exempt known false positives/legacy results.
- The tool itself assumes that "high recall" must be followed by heavy filtering and manual review.

Implications for this project:

- Code monitoring should be explicitly split into:
  - Discovery rules
  - Suppression filters
  - Manual review write-back
- A "false-positive baseline" or "known false-positive profile" needs to be introduced, otherwise operational experience cannot be captured.

### 8.3 Gitleaks

References:

- [Gitleaks README](https://github.com/gitleaks/gitleaks)
- [gitleaks allowlist implementation](https://github.com/gitleaks/gitleaks/blob/master/config/allowlist.go)
- [default gitleaks config](https://github.com/gitleaks/gitleaks/blob/master/config/gitleaks.toml)
- [detect engine allowlist and entropy behavior](https://github.com/gitleaks/gitleaks/blob/master/detect/detect.go)

Lessons:

- Gitleaks Supports:
  - global allowlist
  - per-rule allowlist
  - stopwords
  - path allowlists
  - entropy threshold
- It explicitly supports "path-level suppression" and "keyword-level suppression".

Implications for this project:

- Company monitoring can establish:
  - Global suppression terms
  - Rule-level suppression terms
  - File path suppression
  - False positive stopwords
- Especially suitable for suppressing:
  - `seed`
  - `demo`
  - `sample`
  - `README`
  - `test`

### 8.4 TruffleHog

References:

- [How TruffleHog Verifies Secrets](https://trufflesecurity.com/blog/how-trufflehog-verifies-secrets)
- [TruffleHog terminology](https://docs.trufflesecurity.com/terminology)
- [TruffleHog custom detectors](https://docs.trufflesecurity.com/custom-detectors)

Lessons:

- TruffleHog The core advantage is **verification**.
- It strictly separates "live secret" from "invalid/false positive".
- Custom detectors also emphasize combining entropy thresholds with verification logic.

Implications for this project:

- For company code monitoring, what makes something truly high risk is not "looks like it" but "looks like it and works".
- `GPU_Monitor` It is high risk not just because of the token, but because:
  - Company subdomain
  - token Literal
  - `zapi.login(...)`
  - This comes close to "exploitability”

### 8.5 GitGuardian

References:

- [GitGuardian FAQ](https://docs.gitguardian.com/secrets-detection/secrets-detection-engine/frequently_asked_questions)
- [Pre-Validators and Post-Validators](https://docs.gitguardian.com/secrets-detection/secrets-detection-engine/validation)
- [Auto-ignore false positives](https://docs.gitguardian.com/platform/automate-with-playbooks/available-playbooks)
- [Investigate incidents](https://docs.gitguardian.com/internal-monitoring/remediate/investigate-incidents)
- [Public remediation overview](https://docs.gitguardian.com/public-monitoring/remediate/remediation-overview)

Lessons:

- GitGuardian It clearly distinguishes:
  - pre-validators
  - post-validators
  - validity checks
  - ML-based false positive remover
- It also provides a playbook for automatically ignoring false positives.
- Public materials also suggest that "a secret appearing externally more than 10 times is more likely a false positive/public sample".

Implications for this project:

- Company monitoring can introduce:
  - Pre-filters: allowlists for file names, paths and context
  - Post-filters: company relevance, demo/seed/securities semantic suppression
  - Auto-ignore: items manually confirmed as false positives go into a local baseline
  - Aggregation and deduplication: the same content repeated across several forks is not counted as high risk repeatedly

---

## 9. Recommended implementation strategy for the project (strategy level, not tied to code details)

### 9.1 Core principles that must be kept

- Company relevance is not itself a risk
- A company email is not itself high risk
- A short brand term is not a strong company anchor
- High risk should be determined more by "exploitability"

### 9.2 Suppression capabilities that must be added

1. Short-term protection
2. Securities/financial context suppression
3. Seed/test/demo context suppression
4. Variable names vs literal credentials
5. Local development configuration suppression
6. Docs/README/tutorial suppression
7. Same-source content aggregation

### 9.3 Explanation capabilities that must be added

The detail page must be able to explain:

- Why it is considered related to the company
- Why it is considered high/medium risk
- Why it is only a lead and not a leak
- Why it is still suppressed even though an email matched

---

## 10. Recommended operational loop

For false-positive suppression to stay effective over time, manual reviews should always apply a false-positive label.

Recommended false-positive labels:

- `Public securities information`
- `Contact/supplier email`
- `Variable name mismatch`
- `Login flow/authentication logic`
- `Demo/seed data`
- `Local development configuration`
- `README/Documentation example`
- `Unrelated third-party credential`
- `Duplicate mirror/Fork`

These can later be used to generate:

- Path allowlists
- Context stopwords
- Company negative-example profiles
- Auto-ignore rules

---

## 11. The most valuable next steps for the current project

Ranked by benefit, the items most worth implementing first are:

1. `catl` Always downgrade standalone substring hits of short brand terms such as
2. Stock/securities/research report context suppression
3. Demo/seed/test data suppression
4. Pure email hits are not high risk by default
5. “Only "company anchor + credentials + system access capability" is directly high risk

---

## 12. Conclusion

The root cause of false positives in the current project is not too few rules, but:

- Mistaking a company mention for a company leak
- Mistaking sensitive terms for real credentials
- Mistaking relevance for exploitability

To improve accuracy at the root, the decision flow must be reliably split into:

1. Company relevance
2. Context intent
3. Leak evidence
4. Exploitability
5. False-positive baseline and auto-ignore

This is also the common direction of mature solutions such as GitHub Secret Scanning, detect-secrets, Gitleaks, TruffleHog and GitGuardian:  
**Discover first, then filter, then verify, then capture false-positive experience.**

