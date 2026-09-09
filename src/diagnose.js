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
  const selectButtonCount = await selectButton.count();
  console.log(`"Select this Temple" button count: ${selectButtonCount}`);
  if (selectButtonCount) {
    await selectButton.click();
  }

  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(3000);

  console.log('Page title:', await page.title());
  console.log('Page URL:', page.url());

  // Find every element whose own visible text is exactly "Proxy" or
  // "Endowment" (not just role=radio), then walk up a few ancestors to see
  // what's actually clickable.
  const info = await page.evaluate(() => {
    function ancestorChain(el, depth = 4) {
      const chain = [];
      let node = el;
      for (let i = 0; i < depth && node; i++) {
        chain.push({
          tag: node.tagName,
          role: node.getAttribute && node.getAttribute('role'),
          class: node.className && node.className.toString().slice(0, 120),
          id: node.id || null,
          ariaChecked: node.getAttribute && node.getAttribute('aria-checked'),
          outerHTMLSnippet: node.outerHTML ? node.outerHTML.slice(0, 200) : null,
        });
        node = node.parentElement;
      }
      return chain;
    }

    const targets = ['Proxy', 'Living', 'Endowment', 'Baptism'];
    const matches = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent.trim();
      if (targets.includes(text)) {
        matches.push({
          text,
          ancestors: ancestorChain(node.parentElement),
        });
      }
    }
    return matches;
  });

  console.log('--- TEXT MATCHES (Proxy/Living/Endowment/Baptism) ---');
  console.log(JSON.stringify(info, null, 2));

  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 1500));
  console.log('--- BODY TEXT (first 1500 chars) ---');
  console.log(bodyText);

  await page.screenshot({ path: 'diagnose-ordinance.png', fullPage: true });
  console.log('--- Screenshot saved to diagnose-ordinance.png ---');

  await browser.close();
})();
