// Browser checks of the veil interface: toast, button, popover, Tools menu,
// and the `?` help. veil-check.mjs imports `uiTests`.

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { speakerFrames, waitTrue } from './helpers.mjs';

const LITERAL_LABEL = "<b>A</b> & 'x'";
const FRONT_MATTER_LABEL = "<b>A</b> & 'x' Don't -- </script>";
const LITERAL_REWRITE = ['"label":"Backup"', '"label":"\\u003cb>A\\u003c/b> & \'x\'"'];
const TOAST = '.veil-toast';
const POPOVER = '.veil-popover';

function toastText(target) {
  return target.evaluate((selector) => {
    const el = document.querySelector(selector);
    return el ? el.textContent : null;
  }, TOAST);
}

function waitForToast(target, text, timeout = 4000) {
  return target.waitForFunction(
    ([selector, expected]) => {
      const el = document.querySelector(selector);
      return el !== null && el.textContent === expected;
    },
    [TOAST, text],
    { timeout },
  ).then(() => true, () => false);
}

function waitPopover(page, open) {
  return page.waitForFunction(
    ([selector, expected]) => {
      const el = document.querySelector(selector);
      const shown = el !== null && !el.hidden && getComputedStyle(el).display !== 'none';
      return shown === expected;
    },
    [POPOVER, open],
    { timeout: 3000 },
  ).then(() => true, () => false);
}

