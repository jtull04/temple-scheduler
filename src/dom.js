// Helpers for driving the Temple Online Scheduling wizard, which renders its
// controls as plain <div>/<span> elements with click handlers rather than
// semantic <button>/<input> elements — so Playwright's getByRole/getByLabel
// mostly find nothing. These fall back to matching raw DOM text nodes and
// clicking the nearest plausibly-interactive ancestor.

// Find the element whose visible text matches `text`, tag it, and return a
// short description. `mode` is 'exact' (trimmed textContent === text) or
// 'contains'. When several match, the smallest (fewest descendants) wins,
// which is almost always the actual control rather than a wrapper.
async function findByText(page, text, { mode = 'exact', nth = 0 } = {}) {
  const handle = await page.evaluateHandle(
    ({ text, mode, nth }) => {
      const wanted = text.trim();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const hits = [];
      let node;
      while ((node = walker.nextNode())) {
        const t = node.textContent.trim();
        const ok = mode === 'exact' ? t === wanted : t.includes(wanted);
        if (ok && node.parentElement) hits.push(node.parentElement);
      }
      // Prefer the tightest wrapper around the text.
      hits.sort((a, b) => a.getElementsByTagName('*').length - b.getElementsByTagName('*').length);
      const el = hits[nth];
      if (!el) return null;

      // Climb to the nearest ancestor that looks clickable, staying close.
      const clickableSel = 'button, a, input, [role="button"], [role="radio"], [role="checkbox"], [role="tab"], [role="option"], label, [tabindex], [onclick]';
      let target = el;
      for (let i = 0; i < 5 && target; i++) {
        if (target.matches && target.matches(clickableSel)) break;
        const style = getComputedStyle(target);
        if (style.cursor === 'pointer') break;
        target = target.parentElement;
      }
      if (!target) target = el;

      target.setAttribute('data-diag-target', '1');
      return target;
    },
    { text, mode, nth },
  );

  const el = handle.asElement();
  if (!el) return null;
  return el;
}

async function clearDiagTargets(page) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-diag-target]').forEach((n) => n.removeAttribute('data-diag-target'));
  });
}

// Click the control identified by visible text. Throws if not found.
async function clickByText(page, text, opts = {}) {
  const el = await findByText(page, text, opts);
  if (!el) {
    throw new Error(`clickByText: no element found for text ${JSON.stringify(text)} (${opts.mode || 'exact'})`);
  }
  await el.scrollIntoViewIfNeeded().catch(() => {});
  await el.click();
  await clearDiagTargets(page);
}

// Dump every plausibly-interactive element plus the full page text, so we can
// see what selectors the current wizard screen actually needs.
async function describeScreen(page, label) {
  const data = await page.evaluate(() => {
    const sel = 'button, a, input, select, textarea, [role="button"], [role="radio"], [role="checkbox"], [role="tab"], [role="option"], [role="combobox"], [role="spinbutton"], label, [tabindex], [onclick]';
    const seen = new Set();
    const controls = [];
    document.querySelectorAll(sel).forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      const key = el.outerHTML.slice(0, 60) + rect.top + rect.left;
      if (seen.has(key)) return;
      seen.add(key);
      controls.push({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type'),
        role: el.getAttribute('role'),
        name: el.getAttribute('name'),
        id: el.id || null,
        ariaLabel: el.getAttribute('aria-label'),
        ariaChecked: el.getAttribute('aria-checked'),
        placeholder: el.getAttribute('placeholder'),
        value: el.value !== undefined ? String(el.value).slice(0, 60) : null,
        text: (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
        class: (el.className || '').toString().slice(0, 120),
        disabled: el.disabled || el.getAttribute('aria-disabled') === 'true' || null,
        html: el.outerHTML.replace(/\s+/g, ' ').slice(0, 220),
      });
    });
    return { url: location.href, title: document.title, controls, body: document.body.innerText };
  });

  console.log(`\n======== SCREEN: ${label} ========`);
  console.log(`URL: ${data.url}`);
  console.log(`--- INTERACTIVE CONTROLS (${data.controls.length}) ---`);
  data.controls.forEach((c, i) => console.log(`[${i}] ${JSON.stringify(c)}`));
  console.log('--- BODY TEXT ---');
  console.log(data.body);
  console.log(`======== END SCREEN: ${label} ========\n`);
  return data;
}

module.exports = { findByText, clickByText, clearDiagTargets, describeScreen };
