const fs = require('fs');
const config = require('./config');

const RESERVATION_URL = 'https://tos.churchofjesuschrist.org/?lang=eng';
// The "Make a Reservation" heading only renders once Church Account SSO has
// completed and the wizard has loaded (confirmed against the live site).
const LOGGED_IN_HEADING = 'Make a Reservation';

// Church Account login form. These selectors come from the lcr-api-2
// project (https://pypi.org/project/lcr-api-2/), which automates the same
// Church Account SSO used across churchofjesuschrist.org properties.
async function performLogin(page) {
  const username = config.churchUsername();
  const password = config.churchPassword();

  const usernameInput = page.locator("input[autocomplete='username']");
  await usernameInput.waitFor({ timeout: 20000 });
  await usernameInput.fill(username);
  await page.locator('#button-primary').click();

  const passwordInput = page.locator('#password-input');
  await passwordInput.waitFor({ timeout: 20000 });
  await passwordInput.fill(password);
  await page.locator('#button-primary').click();

  // Church Account may prompt for MFA here (push notification, code, etc).
  // That step can't be scripted; if it appears, this wait will time out and
  // the caller should surface a clear error rather than hang indefinitely.
  await page.getByRole('heading', { name: LOGGED_IN_HEADING }).waitFor({ timeout: 60000 });
}

async function isLoggedIn(page) {
  try {
    await page.getByRole('heading', { name: LOGGED_IN_HEADING }).waitFor({ timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

// Loads a saved session if present, navigates to the reservation site, and
// logs in with CHURCH_USERNAME/CHURCH_PASSWORD only if the saved session is
// missing or expired. Saves the fresh session afterward for reuse next run.
async function ensureLoggedIn(context, page) {
  await page.goto(RESERVATION_URL, { waitUntil: 'domcontentloaded' });

  if (await isLoggedIn(page)) {
    return;
  }

  await performLogin(page);
  await context.storageState({ path: config.storageStatePath });
}

function loadStorageStateOption() {
  return fs.existsSync(config.storageStatePath) ? config.storageStatePath : undefined;
}

module.exports = { ensureLoggedIn, loadStorageStateOption, RESERVATION_URL };
