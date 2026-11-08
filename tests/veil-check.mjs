// Browser checks of the veil runtime, for the `check` hook of extension-test.
// The runner gives the rendered file in EXTENSION_TEST_OUTPUT, the format in
// EXTENSION_TEST_FORMAT and the source document in EXTENSION_TEST_INPUT.
// The script serves the output directory over HTTP, runs the test function
// of the input file, and writes TAP 13 on standard output.
// Exit 77 tells the runner that no test applies to the case.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { speakerFrames, waitTrue } from './helpers.mjs';
import { uiTests } from './veil-ui-check.mjs';

const SKIP = 77;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

class Skip extends Error {}

// ---------------------------------------------------------------------------
// Test functions, one for each input file name.
// ---------------------------------------------------------------------------

async function isHidden(page, selector) {
  return page.locator(selector).first().evaluate((el) => el.hidden);
}

async function htmlBasic(t, ctx) {
  ctx.only('html');

  let { page, errors } = await ctx.open('');
  t.ok(await isHidden(page, '#sec-expert'), 'a section of a hidden group has hidden at load');
  t.ok(await isHidden(page, '#sec-expert > h2'), 'the heading of a hidden section has hidden at load');
  t.ok(!(await isHidden(page, '#sec-advanced')), 'a section of a shown group has no hidden at load');
  t.ok(
    await page.locator('#TOC a[href="#sec-expert"]').evaluate((a) => a.closest('li').hidden),
    'the table of contents entry of a hidden section is hidden',
  );
  t.ok(!(await page.locator('#sec-expert').isVisible()), 'a hidden section is not visible');
  t.ok(!(await page.locator('#div-both').isVisible()), 'an element in a hidden group is not visible');

  const marked = ['callout-note', 'fig-veiled', 'tbl-veiled', 'cell-veiled'];
  for (const id of marked) {
    t.ok(await isHidden(page, `#${id}`), `#${id} of a hidden group has hidden at load`);
    t.ok(!(await page.locator(`#${id}`).isVisible()), `#${id} of a hidden group is not visible`);
  }

  await page.evaluate(() => window.Veil.apply('level:2'));
  t.ok(await page.locator('#sec-expert').isVisible(), "Veil.apply('level:2') shows the level-2 section");
  for (const id of marked) {
    t.ok(await page.locator(`#${id}`).isVisible(), `#${id} shows after the state changes`);
  }
  t.ok(
    !(await page.locator('#TOC a[href="#sec-expert"]').evaluate((a) => a.closest('li').hidden)),
    'the table of contents entry of a shown section is visible',
  );
  const state = await page.evaluate(() => window.Veil.state());
  t.equal(state.text, 'level:2,-backup,veil', 'Veil.state().text is the full state');
  t.equal(state.level, 2, 'Veil.state().level is the ladder setting');
  t.equal(await page.evaluate(() => location.search), '?veil=level:2,-backup,veil', 'the URL has the full state');

  await page.evaluate(() => window.Veil.show('backup'));
  t.ok(await page.locator('#div-both').isVisible(), 'an element in two shown groups is visible');
  await page.evaluate(() => window.Veil.hide('advanced'));
  t.ok(!(await page.locator('#div-both').isVisible()), 'an element in two groups hides when one group hides');
  t.equal(await page.evaluate(() => window.Veil.state().text), 'level:0,backup,veil', 'hide of a ladder group sets the previous level');
  await page.evaluate(() => window.Veil.toggle('advanced'));
  t.ok(await page.locator('#div-both').isVisible(), 'toggle of a ladder group shows it again');
  const level = (call) => page.evaluate(call).then(() => page.evaluate(() => window.Veil.state().level));
  await page.evaluate(() => window.Veil.setLevel(0));
  t.equal(await level(() => window.Veil.hide('expert')), 0, 'hide of a hidden ladder group does not show a group');
  await page.evaluate(() => window.Veil.setLevel(2));
  t.equal(await level(() => window.Veil.show('advanced')), 2, 'show of a shown ladder group does not hide a group');
  t.equal(await level(() => window.Veil.toggle('expert')), 1, 'toggle of a shown ladder group hides it');
  t.equal(await level(() => window.Veil.toggle('expert')), 2, 'toggle of a hidden ladder group shows it');
  t.equal(errors.length, 0, 'the API calls give no page error', errors);

  for (const query of ['?veil=%E0%A4%A', '?veil=,,', '?veil=a&veil=b', '?veil=level:x,-', '?veil']) {
    ({ page, errors } = await ctx.open(query));
    const ready = await page.evaluate(() => document.documentElement.classList.contains('veil-ready'));
    t.ok(ready && errors.length === 0, `the page loads without a page error with ${query}`, errors);
  }

  ({ page, errors } = await ctx.open('?veil=level:2&veil=level:0'));
  t.equal(await page.evaluate(() => window.Veil.state().level), 2, 'the first veil parameter wins when the URL has two');

  ({ page, errors } = await ctx.open('?veil=level:2,backup'));
  t.equal(await page.evaluate(() => window.Veil.state().text), 'level:2,backup,veil', 'the URL sets the state at load');
  t.ok(await page.locator('#div-both').isVisible(), 'the URL state shows the element at load');
  t.equal(await page.evaluate(() => location.search), '?veil=level:2,backup', 'the load does not write the URL');

  ({ page, errors } = await ctx.open(''));
  await page.keyboard.press(']');
  t.equal(await page.evaluate(() => window.Veil.state().level), 2, '] moves the ladder setting up');
  await page.keyboard.press('[');
  await page.keyboard.press('[');
  t.equal(await page.evaluate(() => window.Veil.state().level), 0, '[ moves the ladder setting down');
  await page.focus('#field');
  await page.keyboard.press(']');
  t.equal(await page.evaluate(() => window.Veil.state().level), 0, '] typed in an input does not change the state');
  t.equal(await page.inputValue('#field'), ']', 'the input receives the key');
  await page.evaluate(() => {
    document.activeElement.blur();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ']', code: 'KeyQ', keyCode: 81, bubbles: true }));
  });
  t.equal(await page.evaluate(() => window.Veil.state().level), 1, 'the key is read from event.key, not keyCode');

  const detail = await page.evaluate(() => new Promise((done) => {
    document.addEventListener('veil:change', (event) => done(event.detail), { once: true });
    window.Veil.setLevel(2);
  }));
  t.equal(detail && detail.text, 'level:2,-backup,veil', 'a change sends veil:change with the state');
  t.equal(errors.length, 0, 'the keys give no page error', errors);
}

