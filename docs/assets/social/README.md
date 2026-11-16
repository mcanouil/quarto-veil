# Social card

`og-image.png` is the Open Graph preview for this site.
`website.open-graph.image` and `website.twitter-card.image` in `_quarto.yml` refer to it.
It is declared inside those blocks because Quarto's first-image harvest beats a project-level `website.image`.

The card is committed.
It is the export of `social-cards/quarto-veil.png` from the `mcanouil/quarto-social-cards` repository, at 2400x1260 pixels.
To change it, export the card again in that repository and copy the new file over this one.
Then update `image-alt` in `_quarto.yml`, so that a screen reader announces what the new card shows.

The path is project-relative on purpose.
Quarto measures a project-relative image to fill `og:image:width` and `og:image:height`, and returns no size for an absolute URL.
Without both tags, a scraper can lay out the card only after the image has downloaded.
