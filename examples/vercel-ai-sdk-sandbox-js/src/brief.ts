// The campaign brief, the prompts and the paths the agent works in — the single
// copy, shared by the standalone script and the web workbench so the two cannot
// drift apart.

export const BRIEF = {
  name: 'Verdant One',
  headline: 'Built dark. Runs bright.',
  cta: 'Pre-order',
  palette: { ink: '#07120D', cream: '#EAF6EF', accent: '#2BE08A' },
  rules: { minContrast: 4.5, safeAreaPx: 24, paletteTolerance: 24, minColourShare: 0.015 },
  sizes: ['1200x628', '1080x1080', '300x250', '728x90', '160x600'],
}

export const HERO_PROMPT = `Product photograph of a slim matte charcoal smartphone standing upright and
  facing the camera, its screen switched off so the front is plain dark glass,
  with a single thin bright green accent band running around the edge of the
  frame, centred, lit softly from the left, on a plain pure white seamless studio
  backdrop with no shadow on the backdrop, no text, no logo, no on-screen
  interface, no props.`

export const AD_SET_PROMPT = `The campaign brief is /home/user/brief/brand.json. The hero product shot is
/home/user/out/hero-cut.png — the studio backdrop is already cut off it, so it
composites onto any colour with no white box behind the product. Use that one.
The uncut original is beside it as hero.png if you ever need it.

Write your scripts into /home/user/brief and everything you want served into
/home/user/out. Use absolute paths when you read and write files on disk — do not
rely on the working directory.

Inside the pages it is the opposite: they are served over HTTP, so every
reference between them — an iframe src, an image src, a stylesheet href — has to
be a relative URL like hero-cut.png or 728x90.html. An absolute filesystem path
or a file:// URL will not load from a served page, and the frame will silently
come up empty.

Design the ad set as HTML and CSS. The art direction comes from the banner-design
skill at /home/user/.agents/skills/banner-design: read its SKILL.md and its
references/banner-sizes-and-styles.md first, and take from it the style
vocabulary and the design rules — critical content inside the central 70-80%, at
most two typefaces, one call to action, headline at 32px or more, text kept under
a fifth of the canvas.

Take the art direction from that skill and nothing else from it. Its workflow
assumes a toolchain this sandbox does not have: there is nobody to ask questions
of, no Chrome and no Pinterest to research with, none of the ui-ux-pro-max,
frontend-design, ai-artist, ai-multimodal or chrome-devtools skills it refers to,
no inject-brand-context.cjs, and no headless browser — so its screenshot-to-PNG
export step cannot be done here. Do not go looking for any of that, do not ask me
questions, and do not try to rasterise a page. brand.json is the brand context,
and the pages themselves are the deliverable.

One design direction rather than three, carried across every size in the brief:
one standalone file /home/user/out/<size>.html per size, laid out at exactly the
pixel dimensions named there. A real browser opens these, so use real typography
— load webfonts in the CSS — and gradients, masks, blend modes and transforms are
all available to you. ImageMagick (convert) is installed if you want to process
the hero further.

Fill the frame. html and body sit at exactly the declared width and height with
no margin and nothing scrollable, and the artwork runs to all four edges — the
safe area is where copy and the call to action stay, not a box the design sits
inside, so do not add a decorative inner border that shrinks the composition into
the middle of the canvas. The product should read as the subject of the ad, large
in frame, not a small thumbnail floating in empty space.

Nothing may overlap. Give the product and the copy regions of their own at every
size and keep them apart, rather than layering type over the product and hoping
it lands somewhere readable. Cut content to fit instead: a 1200x628 or 1080x1080
has room for the kicker, the headline, a supporting line and the call to action,
while a 728x90 leaderboard and a 160x600 skyscraper have room for the logo, the
headline and the call to action and nothing else — drop the supporting line there
rather than squeezing it in. Every size gets a composition that suits its shape;
the same design does not mean the same arrangement.

Then /home/user/out/index.html: a gallery showing every size at its native
dimensions, captioned, on a dark backdrop, each one in an iframe so the pages
render exactly as they will when trafficked. Size each frame to the page it holds
— a 728x90 frame is 728 by 90 — rather than scaling pages down or padding them
into cells of a uniform size, and let the gallery scroll if a page is wider than
the window. This is the page a reviewer opens, so it is worth designing too.

Then brand_check.py: audit the pages you wrote and print one row per size as a
GitHub-flavoured markdown table — a header row, a separator row of dashes, then
one row per size. Check the declared width and height against the brief exactly,
the WCAG contrast ratio between the headline colour and the surface behind it
against minContrast, and that the colours the CSS declares sit within
paletteTolerance of a brand colour. This sandbox has no rasteriser, so you are
auditing what the markup declares — say so in the table rather than implying you
measured pixels. Exit non-zero if any size fails.

/home/user/out is already being served on port 3000, so you do not need to start
a server — anything you write there is live as soon as you write it.

Report the audit table verbatim and stop.`

/** Where the agent works. The page shows this directory. */
export const OUT_DIR = '/home/user/out'
export const BRIEF_DIR = '/home/user/brief'

/**
 * The port OUT_DIR is served on, and the command that serves it.
 *
 * The host starts this at boot rather than leaving it to the agent: the preview
 * has to work for the first page the agent writes, and a gallery URL that only
 * resolves once the agent remembers to start a server is a URL that sometimes
 * 404s for reasons the page cannot see.
 */
export const GALLERY_PORT = 3000

/**
 * Detached on purpose. `commands.run(..., { background: true })` ties the process
 * to the connection that started it, so the server dies as soon as that goes
 * away and the gallery host answers 502 — verified. `nohup setsid ... &` puts it
 * in its own session with stdio off the command channel, so it outlives us.
 */
export const SERVE_COMMAND =
  `nohup setsid python3 -m http.server ${GALLERY_PORT} --directory ${OUT_DIR}` +
  ' > /tmp/gallery.log 2>&1 < /dev/null &'