async function revealStructure(t, ctx) {
  ctx.only('revealjs');
  const { page, errors } = await ctx.open('');
  t.equal(await page.evaluate(() => typeof window.RevealVeil), 'function', 'window.RevealVeil is a function');
  t.equal(await page.evaluate(() => typeof window.Veil.state().text), 'string', 'window.Veil works in Reveal.js');
  t.equal(errors.length, 0, 'the deck loads without a page error', errors);
}

async function noVeilRuntime(t, ctx) {
  ctx.only('html', 'revealjs');
  const { page, errors } = await ctx.open('', { ready: false });
  t.equal(await page.locator('#veil-config').count(), 0, 'the page has no #veil-config');
  t.equal(errors.length, 0, 'the page loads without a page error', errors);
  if (ctx.format === 'revealjs') {
    t.equal(await page.evaluate(() => typeof window.RevealVeil), 'function', 'window.RevealVeil is a function');
    const safe = await page.evaluate(() => {
      const html = document.querySelector('.reveal .slides').innerHTML;
      window.VeilReveal.init(window.Reveal, null);
      window.VeilReveal.apply({ levels: [], setting: 0, ladder: {}, independent: {} });
      return document.querySelector('.reveal .slides').innerHTML === html;
    });
    t.ok(safe, 'VeilReveal does nothing without a configuration');
  }
}

