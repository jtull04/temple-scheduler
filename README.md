# temple-scheduler

Automates a weekly proxy endowment reservation at the Provo City Center
Temple for Joshua Tullis plus 3 additional male guests and 2 female guests
(6 total, the site's per-reservation limit), every Friday at the 7:00 AM
session.

## Status

**Must be run locally, not in a Claude Code cloud sandbox.** The
automation is written and believed correct, but a Claude Code cloud
environment's egress proxy cannot carry real Chromium/Playwright browser
traffic — confirmed by testing: plain `curl` and raw Node TLS connections
through the proxy work fine (including to `tos.churchofjesuschrist.org`),
but every Chromium-driven request resets after ~6 seconds, even to
unrelated sites like `example.com`, regardless of TLS flags tried
(disabling Encrypted Client Hello, post-quantum key share, HTTP/2, QUIC).
This is an infrastructure-level limitation of that sandbox's proxy, not a
site- or domain-specific block, and not something fixable from inside the
script. Run this on your own machine instead (see Setup below) — the same
approach used for the byu-room-booker tool.

## What it does

1. Logs in to Church Account (session cookies are cached in
   `storage_state.json` so subsequent runs skip login when possible).
2. Opens the reservation wizard at `tos.churchofjesuschrist.org`.
3. Selects the Provo City Center Temple (the account's default temple).
4. Selects Proxy → Endowment, and advances.
5. Turns on "Additional guests", sets Male Guests / Female Guests / Group
   Name, and sets the reservation date to the target Friday.
6. Selects the 7:00 AM session and advances.
7. Submits the reservation (unless `DRY_RUN=true`).

Screenshots of each step are saved to `screenshots/` for verification.

## Setup (run this on your own computer)

```
git clone https://github.com/jtull04/temple-scheduler
cd temple-scheduler
git checkout claude/temple-appointment-automation-mrjh3b
npm install
npx playwright install chromium   # downloads a matching Chromium build
cp .env.example .env   # then fill in CHURCH_USERNAME / CHURCH_PASSWORD
```

Run once manually, with the browser visible, to confirm the flow and to
handle any MFA challenge Church Account throws at first login:

```
HEADLESS=false DRY_RUN=true npm run book
```

Once you're confident it works, drop `DRY_RUN` to actually submit:

```
npm run book              # books the next upcoming Friday
node src/book.js 2026-09-25  # books a specific Friday (YYYY-MM-DD)
```

## Known unverified pieces

These were written from the visible UI (screenshots) rather than the live
DOM, since this environment couldn't reach the site to inspect it. They'll
need a live dry run to confirm/fix:

- **Reservation Date field** (`src/book.js` → `setReservationDate`): assumes
  the date input accepts typed text in the displayed long-date format
  (e.g. "Friday, September 11, 2026"). If the site actually requires
  clicking through a calendar popup, this will throw a clear error and
  needs a follow-up fix rather than failing silently.
- **Session row / seat availability check**: assumes the sessions table
  renders as accessible `row`s Playwright can query by visible time text.

Run with `HEADLESS=false` the first few times so you can watch it and catch
anything that doesn't match.

## Credentials & secrets

- `CHURCH_USERNAME` / `CHURCH_PASSWORD` are read from environment variables
  (via `.env` locally, which is gitignored — never committed).
- For the scheduled/unattended weekly run, set these as environment
  variables on the Claude Code **environment** itself (not just a session),
  so a fresh scheduled session can read them without the secrets ever
  touching the git repo.
- `storage_state.json` (cached login session) and `screenshots/` are also
  gitignored, since they can contain session cookies / personal info.

## Scheduling

Once the live-site selectors are verified locally, schedule `npm run book`
to run weekly with enough lead time before each Friday to fall inside the
site's booking window — e.g. a `cron` job (Linux) or a `launchd` agent
(macOS) pointed at `node src/book.js` in this directory, similar to how
byu-room-booker is scheduled.

## MFA caveat

If Church Account requires MFA (push/code) on a fresh login, this script
cannot complete that step unattended. Session reuse via `storage_state.json`
minimizes how often a fresh login (and therefore MFA) is needed, but a fully
unattended weekly run is only reliable if MFA isn't required for this
account/device, or if the cached session stays valid across the week.
