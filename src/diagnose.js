// One-off diagnostic: logs in, clicks through to the Ordinance screen, and
// dumps enough info about the controls involved to write correct selectors.
// Run locally with: node src/diagnose.js
const { chromium } = require('playwright');
const config = require('./config');
const { ensureLoggedIn, loadStorageStateOption } = require('./auth');

async function findByExactText(page, targets) {
  return page.evaluate((targets) => {
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
          outerHTMLSnippet: node.outerHTML ? node.outerHTML.slice(0, 250) : null,
        });
        node = node.parentElement;
      }
      return chain;
    }

    const matches = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent.trim();
      if (targets.includes(text)) {
        matches.push({ text, ancestors: ancestorChain(node.parentElement) });
      }
    }
    return matches;
  }, targets);
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ storageState: loadStorageStateOption() });
  const page = await context.newPage();

  await ensureLoggedIn(context, page);

  console.log('--- BEFORE CLICK: "Select this Temple" matches ---');
  const before = await findByExactText(page, ['Select this Temple']);
  console.log(JSON.stringify(before, null, 2));

  // Click on whatever element actually contains that text, regardless of tag.
  const clicked = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent.trim() === 'Select this Temple') {
        node.parentElement.click();
        return true;
      }
    }
    return false;
  });
  console.log('Clicked "Select this Temple" via raw DOM click:', clicked);

  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(3000);

  console.log('Page URL after click:', page.url());

  const after = await findByExactText(page, ['Proxy', 'Living', 'Endowment', 'Baptism', 'Initiatory', 'Sealing']);
  console.log('--- AFTER CLICK: Proxy/Endowment/etc matches ---');
  console.log(JSON.stringify(after, null, 2));

  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 1500));
  console.log('--- BODY TEXT (first 1500 chars) ---');
  console.log(bodyText);

  await page.screenshot({ path: 'diagnose-ordinance.png', fullPage: true });
  console.log('--- Screenshot saved to diagnose-ordinance.png ---');

  await browser.close();
})();