// The leaf slides of the deck, in DOM order, by identifier.
const DECK_IDS = () => Array.from(document.querySelectorAll('.reveal .slides section'))
  .filter((s) => !s.querySelector('section'))
  .map((s) => s.id);

const DEFAULT_IDS = ['one', 'two', 'three', 'anim-one', 'anim-two', 'uncounted', 'part-a', 'a1', 'part-c', 'c1'];
const ALL_IDS = [
  'one', 'two', 'three', 'expert', 'anim-one', 'anim-two', 'uncounted',
  'part-a', 'a1', 'a2', 'part-b', 'b1', 'b2', 'part-c', 'c1',
];

async function deck(page) {
  return page.evaluate((idsSource) => {
    const ids = new Function(`return (${idsSource})();`)();
    const indices = window.Reveal.getIndices();
    return {
      ids,
      total: window.Reveal.getTotalSlides(),
      current: window.Reveal.getCurrentSlide().id,
      h: indices.h,
      v: indices.v || 0,
      number: document.querySelector('.reveal .slide-number').textContent.replace(/\s+/g, ''),
      past: window.Reveal.getSlidePastCount(),
    };
  }, DECK_IDS.toString());
}

function goTo(page, id, fragment) {
  return page.evaluate(([target, f]) => {
    const indices = window.Reveal.getIndices(document.getElementById(target));
    window.Reveal.slide(indices.h, indices.v, f);
  }, [id, fragment]);
}

