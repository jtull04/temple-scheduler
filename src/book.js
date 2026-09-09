const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { ensureLoggedIn, loadStorageStateOption } = require('./auth');

// Prefer whatever Chromium build is actually installed under
// PLAYWRIGHT_BROWSERS_PATH over the revision this playwright version
// expects by default — keeps this working in environments where the
// browsers were pre-installed at a different revision than the npm package
// pins, without needing `npx playwright install`.
function resolveChromiumExecutable() {
  const browsersDir = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!browsersDir || !fs.existsSync(browsersDir)) return undefined;

  const candidate = fs.readdirSync(browsersDir)
    .find((name) => /^chromium-\d+$/.test(name));
  if (!candidate) return undefined;

  const exe = path.join(browsersDir, candidate, 'chrome-linux', 'chrome');
  return fs.existsSync(exe) ? exe : undefined;
}

// --- Small helpers -------------------------------------------------------

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function screenshot(page, name) {
  fs.mkdirSync(config.screenshotDir, { recursive: true });
  const file = path.join(config.screenshotDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// "Friday, September 11, 2026" — matches both the calendar day button's
// `title` attribute and the "*Reservation Date" label on the details screen.
function titleDate(date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}

// "Friday, September 11, 2026" with a zero-padded day — matches the session
// "Select" buttons' aria-label ("...for Friday, September 11, 2026 at 7:00 AM").
function ariaDate(date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: '2-digit', timeZone: 'UTC',
  });
}

// The Temple Online Scheduling UI is built with the "eden" component
// library: controls render as <button>/<input> but their accessible names
// rarely match the visible text, so we drive everything off the stable
// `data-id` attributes each control carries.
const SEL = {
  selectThisTemple: '[data-id="selectThisTemple"]',
  typeProxy: '[data-id="ordinanceSelect-PROXY"]',
  ordinanceEndowment: '[data-id="ordinanceSelect-PROXY_ENDOWMENT"]',
  nextButton: '[data-id="nextButton"]',
  additionalGuests: '[data-id="proxy-details-additional-guests-checkbox"]',
  maleGuests: '[data-id="male-guests"]',
  femaleGuests: '[data-id="female-guests"]',
  groupName: '[data-id="group-name-text"]',
  dateInput: '[data-id="sessionDateInput"]',
  nextMonth: '[data-id="nextCalendarButton"]',
  submitButton: '[data-id="scheduleApptButton"]',
};

// --- Wizard steps ----------------------------------------------------------

async function selectTemple(page) {
  const selectButton = page.locator(SEL.selectThisTemple);
  await selectButton.waitFor({ timeout: 20000 });
  await selectButton.click();

  // Land on the Ordinance step.
  await page.locator(SEL.typeProxy).waitFor({ timeout: 20000 });
  await screenshot(page, '01-temple-selected');
}

async function selectOrdinance(page) {
  await page.locator(SEL.typeProxy).check();
  await page.locator(SEL.ordinanceEndowment).check();
  await screenshot(page, '02-ordinance');

  const next = page.locator(SEL.nextButton);
  await next.waitFor({ state: 'attached' });
  await next.click();

  // Land on the Reservation-details step.
  await page.locator(SEL.additionalGuests).waitFor({ timeout: 20000 });
}

async function fillReservationDetails(page, targetDate) {
  const additionalGuests = page.locator(SEL.additionalGuests);
  if (!(await additionalGuests.isChecked())) {
    await additionalGuests.check();
  }

  await page.locator(SEL.maleGuests).waitFor({ timeout: 10000 });
  await page.locator(SEL.maleGuests).fill(String(config.maleGuests));
  await page.locator(SEL.femaleGuests).fill(String(config.femaleGuests));
  await page.locator(SEL.groupName).fill(config.groupName);

  await setReservationDate(page, targetDate);
  await screenshot(page, '03-reservation-details');
}

// The date field is a <button>; clicking it toggles a calendar popup. Retry
// the click until day buttons actually render.
async function openCalendar(page) {
  const anyDay = page.locator('button[data-id^="dayButton-"]').first();
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.locator(SEL.dateInput).click();
    try {
      await anyDay.waitFor({ state: 'visible', timeout: 3000 });
      return;
    } catch {
      // Click may have toggled it shut, or not opened yet — try again.
    }
  }
  await anyDay.waitFor({ state: 'visible', timeout: 5000 });
}

// Open the calendar popup, page forward to the target month if needed, and
// click the target day. The day <button> carries title="Friday, September
// 11, 2026"; unavailable days are disabled.
async function setReservationDate(page, targetDate) {
  const wanted = titleDate(targetDate);

  // Already set? (The site remembers the last-used date across steps.)
  const currentLabel = await page.locator(SEL.dateInput).innerText().catch(() => '');
  if (currentLabel.trim() === wanted) {
    return;
  }

  await openCalendar(page);

  const dayButton = page.locator(`button[title="${wanted}"]`);
  for (let i = 0; i < 14; i++) {
    if (await dayButton.count()) break;
    const nextMonth = page.locator(SEL.nextMonth);
    if (!(await nextMonth.isVisible().catch(() => false))) {
      throw new Error(`Calendar has no "Next month" control and ${wanted} is not shown.`);
    }
    await nextMonth.click();
    await page.waitForTimeout(400);
  }

  if (!(await dayButton.count())) {
    throw new Error(`Could not find calendar day for ${wanted}.`);
  }
  if (await dayButton.isDisabled()) {
    throw new Error(`Calendar day ${wanted} is disabled (temple closed / no reservations available).`);
  }

  await dayButton.click();

  // The picker closes and the date label updates.
  await page.waitForFunction(
    ({ sel, wanted }) => {
      const el = document.querySelector(sel);
      return el && el.innerText.trim() === wanted;
    },
    { sel: SEL.dateInput, wanted },
    { timeout: 10000 },
  );
}

