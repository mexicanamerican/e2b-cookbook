// The campaign brief, the prompts and the paths the agent works in — the single
// copy, shared by the standalone script and the web workbench so the two cannot
// drift apart.

export const BRIEF = {
  name: 'Aurora Cold Brew',
  headline: 'Brewed cold. Served bold.',
  cta: 'Shop now',
  palette: { ink: '#0B0B0F', cream: '#F6F1E7', accent: '#FF6D00' },
  rules: { minContrast: 4.5, safeAreaPx: 24, paletteTolerance: 24, minColourShare: 0.015 },
  sizes: ['1200x628', '1080x1080', '300x250', '728x90', '160x600'],
}

export const HERO_PROMPT = `Product photograph of a tall matte dark-brown cold brew coffee can with a
  single bright orange band around the middle, centred, lit softly from the left,
  on a plain pure white seamless studio backdrop with no shadow on the backdrop,
  no text, no logo, no props.`

export const AD_SET_PROMPT = `The campaign brief is /home/user/brief/brand.json and
the hero product shot is /home/user/brief/hero.png. Write your scripts into
/home/user/brief and every artefact into /home/user/out, using absolute paths
throughout — do not rely on the working directory.

The ad set is already rendered for you by /home/user/brief/render.py. Layout is
arithmetic and it is solved: run that script, do not rewrite it, and do not
hand-roll your own compositing.

    python3 /home/user/brief/render.py

It cuts the backdrop off the hero, composes one PNG per size in the brief into
/home/user/out, and writes out/manifest.json and out/contact-sheet.png. If it
exits non-zero, report its error verbatim and stop rather than working around it.

Then two scripts of your own.

First, brand_check.py: audit each variant in the manifest and print one row per
size as a GitHub-flavoured markdown table — a header row, a separator row of
dashes, then one row per size — so the verdict reads as a table rather than as a
wall of fixed-width text. Check the trafficking dimensions exactly, the WCAG
contrast ratio between the headline colour and its backdrop against minContrast,
and that every colour covering at least minColourShare of the image is within
paletteTolerance of a brand colour — exempting colours the product itself is
made of, since the audit judges the layout, not the photograph. Anti-aliased
edge pixels are noise, not colours. Exit non-zero if any variant fails.

Second, gallery.py: write out/index.html, a dark gallery of every variant. It
must be a genuinely single file: embed every image as a base64 data: URI and
never lazy-load, so the page is complete in one request and still works opened
straight off disk. Tile the variants in even cells captioned with their
dimensions, and never scale one past its native size — a skyscraper must not
stretch the grid. Then tar the variants, out/contact-sheet.png and the gallery
into out/ad-set.tar.gz as flat entries with no directory prefixes, and serve
/home/user/out on port 3000 in the background.

Run all three. Report the audit table verbatim and stop.`

/** Where the agent works. The page shows this directory. */
export const OUT_DIR = '/home/user/out'
export const BRIEF_DIR = '/home/user/brief'