async function revealDeck(t, ctx) {
  ctx.only('revealjs');

  let { page, errors } = await ctx.open('');
  const warnings = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') {
      warnings.push(message.text());
    }
  });
  let d = await deck(page);
  t.equal(d.ids.join(' '), DEFAULT_IDS.join(' '), 'the hidden slides are not in the deck at load', d.ids);
  t.equal(d.total, 9, 'Reveal.getTotalSlides() counts the visible slides at load');

  await goTo(page, 'anim-one');
  d = await deck(page);
  t.equal(d.number, '4/9', 'the slide number is correct at load', d);

  await page.evaluate(() => window.Veil.setLevel(0));
  d = await deck(page);
  t.equal(d.current, 'anim-one', 'a slide before the current slide hides: the current slide stays', d);
  t.equal(d.total, 8, 'Reveal.getTotalSlides() is correct after a change');
  t.equal(d.h, 2, 'Reveal.getIndices() is correct after a change', d);
  t.equal(d.number, '3/8', 'the slide number is correct after a change', d);
  t.equal(await page.evaluate(() => window.Reveal.getConfig().autoAnimate), true, 'auto-animate is restored after a change');
  await page.evaluate(() => window.Reveal.next());
  t.equal((await deck(page)).current, 'anim-two', 'Reveal.next() moves to the next visible slide after a change');

  const overview = await page.evaluate(() => {
    window.Reveal.toggleOverview(true);
    const shown = Array.from(document.querySelectorAll('.reveal .slides section'))
      .filter((s) => !s.querySelector('section')).length;
    window.Reveal.toggleOverview(false);
    return shown;
  });
  t.equal(overview, 9, 'the overview shows the visible slides only');

  const menu = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.slide-menu-items li'));
    const byTitle = (title) => items.find((li) => li.textContent.trim().endsWith(title));
    byTitle('Anim one').click();
    return {
      current: window.Reveal.getCurrentSlide().id,
      twoHidden: byTitle('Two').hidden,
      twoShown: byTitle('Two').getClientRects().length > 0,
      oneHidden: byTitle('One').hidden,
    };
  });
  t.equal(menu.current, 'anim-one', 'a click on a menu item goes to the correct slide after a change', menu);
  t.ok(menu.twoHidden && !menu.twoShown, 'the menu item of a hidden slide has hidden and is not shown', menu);
  t.ok(!menu.oneHidden, 'the menu item of a visible slide has no hidden', menu);

  await goTo(page, 'one');
  await page.evaluate(() => window.Reveal.getPlugin('menu').openMenu());
  await page.keyboard.press('ArrowDown');
  const selected = await page.evaluate(() => {
    const item = document.querySelector('.slide-menu-items li.selected');
    return item ? item.textContent.trim() : null;
  });
  t.ok(selected && selected.endsWith('Three'), 'the menu keys skip the items of hidden slides', selected);
  await page.keyboard.press('Enter');
  t.equal((await deck(page)).current, 'three', 'Enter on a menu item after a hidden item goes to the correct slide');
  await page.evaluate(() => window.Reveal.getPlugin('menu').closeMenu());

  await page.evaluate(() => window.Veil.setLevel(1));
  await goTo(page, 'two');
  await page.evaluate(() => window.Veil.setLevel(0));
  t.equal((await deck(page)).current, 'three', 'the current slide hides: the deck goes to the next visible slide');

  await page.evaluate(() => window.Veil.setLevel(1));
  await goTo(page, 'c1');
  await page.evaluate(() => window.Veil.hide('extra'));
  d = await deck(page);
  t.equal(d.current, 'a1', 'the current slide hides at the end of the deck: the deck goes to the previous visible slide', d);
  const stacks = await page.evaluate(() => ({
    stacks: document.querySelectorAll('.reveal .slides > section.stack').length,
    empty: Array.from(document.querySelectorAll('.reveal .slides > section')).filter((s) => s.children.length === 0).length,
  }));
  t.ok(stacks.stacks === 1 && stacks.empty === 0, 'a stack whose children are all hidden is hidden too', stacks);

  await page.evaluate(() => window.Veil.apply('level:5,backup,extra'));
  d = await deck(page);
  t.equal(d.ids.join(' '), ALL_IDS.join(' '), 'shown slides come back in their original order', d.ids);
  t.equal(d.total, 14, 'Reveal.getTotalSlides() counts all the slides when all are shown');

  await page.evaluate(() => window.Veil.hide('backup'));
  d = await deck(page);
  t.ok(!d.ids.includes('part-b') && !d.ids.includes('b1') && !d.ids.includes('b2'), 'a # stack with .veil hides as one unit', d.ids);
  await page.evaluate(() => window.Veil.show('backup'));
  d = await deck(page);
  const at = d.ids.indexOf('part-b');
  t.equal(d.ids.slice(at, at + 3).join(' '), 'part-b b1 b2', 'a # stack with .veil comes back as one unit', d.ids);

  await page.evaluate(() => window.Veil.apply('level:1,-backup,extra'));
  await goTo(page, 'three', -1);
  const fragments = () => page.evaluate(() => window.Reveal.getCurrentSlide().querySelectorAll('.fragment').length);
  t.equal(await fragments(), 3, 'the current slide has all its fragments when the content is shown');
  await page.evaluate(() => window.Veil.hide('extra'));
  t.equal(await fragments(), 1, 'the fragment count of the current slide changes with the hidden content');
  await page.evaluate(() => window.Reveal.next());
  t.equal((await deck(page)).current, 'three', 'Reveal.next() shows the visible fragment first');
  await page.evaluate(() => window.Reveal.next());
  t.equal((await deck(page)).current, 'anim-one', 'Reveal.next() then leaves the slide');
  await page.evaluate(() => window.Veil.show('extra'));
  await goTo(page, 'three');
  t.equal(await fragments(), 3, 'the fragments come back with the content');

  await page.evaluate(() => window.Veil.setLevel(0));
  await page.keyboard.press(']');
  t.equal(await page.evaluate(() => window.Veil.state().level), 1, '] moves from level 0 to level 1');
  await page.keyboard.press(']');
  t.equal(await page.evaluate(() => window.Veil.state().level), 5, 'a second ] moves to level 5');
  t.equal((await deck(page)).total, 11, 'Reveal.getTotalSlides() is correct at level 5');

  const press = (key, times) => page.evaluate(([k, n]) => {
    for (let i = 0; i < n; i += 1) {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    }
  }, [key, times]);
  await page.evaluate(() => window.Veil.setLevel(0));
  await press(']', 10);
  d = await deck(page);
  t.ok(d.total === 11 && (await page.evaluate(() => window.Veil.state().level)) === 5, '] ten times ends at level 5 with the correct slide count', d);
  await press('[', 10);
  d = await deck(page);
  t.ok(d.total === 8 && (await page.evaluate(() => window.Veil.state().level)) === 0, '[ ten times ends at level 0 with the correct slide count', d);

  const before = await page.evaluate(() => ({ text: window.Veil.state().text, url: location.search }));
  warnings.length = 0;
  await page.evaluate(() => window.Veil.apply('level:0,-main,-extra'));
  const after = await page.evaluate(() => ({ text: window.Veil.state().text, url: location.search }));
  t.ok(after.text === before.text && after.url === before.url, 'a state that hides every slide is refused: the state stays the same', { before, after });
  t.equal((await deck(page)).total, 8, 'a refused state does not change the deck');
  t.ok(warnings.some((w) => w.includes('[veil]')), 'a refused state writes a console warning', warnings);

  await page.evaluate(() => window.Veil.apply('level:1,-backup,extra'));
  await goTo(page, 'anim-one');
  await page.evaluate(() => {
    window.Reveal.on('slidechanged', function once() {
      window.Reveal.off('slidechanged', once);
      window.Veil.show('backup');
    });
    window.Veil.setLevel(0);
  });
  d = await deck(page);
  const nested = await page.evaluate(() => ({ text: window.Veil.state().text, url: location.search }));
  t.ok(
    d.ids.includes('part-b') && !d.ids.includes('two') && nested.text === 'level:0,backup,extra,main'
      && nested.url === '?veil=level:0,backup,extra,main',
    'a change that arrives during a change waits for it, and the deck, the state and the URL agree',
    { ids: d.ids, nested },
  );
  t.equal(errors.length, 0, 'the changes give no page error', errors);

  ({ page, errors } = await ctx.open(''));
  const scroll = await page.evaluate(() => {
    const support = window.Reveal.getPlugin('quarto-support');
    support.toggleScrollView();
    const entered = window.Reveal.isScrollView();
    window.Veil.hide('extra');
    const stays = window.Reveal.isScrollView();
    const goneInScroll = document.getElementById('c1') === null;
    support.toggleScrollView();
    return {
      entered,
      stays,
      goneInScroll,
      goneAfter: document.getElementById('c1') === null && document.getElementById('part-c') === null,
      left: !window.Reveal.isScrollView(),
      total: window.Reveal.getTotalSlides(),
    };
  });
  t.ok(scroll.entered && scroll.stays && scroll.goneInScroll, 'a change in scroll view applies and scroll view stays', scroll);
  t.ok(scroll.left && scroll.goneAfter && scroll.total === 7, 'a change in scroll view stays after scroll view stops', scroll);
  t.equal(errors.length, 0, 'scroll view gives no page error', errors);

  ({ page, errors } = await ctx.open('?print-pdf&veil=level:1'));
  await page.waitForSelector('.pdf-page', { timeout: 10000 });
  const printed = await page.evaluate(() => ({
    hidden: ['expert', 'a2', 'part-b', 'b1', 'b2'].filter((id) => document.getElementById(id) !== null),
    shown: ['one', 'two', 'a1', 'c1'].filter((id) => document.getElementById(id)?.closest('.pdf-page')),
  }));
  t.ok(printed.hidden.length === 0 && printed.shown.length === 4, 'the printed pages do not contain the hidden slides', printed);
  t.equal(errors.length, 0, 'print view gives no page error', errors);

  await speakerView(t, ctx);
  await twoDecks(t, ctx);
  await reloadedDeck(t, ctx);
  await multiplex(t, ctx);
}

