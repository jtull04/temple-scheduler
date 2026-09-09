const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { ensureLoggedIn, loadStorageStateOption } = require('./auth');

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

function formatLongDate(date) {
  // e.g. "Friday, September 11, 2026" — matches the site's displayed format.
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

// --- Wizard steps ----------------------------------------------------------

async function selectTemple(page) {
  const heading = page.getByRole('heading', { name: config.templeName });
  await heading.waitFor({ timeout: 20000 });

  const selectButton = page.getByRole('button', { name: 'Select this Temple' });
  if (await selectButton.count()) {
    await selectButton.click();
  }
  await screenshot(page, '01-temple-selected');
}

async function selectOrdinance(page) {
  await page.getByRole('radio', { name: 'Proxy' }).check();
  await page.getByRole('radio', { name: 'Endowment' }).check();
  await screenshot(page, '02-ordinance');
  await page.getByRole('button', { name: 'Next' }).click();
}

async function fillReservationDetails(page, targetDate) {
  const additionalGuests = page.getByRole('checkbox', { name: 'Additional guests' });
  if (!(await additionalGuests.isChecked())) {
    await additionalGuests.check();
  }

  await page.getByLabel('Male Guests').fill(String(config.maleGuests));
  await page.getByLabel('Female Guests').fill(String(config.femaleGuests));
  await page.getByLabel('Group Name').fill(config.groupName);

  await setReservationDate(page, targetDate);
  await screenshot(page, '03-reservation-details');
}

// The reservation date widget's exact interaction (typed input vs. a
// calendar popup) hasn't been verified against the live site yet. This
// tries a direct typed fill first, matching the display format seen in the
// UI, and falls back to opening the date picker if that doesn't stick.
async function setReservationDate(page, targetDate) {
  const dateInput = page.getByLabel('Reservation Date');
  const displayValue = formatLongDate(targetDate);

  await dateInput.click();
  await dateInput.fill(displayValue);
  await page.keyboard.press('Enter');

  const currentValue = await dateInput.inputValue().catch(() => '');
  if (currentValue.includes(displayValue)) {
    return;
  }

  throw new Error(
    `Could not set Reservation Date to "${displayValue}" via typed input ` +
    `(field shows "${currentValue}"). The date picker's calendar-popup ` +
    'interaction needs to be implemented/verified against the live site.'
  );
}

async function selectSession(page) {
  const row = page.getByRole('row', { name: new RegExp(config.sessionTimeLabel) });
  await row.waitFor({ timeout: 20000 });

  const seatsText = await row.innerText();
  if (/\b0\b\s*(?=\n|$)/.test(seatsText)) {
    log(`Warning: session row text suggests 0 seats may be available:\n${seatsText}`);
  }

  await row.getByRole('button', { name: 'Select' }).click();
  await screenshot(page, '04-session-selected');

  await page.getByRole('button', { name: 'Next' }).click();
}

async function submitReservation(page) {
  await screenshot(page, '05-finalize-review');

  if (config.dryRun) {
    log('DRY_RUN=true — stopping before Submit. Reservation was NOT made.');
    return { submitted: false };
  }

  await page.getByRole('button', { name: 'Submit' }).click();
  await page.waitForLoadState('networkidle');
  await screenshot(page, '06-confirmation');
  return { submitted: true };
}

// --- Entry point -----------------------------------------------------------

async function bookTemple(targetDate) {
  const browser = await chromium.launch({ headless: config.headless });
  const context = await browser.newContext({ storageState: loadStorageStateOption() });
  const page = await context.newPage();

  try {
    await ensureLoggedIn(context, page);
    log('Logged in.');

    await selectTemple(page);
    await selectOrdinance(page);
    await fillReservationDetails(page, targetDate);
    await selectSession(page);
    const result = await submitReservation(page);

    log(result.submitted
      ? `Reservation submitted for ${formatLongDate(targetDate)} at ${config.sessionTimeLabel}.`
      : 'Dry run complete.');

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
  const targetDate = dateArg ? new Date(`${dateArg}T00:00:00Z`) : config.nextFriday();

  log(`Booking ${config.templeName} for ${formatLongDate(targetDate)} `
    + `(${config.maleGuests} male + ${config.femaleGuests} female guests, group "${config.groupName}").`);

  bookTemple(targetDate).catch((err) => {
    console.error('Booking failed:', err.message);
    process.exit(1);
  });
}

module.exports = { bookTemple };
