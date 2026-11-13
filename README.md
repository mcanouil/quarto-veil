# Veil Extension For Quarto

Veil lets you keep one deck for many audiences.
You tag slides and content with named groups, and a key press shows or hides each group during the talk.
A hidden slide leaves the deck, so the slide numbers, the progress bar, and the overview stay correct.

## Installation

```bash
quarto add mcanouil/quarto-veil@0.2.1
```

This will install the extension under the `_extensions` subdirectory.

If you are using version control, you will want to check in this directory.

## Usage

Add the filter and the Reveal.js plugin to your front matter.
Then give the class `.veil` to any slide or block that belongs to a group.

```markdown
---
format: revealjs
filters:
  - veil
revealjs-plugins:
  - veil
extensions:
  veil:
    groups:
      - name: expert
        shown: false
---

## Introduction

Everyone sees this slide.

## Proof {.veil group="expert"}

This slide is for experts.
```

Render the deck, open it and press `u` to bring up the popover.
The switch for `expert` starts off, and you can turn it on to bring the slide back.

## Documentation

The full documentation lives at <https://m.canouil.dev/quarto-veil/>: authoring, groups and levels, keys and the popover, state and sharing, static formats, Reveal.js notes, the JavaScript API, and every option.

[`example.qmd`](example.qmd) is a short, standalone starting point you can copy.

Veil has a runtime for `html` and `revealjs`, where the reader shows and hides groups in the browser.
In every other format, including `dashboard`, Veil removes the hidden content when it renders.

## Licence

[MIT](https://github.com/mcanouil/quarto-veil?tab=MIT-1-ov-file#readme).