function frameDeck(frame) {
  return frame.evaluate(() => ({
    total: window.Reveal.getTotalSlides(),
    current: window.Reveal.getCurrentSlide().id,
    text: window.Veil.state().text,
  }));
}

async function speakerView(t, ctx) {
  const { page, errors } = await ctx.open('');
  await goTo(page, 'three');
  const opened = page.waitForEvent('popup');
  await page.keyboard.press('s');
  const popup = await opened;
  const frames = await speakerFrames(popup);
  const current = frames.find((frame) => frame.url().includes('postMessageEvents=true'));
  const upcoming = frames.find((frame) => frame !== current);

  t.ok(
    await waitTrue(page, () => window.VeilReveal.speakerOpen && window.VeilReveal.speakerOpen()),
    'the main window knows that a speaker view is open',
  );

  await page.evaluate(() => {
    window.veilPosts = [];
    const channel = new BroadcastChannel('veil:' + location.pathname);
    channel.onmessage = (event) => window.veilPosts.push(event.data);
  });
  await page.evaluate(() => window.Veil.apply('level:0'));
  const main = await deck(page);
  const caught = [
    await waitTrue(current, (total) => window.Reveal.getTotalSlides() === total, main.total),
    await waitTrue(upcoming, (total) => window.Reveal.getTotalSlides() === total, main.total),
  ];
  // The speaker view sends its state back to the main window after 500 ms.
  await page.waitForTimeout(1200);
  const now = await deck(page);
  t.ok(caught.every(Boolean), 'the two frames reach the slide count of the main window', caught);
  const shown = await frameDeck(current);
  const next = await frameDeck(upcoming);
  const mainText = await page.evaluate(() => window.Veil.state().text);
  t.ok(
    shown.total === main.total && next.total === main.total && shown.text === mainText && next.text === mainText,
    'the speaker view frames get the state and the same slide count as the main window',
    { main, shown, next, mainText },
  );
  t.ok(
    main.current === 'three' && now.current === 'three' && shown.current === 'three',
    'the current frame and the main window show the same slide after the change',
    { main: main.current, now: now.current, frame: shown.current },
  );
  const posts = await page.evaluate(() => window.veilPosts.filter((data) => data && data.type === 'veil-state'));
  t.ok(posts.length === 1 && posts[0].text === mainText, 'the main window sends the state one time, and the frames do not send it back', posts);

  const reply = await page.evaluate(() => new Promise((done) => {
    const channel = new BroadcastChannel('veil:' + location.pathname);
    const timer = setTimeout(() => done(null), 3000);
    channel.onmessage = (event) => {
      if (event.data && event.data.type === 'veil-state') {
        clearTimeout(timer);
        channel.close();
        done(event.data.text);
      }
    };
    channel.postMessage({ type: 'veil-hello', id: 'late-frame', owner: window.VeilReveal.ownerId });
  }));
  t.equal(reply, mainText, 'a frame that loads late gets the current state when it says hello');

  await popup.close();
  await page.evaluate(() => {
    const channel = new BroadcastChannel('veil:' + location.pathname);
    channel.postMessage({ type: 'veil-bye', id: 'late-frame' });
  });
  t.ok(
    await waitTrue(page, () => !window.VeilReveal.speakerOpen()),
    'the main window knows that the speaker view is closed',
  );
  t.equal(errors.length, 0, 'the speaker view gives no page error in the main window', errors);
}

