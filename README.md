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

## Which Friday it books

With no date argument, `book.js` books the Friday **two weeks out**: the
coming Friday (or today, if today is a Friday) plus 14 days. So a job that
runs every Friday always books the Friday 14 days later; running any day
Sun–Fri books the same target for that week. Override the lead time with
`BOOKING_LEAD_DAYS` (a multiple of 7). Pass an explicit `YYYY-MM-DD` to
book a specific date instead.

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
npm run book              # books the Friday two weeks out
node src/book.js 2026-09-25  # books a specific Friday (YYYY-MM-DD)
```

## Selectors

The site is built with the "eden" component library. Controls render as
real `<button>`/`<input>` elements but their accessible names rarely match
the visible text, so `getByRole`/`getByLabel` mostly miss. Every step in
`src/book.js` instead targets the stable `data-id` attribute each control
carries (`selectThisTemple`, `ordinanceSelect-PROXY_ENDOWMENT`,
`proxy-details-additional-guests-checkbox`, `male-guests`, `sessionDateInput`,
`sessionSelectBtn-N`, `scheduleApptButton`, …), all verified against the
live DOM with `src/diagnose.js`.

Notes on the flow, confirmed live:

- **Reservation Date** is a calendar popup, not a typed field. `book.js`
  opens it, pages forward with the "Next month" arrow, and clicks the day
  `<button title="Friday, September 11, 2026">`.
- **Picking a session auto-advances to the Finalize step** — there is no
  "Next" button to click after selecting a time.
- A session's **Select button is disabled when available seats < party
  size** (here 6). `book.js` reports this with the seat row rather than
  hanging. The weekly run books ~2 weeks out, when seats are plentiful.

Run with `HEADLESS=false` the first few times so you can watch it.

To re-inspect a screen after a site change: `STAGE=1..4 node src/diagnose.js`.

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

Schedule `node src/book.js` (in this directory, without `DRY_RUN`) to run
once a week — a `launchd` agent (macOS) or `cron` job (Linux) on an
always-on machine. Fridays are the natural cadence: each run then books the
Friday exactly 14 days later. The booking window opens more than a month
ahead, so seats are plentiful at that lead time.

Still to wire up before trusting it unattended:

- **Failure alerts.** A failed run saves `screenshots/error.png` and exits
  non-zero but notifies no one. Have the scheduler email/text on non-zero
  exit, or a bad week passes silently.
- **Session lifetime / MFA.** See below — confirm how long the cached login
  lasts and whether MFA can be avoided for this account/device.
- **Already-booked check.** `book.js` does not yet look at "My Temple
  Reservations" first, so a re-run could attempt a second reservation for
  the same week.

## MFA caveat

If Church Account requires MFA (push/code) on a fresh login, this script
cannot complete that step unattended. Session reuse via `storage_state.json`
minimizes how often a fresh login (and therefore MFA) is needed, but a fully
unattended weekly run is only reliable if MFA isn't required for this
account/device, or if the cached session stays valid across the week.
