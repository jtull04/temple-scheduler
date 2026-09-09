# temple-scheduler

Automates a weekly proxy endowment reservation at the Provo City Center
Temple for Joshua Tullis plus 3 additional male guests and 2 female guests
(6 total, the site's per-reservation limit), every Friday at the 7:00 AM
session.

## Status

**Blocked on network access.** This project is being built inside a Claude
Code cloud environment whose network policy currently blocks all
`churchofjesuschrist.org` subdomains (confirmed: `tos.`, `lcr.`, `id.`, and
`www.` all return 403 from the environment's egress gateway). The
automation code is written, but it can't be tested or run here until that
policy allows the domain. See the environment's network settings on
claude.ai/code, or run this locally instead (see below).

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

## Setup

```
npm install
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

Once network access and the live-site selectors are verified, a weekly
Claude Code Routine (trigger) will run this script with enough lead time
before each Friday to fall inside the site's booking window, using the
stored environment credentials.

## MFA caveat

If Church Account requires MFA (push/code) on a fresh login, this script
cannot complete that step unattended. Session reuse via `storage_state.json`
minimizes how often a fresh login (and therefore MFA) is needed, but a fully
unattended weekly run is only reliable if MFA isn't required for this
account/device, or if the cached session stays valid across the week.