// Two main pages of the same deck in one browser: each keeps its own state,
// and the speaker view of page A follows A only.
async function twoDecks(t, ctx) {
  const a = await ctx.open('');
  await goTo(a.page, 'three');
  const opened = a.page.waitForEvent('popup');
  await a.page.keyboard.press('s');
  const popup = await opened;
  const frames = await speakerFrames(popup);
  const b = await ctx.open('?veil=level:5', { context: a.page.context() });
  // B asks the open frames to say hello when it starts.
  await b.page.waitForTimeout(800);
  const textOf = (page) => page.evaluate(() => window.Veil.state().text);
  const started = { a: await textOf(a.page), b: await textOf(b.page) };
  t.ok(
    started.a.startsWith('level:1') && started.b.startsWith('level:5'),
    'a second main page keeps the state of its URL when it starts next to a speaker view',
    started,
  );

  await a.page.evaluate(() => window.Veil.apply('level:0'));
  await a.page.waitForTimeout(800);
  const afterA = { a: await textOf(a.page), b: await textOf(b.page) };
  t.ok(
    afterA.a.startsWith('level:0') && afterA.b.startsWith('level:5'),
    'a second main page keeps its own state after the first page changes',
    afterA,
  );

  await b.page.evaluate(() => window.Veil.apply('level:1,backup'));
  await b.page.waitForTimeout(1200);
  const aText = await textOf(a.page);
  const aDeck = await deck(a.page);
  const followed = await Promise.all(frames.map(frameDeck));
  t.ok(
    followed.every((f) => f.text === aText && f.total === aDeck.total) && aText.startsWith('level:0'),
    'the speaker view of the first page follows the first page, not the second one',
    { aText, aTotal: aDeck.total, followed },
  );
  t.equal(a.errors.length + b.errors.length, 0, 'two main pages give no page error', [a.errors, b.errors]);
  await popup.close();
  await b.page.close();
}

