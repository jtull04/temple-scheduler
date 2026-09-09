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
  formatDateArg,
};