async function seriousViolations(page) {
  const { AxeBuilder } = await import('@axe-core/playwright');
  const result = await new AxeBuilder({ page })
    .include('.veil-ui')
    .analyze();
  return result.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`);
}

async function screenshot(page, name) {
  const dir = process.env.VEIL_SCREENSHOT_DIR;
  if (dir) {
    await mkdir(dir, { recursive: true });
    await page.screenshot({ path: join(dir, name) });
  }
}

function popoverShape(page, literal = LITERAL_LABEL) {
  return page.evaluate(([selector, literal]) => {
    const popover = document.querySelector(selector);
    return {
      segments: Array.from(popover.querySelectorAll('.veil-ladder button')).map((el) => el.textContent.trim()),
      switches: Array.from(popover.querySelectorAll('[role="switch"]')).map((el) => el.textContent.trim()),
      markup: popover.querySelectorAll('b').length,
      literal: popover.textContent.includes(literal),
    };
  }, [POPOVER, literal]);
}

async function htmlUi(t, ctx) {
  ctx.only('html');
  const { page, errors } = await ctx.open('');

  const json = await page.evaluate(() => document.getElementById('veil-config').textContent);
  t.ok(
    json.includes('\\u003cb>A\\u003c/b>') && json.includes('\\u003c/script>') && !json.includes('<'),
    'the configuration JSON writes each < of a label as \\u003c',
    json,
  );

  t.equal(await toastText(page), '', 'no toast shows at load');
  t.ok(
    await page.locator(`${TOAST}[role="status"][aria-live="polite"]`).count() === 1,
    'the toast has role="status" and aria-live="polite"',
  );

  await page.evaluate(() => window.Veil.toggle('backup'));
  t.ok(await waitForToast(page, `${FRONT_MATTER_LABEL} · shown`), 'a front-matter label with markup shows as literal text in the toast');
  t.equal(await page.locator(`${TOAST} b`).count(), 0, 'the toast has no element from the label');
  await page.evaluate(() => window.Veil.setLevel(2));
  t.ok(await waitForToast(page, 'Level 2 · Advanced, Notes, Expert'), 'a second change replaces the first toast');
  t.equal(await page.locator(TOAST).count(), 1, 'the page has one toast element');
  await page.waitForTimeout(2300);
  t.equal(await toastText(page), '', 'the toast goes away after 2 s');

  const box = await page.locator('.veil-button').boundingBox();
  const viewport = page.viewportSize();
  t.ok(
    box !== null && box.x < viewport.width / 4 && box.y > viewport.height * 0.75,
    'the button shows at the bottom-left corner in html',
    { box, viewport },
  );

  await page.evaluate(() => window.Veil.apply('level:1,-backup'));
  await page.focus('#before');
  await page.keyboard.press('u');
  t.ok(await waitPopover(page, true), 'the key u opens the popover');
  const shape = await popoverShape(page, FRONT_MATTER_LABEL);
  t.equal(
    JSON.stringify(shape.segments),
    JSON.stringify(['0', 'Advanced + Notes', 'Expert']),
    'the ladder has a segment for 0 and one for each level, with same-level labels joined by +',
    shape,
  );
  t.equal(JSON.stringify(shape.switches), JSON.stringify([FRONT_MATTER_LABEL]), 'one switch for the independent group', shape);
  t.ok(shape.markup === 0 && shape.literal, 'a front-matter label with markup shows as literal text in the popover', shape);
  await screenshot(page, 'task-10-popover-html.png');

  const violations = await seriousViolations(page);
  t.equal(
    JSON.stringify(violations),
    '[]',
    'axe-core finds no serious or critical violation with the popover open',
    violations,
  );

  await page.locator(`${POPOVER} [role="switch"]`).click();
  t.equal(await page.evaluate(() => window.Veil.state().groups.backup), true, 'a click on the switch shows the group');
  t.equal(
    await page.locator(`${POPOVER} [role="switch"]`).getAttribute('aria-checked'),
    'true',
    'the switch follows the state',
  );
  await page.locator(`${POPOVER} .veil-ladder button`).nth(2).click();
  t.equal(await page.evaluate(() => window.Veil.state().level), 2, 'a click on a segment sets the level');
  t.equal(
    await page.locator(`${POPOVER} .veil-ladder button`).nth(2).getAttribute('aria-pressed'),
    'true',
    'the segment of the level is pressed',
  );

  await page.keyboard.press('Escape');
  t.ok(await waitPopover(page, false), 'Escape closes the popover');
  t.equal(await page.evaluate(() => document.activeElement.id), 'before', 'the focus goes back to the element that had it');

  await page.keyboard.press('u');
  await waitPopover(page, true);
  await page.emulateMedia({ media: 'print' });
  t.ok(
    await page.evaluate(() => ['.veil-button', '.veil-popover'].every((s) => getComputedStyle(document.querySelector(s)).display === 'none')),
    'the button and the popover are hidden in print',
  );
  t.equal(errors.length, 0, 'the interface gives no page error', errors);
}

async function htmlLanguage(t, ctx) {
  ctx.only('html');
  const { page, errors } = await ctx.open('');
  const names = await page.evaluate(() => ({
    button: document.querySelector('.veil-button').getAttribute('title'),
    popover: document.querySelector('.veil-popover').getAttribute('aria-label'),
    headings: Array.from(document.querySelectorAll('.veil-heading')).map((el) => el.textContent),
    ladder: document.querySelector('.veil-ladder').getAttribute('aria-label'),
  }));
  t.equal(names.button, 'Veil', 'the button title comes from the language keys');
  t.equal(names.popover, 'Veil', 'the popover label comes from the language keys');
  t.equal(names.ladder, 'Niveau', 'the built-in French text names the ladder');
  t.equal(
    JSON.stringify(names.headings),
    JSON.stringify(['Niveau', 'Interrupteurs']),
    'the built-in French text is used, and a language key of the document replaces it',
  );
  await page.evaluate(() => window.Veil.setLevel(1));
  t.ok(await waitForToast(page, 'Niveau 1 · Avancé'), 'the ladder toast is in French');
  await page.evaluate(() => window.Veil.show('backup'));
  t.ok(await waitForToast(page, 'Sauvegarde · affiché'), 'the group toast is in French');
  t.equal(errors.length, 0, 'the page gives no page error', errors);
}

async function toastFalse(t, ctx) {
  ctx.only('html');
  const { page, errors } = await ctx.open('');
  await page.evaluate(() => window.Veil.toggle('backup'));
  await page.waitForTimeout(600);
  t.ok([null, ''].includes(await toastText(page)), 'toast false shows no toast');
  t.equal(await page.evaluate(() => window.Veil.state().groups.backup), true, 'the change still happens');
  t.equal(errors.length, 0, 'toast false gives no page error', errors);
}

async function buttonOff(t, ctx) {
  ctx.only('html');
  const { page, errors } = await ctx.open('');
  t.equal(await page.locator('.veil-button').count(), 0, 'button.enabled false adds no button');
  t.equal(errors.length, 0, 'the document gives no page error', errors);
}

async function buttonOn(t, ctx) {
  ctx.only('revealjs');
  const { page, errors } = await ctx.open('');
  t.equal(await page.locator('.veil-button').count(), 1, 'button.enabled true adds one button');
  t.equal(errors.length, 0, 'the document gives no page error', errors);
}

async function speakerToasts(t, ctx, expected) {
  const { page } = await ctx.open('', { rewrite: LITERAL_REWRITE });
  await page.evaluate(() => window.Veil.toggle('backup'));
  const closed = await waitForToast(page, `${LITERAL_LABEL} · shown`, expected.closed ? 4000 : 800);
  t.equal(closed, expected.closed, `without a speaker view, the main window ${expected.closed ? 'shows' : 'does not show'} the toast`);
  await page.evaluate(() => window.Veil.toggle('backup'));

  const opened = page.waitForEvent('popup');
  await page.keyboard.press('s');
  const popup = await opened;
  const frames = await speakerFrames(popup);
  const current = frames.find((frame) => frame.url().includes('postMessageEvents=true'));
  const upcoming = frames.find((frame) => frame !== current);
  t.ok(
    await waitTrue(page, () => window.VeilReveal.speakerOpen()),
    'the main window knows that the speaker view is open',
  );
  await page.waitForTimeout(2300);
  t.ok(
    [await toastText(page), await toastText(current), await toastText(upcoming)].every((text) => !text),
    'no toast shows when the speaker view opens',
  );

  await page.evaluate(() => window.Veil.toggle('backup'));
  const texts = {};
  if (expected.current) {
    texts.current = await waitForToast(current, `${LITERAL_LABEL} · shown`);
  } else {
    texts.main = await waitForToast(page, `${LITERAL_LABEL} · shown`);
  }
  texts.mainNow = await toastText(page);
  texts.currentNow = await toastText(current);
  texts.upcomingNow = await toastText(upcoming);
  const shownIn = (text) => text === `${LITERAL_LABEL} · shown`;
  t.equal(shownIn(texts.currentNow), expected.current, `the current-slide frame ${expected.current ? 'shows' : 'does not show'} the toast`, texts);
  t.equal(shownIn(texts.mainNow), expected.mainOpen, `the main window ${expected.mainOpen ? 'shows' : 'does not show'} the toast while the speaker view is open`, texts);
  t.ok(!texts.upcomingNow, 'the upcoming-slide frame never shows the toast', texts);
  if (expected.current) {
    await screenshot(current.page(), 'task-10-toast-revealjs.png');
  }
  await popup.close();
}

async function revealUi(t, ctx) {
  ctx.only('revealjs');
  const { page, errors } = await ctx.open('', { rewrite: LITERAL_REWRITE });

  t.equal(await page.locator('.veil-button').count(), 0, 'the button does not show in revealjs');
  t.equal(await toastText(page), '', 'no toast shows at load');
  await page.evaluate(() => window.Veil.toggle('backup'));
  t.ok(await waitForToast(page, `${LITERAL_LABEL} · shown`), 'the toast shows in the main window, and a label shows as literal text');
  t.equal(await page.locator(`${TOAST}[role="status"][aria-live="polite"]`).count(), 1, 'the toast has role="status" and aria-live="polite"');
  t.ok(
    await page.evaluate(() => !document.querySelector('.reveal .slides').contains(document.querySelector('.veil-toast'))),
    'the toast is outside .slides',
  );
  await screenshot(page, 'task-10-toast-revealjs-main.png');

  await page.evaluate(() => window.Veil.apply('level:1,-backup'));
  const before = await page.evaluate(() => {
    window.beforeFocus = document.activeElement;
    return window.Reveal.getCurrentSlide().id;
  });
  await page.keyboard.press('u');
  t.ok(await waitPopover(page, true), 'the key u opens the popover');
  t.ok(
    await page.evaluate(() => document.querySelector('.veil-popover').contains(document.activeElement)),
    'the focus moves into the popover',
  );
  t.equal(
    await page.evaluate(() => document.querySelector('.reveal .slides').contains(document.querySelector('.veil-popover'))),
    false,
    'the popover is outside .slides',
  );
  await page.keyboard.press(' ');
  await page.keyboard.press('ArrowRight');
  t.equal(await page.evaluate(() => window.Reveal.getCurrentSlide().id), before, 'Space and the arrows in the popover do not change the slide');
  t.equal(
    JSON.stringify((await popoverShape(page)).segments),
    JSON.stringify(['0', 'Advanced', 'Expert']),
    'the ladder has a segment for 0 and one for each level',
  );
  const revealViolations = await seriousViolations(page);
  t.equal(
    JSON.stringify(revealViolations),
    '[]',
    'axe-core finds no serious or critical violation with the popover open in revealjs',
    revealViolations,
  );
  await page.keyboard.press('Escape');
  t.ok(await waitPopover(page, false), 'Escape closes the popover');
  t.ok(
    await page.evaluate(() => document.activeElement === window.beforeFocus && !window.Reveal.isOverview()),
    'the focus goes back, and Escape does not open the overview',
  );

  await page.keyboard.press('Shift+Slash');
  const help = await page.locator('.reveal .overlay-help, .reveal-overlay, .reveal .overlay').first().textContent({ timeout: 3000 }).catch(() => '');
  t.ok(
    help.includes('u') && /veil/i.test(help) && help.includes(']') && help.includes('['),
    'the ? help lists the veil keys',
    help.slice(0, 400),
  );
  await page.keyboard.press('Escape');

  await page.locator('.slide-menu-button a').click();
  await page.locator('.slide-menu-toolbar [data-panel="Custom0"]').click();
  const entries = page.locator('.slide-menu-custom-panel .veil-tool');
  t.equal(await entries.count(), 1, 'the Tools menu has one Veil entry');
  t.ok((await entries.first().textContent()).includes('Veil…'), 'the entry reads Veil…');
  await entries.first().locator('a').click();
  t.ok(await waitPopover(page, true), 'the entry opens the popover');
  await page.keyboard.press('Escape');

  const print = await ctx.open('?print-pdf');
  await print.page.evaluate(() => window.VeilUI.toggle());
  t.ok(
    await print.page.evaluate(() => getComputedStyle(document.querySelector('.veil-popover')).display === 'none'),
    'the popover is hidden in the Reveal.js print mode',
  );
  t.equal(errors.length + print.errors.length, 0, 'the interface gives no page error', errors.concat(print.errors));
  await speakerToasts(t, ctx, { closed: true, current: true, mainOpen: false });
}

async function toastSpeaker(t, ctx) {
  ctx.only('revealjs');
  await speakerToasts(t, ctx, { closed: false, current: true, mainOpen: false });
}

async function toastMain(t, ctx) {
  ctx.only('revealjs');
  await speakerToasts(t, ctx, { closed: true, current: false, mainOpen: true });
}

async function menuKeyDropped(t, ctx) {
  ctx.only('revealjs');
  const { page, errors } = await ctx.open('');
  await page.locator('.slide-menu-button a').click();
  await page.locator('.slide-menu-toolbar [data-panel="Custom0"]').click();
  const entries = page.locator('.slide-menu-custom-panel .veil-tool');
  t.equal(await entries.count(), 1, 'the Tools menu has one Veil entry when the menu key is dropped');
  const text = await entries.first().textContent();
  t.ok(!text.includes('undefined') && text.includes('Veil…'), 'the entry has no undefined key', text);
  t.equal(await entries.first().locator('kbd').count(), 0, 'the entry has no key element');
  t.equal(errors.length, 0, 'the page gives no page error', errors);
}

export function uiTests() {
  return {
    'ui-html.qmd': htmlUi,
    'ui-language.qmd': htmlLanguage,
    'ui-button-off.qmd': buttonOff,
    'ui-button-on.qmd': buttonOn,
    'ui-toast-false.qmd': toastFalse,
    'ui-reveal.qmd': revealUi,
    'ui-toast-speaker.qmd': toastSpeaker,
    'ui-toast-main.qmd': toastMain,
    'warn-key-conflict.qmd': menuKeyDropped,
  };
}
