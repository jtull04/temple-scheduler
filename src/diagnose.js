// Staged diagnostic: walks the reservation wizard as far as STAGE says and
// dumps the real DOM of each screen (interactive controls + body text) so we
// can write correct selectors for src/book.js.
//
//   node src/diagnose.js            # go as far as currently known (STAGE=all)
//   STAGE=1 node src/diagnose.js    # stop after the Ordinance screen
//   STAGE=2 node src/diagnose.js    # stop after the reservation-details screen
//   STAGE=3 node src/diagnose.js    # stop after picking the 7:00 AM session
//   STAGE=4 node src/diagnose.js    # stop on the final review screen
const { chromium } = require('playwright');
const config = require('./config');
const { ensureLoggedIn, loadStorageStateOption } = require('./auth');
const { clickByText, describeScreen } = require('./dom');

const STAGE = process.env.STAGE && process.env.STAGE !== 'all'
  ? Number(process.env.STAGE)
  : 99;

function targetDate() {
  const arg = process.argv[2];
  return arg ? new Date(`${arg}T00:00:00Z`) : config.bookingDate();
}

function formatLongDate(date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}

(async () => {
  const browser = await chromium.launch({ headless: config.headless });
  const context = await browser.newContext({ storageState: loadStorageStateOption() });
  const page = await context.newPage();

  await ensureLoggedIn(context, page);
  console.log('Logged in. Target Friday:', formatLongDate(targetDate()));

  // ---- Screen 0: temple selection --------------------------------------
  await describeScreen(page, '0-temple-selection');

  await clickByText(page, 'Select this Temple');
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2500);

  // ---- Screen 1: Type + Ordinance ------------------------------------
  await describeScreen(page, '1-type-and-ordinance');
  if (STAGE <= 1) return void (await browser.close());

  await page.locator('[data-id="ordinanceSelect-PROXY"]').check();
  await page.locator('[data-id="ordinanceSelect-PROXY_ENDOWMENT"]').check();
  await page.waitForTimeout(500);
  await page.locator('[data-id="nextButton"]').click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2500);

  // ---- Screen 2: reservation details ---------------------------------
  await describeScreen(page, '2-reservation-details');

  await page.locator('[data-id="proxy-details-additional-guests-checkbox"]').check();
  await page.locator('[data-id="male-guests"]').fill('3');
  await page.locator('[data-id="female-guests"]').fill('2');
  await page.locator('[data-id="group-name-text"]').fill(config.groupName);
  await page.waitForTimeout(1000);
  await describeScreen(page, '2b-additional-guests-expanded');
  if (STAGE <= 2) return void (await browser.close());

  // ---- Screen 3: pick target Friday + 7:00 AM session --------------
  const t = targetDate();
  const wanted = formatLongDate(t);
  await page.locator('[data-id="sessionDateInput"]').click();
  await page.locator('button[data-id^="dayButton-"]').first().waitFor();
  const day = page.locator(`button[title="${wanted}"]`);
  for (let i = 0; i < 12 && !(await day.count()); i++) {
    await page.locator('[data-id="nextCalendarButton"]').click();
    await page.waitForTimeout(400);
  }
  await day.click();
  await page.waitForTimeout(2500);
  await describeScreen(page, '3-sessions-for-target-date');

  await page.getByRole('button', { name: new RegExp(` at ${config.sessionTimeLabel}$`) }).first().click();
  await page.waitForTimeout(3000);
  if (STAGE <= 3) return void (await browser.close());

  // ---- Screen 4: Finalize / review -------------------------------
  await describeScreen(page, '4-finalize-review');

  await browser.close();
})().catch(async (err) => {
  console.error('diagnose failed:', err);
  process.exit(1);
});
