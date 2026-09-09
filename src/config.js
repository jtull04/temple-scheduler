require('dotenv').config();

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Next Friday strictly after `from` (if `from` is itself a Friday, returns
// the following week's Friday rather than today).
function nextFriday(from = new Date()) {
  const date = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const FRIDAY = 5;
  let daysToAdd = (FRIDAY - date.getUTCDay() + 7) % 7;
  if (daysToAdd === 0) daysToAdd = 7;
  date.setUTCDate(date.getUTCDate() + daysToAdd);
  return date;
}

// The Friday we should book on a given run: the coming Friday (today, if
// today is a Friday) plus a fixed lead time, so a weekly run always books
// two weeks out. Run Wed Sep 9 or Fri Sep 11 -> books Fri Sep 25.
// Override the 14-day lead with BOOKING_LEAD_DAYS (must be a multiple of 7).
function bookingDate(from = new Date()) {
  const leadDays = Number(process.env.BOOKING_LEAD_DAYS ?? 14);
  const date = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const FRIDAY = 5;
  const daysToComingFriday = (FRIDAY - date.getUTCDay() + 7) % 7;
  date.setUTCDate(date.getUTCDate() + daysToComingFriday + leadDays);
  return date;
}

function formatDateArg(date) {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

module.exports = {
  churchUsername: () => requireEnv('CHURCH_USERNAME'),
  churchPassword: () => requireEnv('CHURCH_PASSWORD'),

  templeName: process.env.TEMPLE_NAME || 'Provo City Center Temple',
  groupName: process.env.GROUP_NAME || 'Tullis, Joshua',
  maleGuests: Number(process.env.MALE_GUESTS ?? 3),
  femaleGuests: Number(process.env.FEMALE_GUESTS ?? 2),
  sessionTimeLabel: process.env.SESSION_TIME || '7:00 AM',

  dryRun: process.env.DRY_RUN === 'true',
  headless: process.env.HEADLESS !== 'false',
  storageStatePath: process.env.STORAGE_STATE_PATH || 'storage_state.json',
  screenshotDir: process.env.SCREENSHOT_DIR || 'screenshots',

  nextFriday,
  bookingDate,
  formatDateArg,
};
