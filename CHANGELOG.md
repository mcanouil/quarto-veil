# Changelog

## Unreleased

- fix: Hide the Quarto back-to-top link while the popover is open at the bottom of the screen, so the link no longer peeks out from under the popover. (#10)
- fix: Hide the button and the popover while the narrow sidebar of a Quarto website is open, so neither floats over the sidebar. (#10)
- feat: Send a `veil:ready` event on `document` once the runtime has applied the start state, with the same detail as `Veil.state()`. (#11)

## 0.3.0 (2026-11-15)

- feat: Add the `--veil-border`, `--veil-shadow`, `--veil-toast-bg` and `--veil-active-bg` custom properties, so a theme can set every colour of the interface. Each one falls back to the colour it replaces.

## 0.2.1 (2026-11-13)

- fix: Hide the table of contents entry of a hidden section on a Quarto website, where Quarto makes the table of contents links absolute.

## 0.2.0 (2026-11-12)

- feat: Translate the interface text with the Quarto `language` keys, with built-in English and French text.
- build: Require Quarto 1.9.38 or newer.

## 0.1.0 (2026-11-11)

### New Features

- feat: Initial release.
