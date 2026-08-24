// Cutting the studio backdrop off the hero shot.
//
// This is the one piece of image work the host still owns. Layout is the agent's
// to design, but a cutout is mechanical and checkable, and leaving it to the
// prompt means it is sometimes skipped — which does not fail loudly, it just
// composites a white rectangle behind the product.
import type { Sandbox } from 'e2b'
import { OUT_DIR } from './brief.ts'

export const HERO = `${OUT_DIR}/hero.png`
export const HERO_CUT = `${OUT_DIR}/hero-cut.png`

/**
 * Flood-fill inward from all four corners rather than keying on white globally,
 * so white *on the product* survives.
 *
 * The alpha check is measured before the trim, deliberately: `-trim` crops to the
 * product's bounding box, and a rectangular product — a phone, a box — fills that
 * box, so mean alpha after trimming is ~1.0 even on a clean cut.
 */
const SCRIPT = `set -e
W=$(identify -format '%w' ${HERO})
H=$(identify -format '%h' ${HERO})
convert ${HERO} -alpha set -fuzz 12% \\
  -fill none -draw "color 0,0 floodfill" \\
  -fill none -draw "color $((W-1)),0 floodfill" \\
  -fill none -draw "color 0,$((H-1)) floodfill" \\
  -fill none -draw "color $((W-1)),$((H-1)) floodfill" \\
  /tmp/hero-untrimmed.png
A=$(convert /tmp/hero-untrimmed.png -alpha extract -format '%[fx:mean]' info:)
if awk -v a="$A" 'BEGIN { print (a > 0.98) ? 1 : 0 }' | grep -q 1; then
  echo "backdrop was not removed (alpha mean $A)" >&2
  exit 1
fi
convert /tmp/hero-untrimmed.png -trim +repage ${HERO_CUT}
identify -format 'hero-cut.png %wx%h\\n' ${HERO_CUT}`

/** Returns the cutout's dimensions, or null when the backdrop would not come off. */
export async function cutHero(sandbox: Sandbox): Promise<string | null> {
  const result = await sandbox.commands.run(SCRIPT, { timeoutMs: 120_000 }).catch(() => null)
  if (!result || result.exitCode !== 0) {
    console.warn(`hero cutout failed: ${result?.stderr.trim() ?? 'command did not run'}`)
    return null
  }
  return result.stdout.trim()
}
