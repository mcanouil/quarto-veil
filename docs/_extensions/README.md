# Documentation website extensions

The extensions here fall into two groups, told apart by where they sit.

## Committed, under `mcanouil/`

`mcanouil/atelier` is a dependency of the website itself: the project type and the theme.
The site uses its `terminal` preset, which `../_brand.yml` selects.
It arrives with the scaffold, which carries its own copy, and it is checked in like any other Quarto extension.
Beyond that it is managed for you: [Quarto Wizard](https://m.canouil.dev/quarto-wizard) installs it, and the Quarto Extensions Updates workflow keeps it current by scanning this directory.

Atelier includes the code-window, collapse-output, div-reuse, gitlink, highlight-text, iconify, mobile-toc, offset-headings, preview-colour, prism, remember, toc-depth, and veil extensions, under `mcanouil/atelier/_extensions/`.
Do not add a separate copy of one of these extensions here, unless the site must run that copy.
When a page names a project copy in `filters`, atelier skips its bundled copy of the same extension, so only the project copy runs.

Veil is such a copy.
The site must show the checked-out source, so `local/veil` stays, and each page that uses veil names it in `filters`.

> [!IMPORTANT]
> Do not add or update it by hand with the Quarto CLI.
>
> `quarto add` and `quarto update` rewrite the manifest and drop the `source` and `source-type` fields, which are the only record of where an extension came from and at which version.
> An extension without them is invisible to the updater, and stays at whatever version it was left on.
>
> `quarto add` also fails here outright: `../_quarto.yml` declares `project: type: atelier`, and it builds a project context before installing anything, so it reports `Unsupported project type atelier` whenever atelier is missing or is the extension being replaced.

## Generated, under `local/`

`local/veil/` is a copy of the extension this repository publishes, taken from `_extensions/` at the repository root.
It is ignored by Git and produced by `../_scripts/sync-extension.sh`, so the repository root stays the single source of truth.
The `local` owner says where it came from, and keeps it clear of the vendored dependencies even when the extension is named after its owner.

Run the sync before previewing the site locally:

```bash
./docs/_scripts/sync-extension.sh
quarto render docs
```

The Pages workflow runs it before every render, so CI always builds the checked-out source.

A real copy is needed, rather than a symlink or a pre-render step.
Quarto builds its extension registry while reading `_quarto.yml`, before any pre-render script runs, and it does not follow symlinks.
A shortcode contributed by an extension that is only linked, or only copied in by `pre-render`, is reported as `Shortcode 'veil' not found` and renders as nothing.