// The speaker view stays open while its main page loads again. The new page
// has a new id, and the frames must follow it.
async function reloadedDeck(t, ctx) {
  const { page, errors } = await ctx.open('');
  await goTo(page, 'three');
  const opened = page.waitForEvent('popup');
  await page.keyboard.press('s');
  const popup = await opened;
  const frames = await speakerFrames(popup);
  const before = await page.evaluate(() => window.VeilReveal.ownerId);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.classList.contains('veil-ready'), null, { timeout: 5000 });
  const after = await page.evaluate(() => window.VeilReveal.ownerId);
  t.ok(
    after !== before && await waitTrue(page, () => window.VeilReveal.speakerOpen()),
    'after a reload, the main page knows that its speaker view is open',
    { before, after },
  );

  await page.evaluate(() => window.Veil.apply('level:0'));
  const text = await page.evaluate(() => window.Veil.state().text);
  const total = (await deck(page)).total;
  const caught = await Promise.all(frames.map((frame) => waitTrue(frame, (expected) => window.Veil.state().text === expected, text)));
  const followed = await Promise.all(frames.map(frameDeck));
  t.ok(
    caught.every(Boolean) && followed.every((f) => f.text === text && f.total === total),
    'after a reload of the main page, the speaker view follows the new page',
    { text, total, followed },
  );
  t.equal(errors.length, 0, 'the reload gives no page error', errors);
  await popup.close();
}

// Multiplex needs a socket server, so the checks use the two document
// events of the plugin: `send` on the master and `received` on a follower.
async function multiplex(t, ctx) {
  const { page, errors } = await ctx.open('');
  const followed = await page.evaluate(() => {
    const event = new CustomEvent('received');
    event.content = { veil: 'level:0' };
    document.dispatchEvent(event);
    return { level: window.Veil.state().level, total: window.Reveal.getTotalSlides() };
  });
  t.ok(followed.level === 0 && followed.total === 8, 'a multiplex follower applies the state that it receives', followed);

  const sent = await page.evaluate(() => {
    const contents = [];
    document.addEventListener('send', (event) => contents.push(event.content));
    window.Veil.setLevel(1);
    const without = contents.length;
    window.Reveal.configure({ multiplex: { id: 'test', secret: 'test', url: '' } });
    window.Veil.setLevel(5);
    return { without, contents, text: window.Veil.state().text };
  });
  t.equal(sent.without, 0, 'without multiplex, a change sends no multiplex event', sent);
  t.ok(
    sent.contents.length === 1 && sent.contents[0] && sent.contents[0].veil === sent.text,
    'a multiplex master sends the state with the send event',
    sent,
  );
  t.equal(errors.length, 0, 'the multiplex events give no page error', errors);
}