async function selectSession(page, targetDate) {
  const timeLabel = config.sessionTimeLabel; // "7:00 AM"

  // Session "Select" buttons render as:
  //   <button data-id="sessionSelectBtn-N"
  //     aria-label="Select English session for Friday, September 11, 2026 at 7:00 AM">
  // Match on the date + time in the aria-label; fall back to time-only in
  // case the displayed date format ever drifts.
  const sessionBtns = page.locator('button[data-id^="sessionSelectBtn-"]');
  await sessionBtns.first().waitFor({ timeout: 20000 });

  // The session list is fetched asynchronously after the date changes; wait
  // for the listed sessions to actually be for the target date before
  // reading them (otherwise we see the previous date's stale list).
  const wantDate = ariaDate(targetDate);
  await page.waitForFunction(
    (want) => {
      const btns = [...document.querySelectorAll('button[data-id^="sessionSelectBtn-"]')];
      return btns.length > 0 && btns.every((b) => (b.getAttribute('aria-label') || '').includes(want));
    },
    wantDate,
    { timeout: 20000 },
  ).catch(() => {});
  // Seat counts (and therefore each button's disabled state) settle a beat
  // after the list re-renders for the new date.
  await page.waitForTimeout(1500);

  const byDateTime = new RegExp(
    `${escapeRegExp(ariaDate(targetDate))} at ${escapeRegExp(timeLabel)}$`,
  );
  let target = page.getByRole('button', { name: byDateTime });
  if (!(await target.count())) {
    target = page.getByRole('button', { name: new RegExp(` at ${escapeRegExp(timeLabel)}$`) });
  }

  if (!(await target.count())) {
    const offered = await sessionBtns.evaluateAll(
      (els) => els.map((e) => e.getAttribute('aria-label')),
    );
    throw new Error(
      `No ${timeLabel} session listed for ${titleDate(targetDate)}. Sessions offered:\n` +
      offered.map((o) => `  - ${o}`).join('\n'),
    );
  }

  target = target.first();

  if (await target.isDisabled()) {
    // The button disables when available seats < total attendees, so include
    // the seat row so it's clear whether it's "session full" or "not enough
    // seats for this group size".
    const rowText = await target
      .locator('xpath=ancestor::*[self::tr or contains(@class,"row")][1]')
      .innerText()
      .catch(() => '(seat row not found)');
    throw new Error(
      `The ${timeLabel} session on ${titleDate(targetDate)} can't be selected for a ` +
      `party of ${config.maleGuests + config.femaleGuests + 1} — not enough seats.\n` +
      `Seat row: ${rowText.replace(/\n/g, ' | ')}`,
    );
  }

  await target.click();

  // Picking a session auto-advances to the Finalize step (there is no Next
  // button to click here). Wait for the review screen to render.
  await page.locator(SEL.submitButton).waitFor({ timeout: 20000 });
  await screenshot(page, '04-session-selected');
}

async function submitReservation(page) {
  // Finalize / review step. Submit is <button data-id="scheduleApptButton">.
  const submit = page.locator(SEL.submitButton);
  await submit.waitFor({ timeout: 20000 });
  await page.waitForTimeout(1000);
  await screenshot(page, '05-finalize-review');

  const review = await page.evaluate(() => document.body.innerText);
  log(`Review screen text:\n${review}`);

  if (config.dryRun) {
    log('DRY_RUN=true — stopping before Submit. Reservation was NOT made.');
    return { submitted: false };
  }

  await submit.click();
  await page.waitForLoadState('networkidle');
  await screenshot(page, '06-confirmation');
  return { submitted: true };
}

// --- Entry point -----------------------------------------------------------

async function bookTemple(targetDate) {
  const browser = await chromium.launch({
    headless: config.headless,
    executablePath: resolveChromiumExecutable(),
  });
  const context = await browser.newContext({ storageState: loadStorageStateOption() });
  const page = await context.newPage();

  try {
    await ensureLoggedIn(context, page);
    log('Logged in.');

    await selectTemple(page);
    log('Temple selected.');
    await selectOrdinance(page);
    log('Ordinance: Proxy / Endowment.');
    await fillReservationDetails(page, targetDate);
    log(`Details filled (date ${titleDate(targetDate)}, ${config.maleGuests}M + ${config.femaleGuests}F guests).`);
    await selectSession(page, targetDate);
    log(`Session selected: ${config.sessionTimeLabel}.`);
    const result = await submitReservation(page);

    log(result.submitted
      ? `Reservation submitted for ${titleDate(targetDate)} at ${config.sessionTimeLabel}.`
      : 'Dry run complete — reached the review screen without submitting.');

    return result;
  } catch (err) {
    await screenshot(page, 'error').catch(() => {});
    throw err;
  } finally {
    await context.close();
    await browser.close();
  }
}

if (require.main === module) {
  const dateArg = process.argv[2];
  const targetDate = dateArg ? new Date(`${dateArg}T00:00:00Z`) : config.bookingDate();

  log(`Booking ${config.templeName} for ${titleDate(targetDate)} `
    + `(${config.maleGuests} male + ${config.femaleGuests} female guests, group "${config.groupName}").`);

  bookTemple(targetDate).catch((err) => {
    console.error('Booking failed:', err.message);
    process.exit(1);
  });
}

module.exports = { bookTemple };
