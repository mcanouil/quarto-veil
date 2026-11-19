# Icons

`icon.svg` is Quarto's own mark, the quartered circle, taken from Quarto's `quarto-icon.svg` as it stands.
That is the plain icon, not the wordmark, and not the trademarked lock-up.
The geometry and the `#74AADB` fill are untouched; only the editor prolog was dropped and `role="img"` with a `<title>` added, so the mark is announced rather than skipped.

Every extension documentation site in this family carries the same mark.
Other sites have no icon until they have a mark of their own.
This site flattens the rasters onto the background of its own preset, so regenerate them when the preset changes.
Replace `icon.svg` only when the extension has a mark of its own, and regenerate all four rasters from it when you do.

## Rasters

The rasters are flattened onto `#101216`, the page background of the atelier `terminal` preset that this site uses.
Quarto blue measures roughly 7.6 against it, so the silhouette holds at favicon size.
The mark is a single colour in both colour schemes, so there is no `prefers-color-scheme` rule to force and no user stylesheet is needed for the conversion.

Tools: `rsvg-convert` (librsvg) for the vector to raster step, `magick` (ImageMagick 7) for padding, flattening, and `.ico` assembly.
Neither is a build dependency; the commands are run by hand when the master changes.

Run from this directory.

```bash
for size in 32 144 154 410; do
  rsvg-convert -w "${size}" icon.svg -o "/tmp/icon-${size}.png"
done

magick /tmp/icon-32.png -background '#101216' -gravity center -extent 32x32 -flatten -strip /tmp/icon-32-flat.png
magick /tmp/icon-32-flat.png -define icon:format=png ../../favicon.ico
magick /tmp/icon-144.png -background '#101216' -gravity center -extent 180x180 -flatten -strip apple-touch-icon.png
magick /tmp/icon-154.png -background '#101216' -gravity center -extent 192x192 -flatten -strip icon-192.png
magick /tmp/icon-410.png -background '#101216' -gravity center -extent 512x512 -flatten -strip icon-512.png
```

`rsvg-convert -w` on its own preserves the aspect ratio, and the viewBox is 121.8 by 118.8 rather than square, so each render comes out slightly short and `-extent` centres it in the square.
The intermediate sizes are chosen so the mark lands at 80 percent of the final square, which is the 10 percent padding the Apple touch icon wants.
The favicon takes the full square instead, since it is only 32 pixels to begin with.

| File                   | Size    | Purpose                                                    |
| ---------------------- | ------- | ---------------------------------------------------------- |
| `icon.svg`             | vector  | `extensions.atelier.icon`, and the source for the rest     |
| `../../favicon.ico`    | 32x32   | `website.favicon`, for clients that ignore the SVG         |
| `apple-touch-icon.png` | 180x180 | `extensions.atelier.apple-touch-icon`, opaque, 10% padding |
| `icon-192.png`         | 192x192 | `../../site.webmanifest`                                   |
| `icon-512.png`         | 512x512 | `../../site.webmanifest`                                   |

There is no maskable icon: this is a documentation site, not an installable application.

## Manifest colours

`../../site.webmanifest` sets both `theme_color` and `background_color` to `#101216`, the same dark ground the rasters sit on, and JSON takes no comment to say why.

`background_color` paints the splash screen behind the icon before the first frame renders, so matching the ground the icon was flattened onto is what stops a light rim appearing around it.
`theme_color` is a single value and cannot vary by colour scheme.
The terminal preset is dark in both colour schemes, so one value matches the page as well as the icon.
