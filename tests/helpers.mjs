// Helpers that the browser checks share.

export function waitTrue(page, fn, arg) {
  return page.waitForFunction(fn, arg, { timeout: 5000 }).then(() => true, () => false);
}

// The two frames of the speaker view, when the deck and veil are ready.
export async function speakerFrames(popup) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const frames = popup.frames().filter((frame) => frame.url().includes('receiver'));
    if (frames.length === 2) {
      const ready = await Promise.all(frames.map((frame) => frame.evaluate(() => Boolean(
        window.Reveal && window.Reveal.isReady() && document.documentElement.classList.contains('veil-ready'),
      )).catch(() => false)));
      if (ready.every(Boolean)) {
        return frames;
      }
    }
    await popup.waitForTimeout(100);
  }
  throw new Error('the two frames of the speaker view do not load');
}