export const tests = {
  'html-basic.qmd': htmlBasic,
  'reveal-structure.qmd': revealStructure,
  'no-veil-runtime.qmd': noVeilRuntime,
  'reveal-deck.qmd': revealDeck,
  ...uiTests(),
};

// ---------------------------------------------------------------------------
// TAP output.
// ---------------------------------------------------------------------------

function createTap() {
  let count = 0;
  let failed = 0;
  const report = (passed, description, diagnostic) => {
    count += 1;
    if (!passed) {
      failed += 1;
    }
    console.log(`${passed ? 'ok' : 'not ok'} ${count} - ${description}`);
    if (!passed && diagnostic !== undefined) {
      console.log('  ---');
      console.log(`  message: ${JSON.stringify(diagnostic)}`);
      console.log('  ...');
    }
  };
  return {
    ok: (value, description, diagnostic) => report(Boolean(value), description, diagnostic),
    equal: (actual, expected, description, diagnostic) =>
      report(actual === expected, description, diagnostic ?? { actual, expected }),
    fail: (description, diagnostic) => report(false, description, diagnostic),
    plan: () => console.log(`1..${count}`),
    failed: () => failed,
  };
}

// ---------------------------------------------------------------------------
// HTTP server and browser.
// ---------------------------------------------------------------------------

function serve(root) {
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(join(root, pathname));
    if (file !== root && !file.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(file);
      response.writeHead(200, { 'Content-Type': MIME_TYPES[extname(file)] || 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  return new Promise((done) => {
    server.listen(0, '127.0.0.1', () => done(server));
  });
}

async function launch() {
  const { chromium } = await import('playwright');
  const options = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};
  return chromium.launch(options);
}

function context(format, base) {
  let browser = null;
  return {
    format,
    only(...formats) {
      if (!formats.includes(format)) {
        throw new Skip(`no test for the format ${format}`);
      }
    },
    // A page in `context` shares its BroadcastChannel with the other pages
    // of that context. Without it, each page has its own context.
    // `rewrite` is a pair [from, to]: the context replaces the first text in
    // each HTML response, for example to put a label with markup in the
    // configuration.
    async open(query, { ready = true, context = null, rewrite = null } = {}) {
      browser = browser || (await launch());
      const owner = context || (await browser.newContext());
      if (rewrite) {
        await owner.route((url) => url.pathname.endsWith('.html'), async (route) => {
          const response = await route.fetch();
          await route.fulfill({ response, body: (await response.text()).replace(rewrite[0], rewrite[1]) });
        });
      }
      const page = await owner.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(base + query, { waitUntil: 'load' });
      if (ready) {
        await page.waitForFunction(() => document.documentElement.classList.contains('veil-ready'), null, { timeout: 5000 });
      }
      return { page, errors };
    },
    async close() {
      if (browser) {
        await browser.close();
      }
    },
  };
}

async function main() {
  const output = process.env.EXTENSION_TEST_OUTPUT;
  const format = process.env.EXTENSION_TEST_FORMAT;
  const input = process.env.EXTENSION_TEST_INPUT;
  const test = input ? tests[basename(input)] : undefined;
  if (!output || !format || !test) {
    console.error(`veil-check: no test for the input ${input}`);
    process.exit(SKIP);
  }

  const root = resolve(dirname(output));
  const server = await serve(root);
  const base = `http://127.0.0.1:${server.address().port}/${encodeURIComponent(basename(output))}`;
  const ctx = context(format, base);
  const t = createTap();
  let code = 0;
  console.log('TAP version 13');
  try {
    await test(t, ctx);
  } catch (error) {
    if (error instanceof Skip) {
      console.error(`veil-check: ${error.message}`);
      code = SKIP;
    } else {
      t.fail('the test function runs to its end', String(error && error.stack ? error.stack : error));
    }
  } finally {
    await ctx.close();
    server.close();
  }
  if (code === SKIP) {
    process.exit(SKIP);
  }
  t.plan();
  process.exit(t.failed() > 0 ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
