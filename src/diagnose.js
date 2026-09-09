// One-off diagnostic: logs in, gets to the Ordinance screen, and dumps
// enough info about the Type/Ordinance controls to write correct selectors.
// Run locally with: node src/diagnose.js
const { chromium } = require('playwright');
const config = require('./config');
const { ensureLoggedIn, loadStorageStateOption } = require('./auth');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ storageState: loadStorageStateOption() });
  const page = await context.newPage();

  await ensureLoggedIn(context, page);

  const selectButton = page.getByRole('button', { name: 'Select this Temple' });
  if (await selectButton.count()) {
    await selectButton.click();
  }

  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'diagnose-ordinance.png', fullPage: true });

  const info = await page.evaluate(() => {
    function describe(el) {
      const label = el.closest('label')?.innerText?.trim()
        || document.querySelector(`label[for="${el.id}"]`)?.innerText?.trim()
        || null;
      return {
        tag: el.tagName,
        type: el.getAttribute('type'),
        role: el.getAttribute('role'),
        id: el.id || null,
        name: el.getAttribute('name'),
        ariaLabel: el.getAttribute('aria-label'),
        ariaChecked: el.getAttribute('aria-checked'),
        checked: el.checked ?? null,
        associatedLabelText: label,
        outerHTMLSnippet: el.outerHTML.slice(0, 300),
      };
    }
    const radioLike = Array.from(document.querySelectorAll(
      'input[type="radio"], [role="radio"], mat-radio-button, [class*="radio"]'
    ));
    return radioLike.map(describe);
  });

  console.log('--- RADIO-LIKE ELEMENTS ---');
  console.log(JSON.stringify(info, null, 2));
  console.log('--- Screenshot saved to diagnose-ordinance.png ---');

  await browser.close();
})();
