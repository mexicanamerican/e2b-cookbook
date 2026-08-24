#!/usr/bin/env python3
"""Render the ad set. Deterministic: same brief and hero in, same pixels out.

Layout is arithmetic, so it lives here rather than in the prompt. The agent runs
this, audits what it produced and presents it — it does not re-derive the
geometry, which is what made every size fail differently.

Nothing is installed: ImageMagick 6 ships in the E2B base template and the rest
is the Python standard library.

Two ImageMagick primitives do the work that guessing a point size cannot:

    caption:TEXT  with -size WxH   wraps and scales text to fit the box
    label:TEXT    with -size WxH   scales one line to fit the box

Both pick the point size themselves, so copy physically cannot overflow its box.
"""
import json
import pathlib
import subprocess
import sys

BRIEF_DIR = pathlib.Path("/home/user/brief")
OUT_DIR = pathlib.Path("/home/user/out")
FONTS = BRIEF_DIR / "canvas-fonts"

# A face has to be named: this ImageMagick build has no default type configured,
# so `caption:` without -font fails outright rather than falling back. The nice
# typefaces arrive with the skills, and the example is documented as still
# running without them, so resolve down to the DejaVu that ships in the base
# image instead of dying.
PREFERRED_FONT = FONTS / "InstrumentSans-Bold.ttf"
FALLBACK_FONT = pathlib.Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")


def resolve_font() -> str:
    for candidate in (PREFERRED_FONT, FALLBACK_FONT):
        if candidate.exists():
            return str(candidate)
    matched = subprocess.run(
        ["fc-match", "-f", "%{file}", "sans-serif"], capture_output=True, text=True
    ).stdout.strip()
    if not matched:
        sys.exit("no usable typeface found — cannot render text")
    return matched


FONT = ["-font", resolve_font()]

# Below roughly this the call to action stops being readable at all.
MIN_PILL_H = 24


def run(*args: object) -> None:
    """Run an ImageMagick command, surfacing its stderr when it fails.

    `check=True` alone reports only "exit status 1", which tells whoever reads
    the log — agent or human — nothing about what went wrong.
    """
    argv = [str(a) for a in args]
    result = subprocess.run(argv, capture_output=True, text=True)
    if result.returncode != 0:
        sys.exit(f"{argv[0]} failed ({result.returncode}): {result.stderr.strip()}\n  {' '.join(argv)}")


def size_of(path: pathlib.Path) -> tuple[int, int]:
    out = subprocess.run(
        ["identify", "-format", "%w %h", str(path)], check=True, capture_output=True, text=True
    ).stdout.split()
    return int(out[0]), int(out[1])


def clamp(value: float, low: int, high: int) -> int:
    return max(low, min(high, round(value)))


def cut_hero(hero: pathlib.Path, cut: pathlib.Path) -> None:
    """Drop the white studio backdrop, keeping the product.

    Flood-fill inward from all four corners rather than keying on white
    globally, so white *on the product* survives. The alpha check below is the
    point: compositing the uncut hero is the failure that silently produces a
    white rectangle behind the can.
    """
    w, h = size_of(hero)
    corners = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    fill: list[str] = []
    for x, y in corners:
        fill += ["-fill", "none", "-draw", f"color {x},{y} floodfill"]
    run("convert", hero, "-alpha", "set", "-fuzz", "12%", *fill, "-trim", "+repage", cut)

    # Prove the cut worked: every corner of a cut hero must be transparent.
    alpha = subprocess.run(
        ["convert", str(cut), "-alpha", "extract", "-format", "%[fx:mean]", "info:"],
        check=True, capture_output=True, text=True,
    ).stdout.strip()
    if float(alpha) > 0.98:
        sys.exit(f"backdrop was not removed from {hero} (alpha mean {alpha}) — refusing to composite")


def fit_hero(cut: pathlib.Path, box_w: int, box_h: int, dest: pathlib.Path) -> None:
    """Scale the hero to sit inside its box. `-resize WxH` fits, never crops."""
    run("convert", cut, "-resize", f"{box_w}x{box_h}", "-background", "none",
        "-gravity", "center", "-extent", f"{box_w}x{box_h}", dest)


def render_headline(text: str, colour: str, box_w: int, box_h: int, dest: pathlib.Path) -> None:
    """`caption:` wraps and auto-sizes to the box, so this cannot overflow."""
    run("convert", "-background", "none", "-fill", colour, *FONT,
        "-size", f"{box_w}x{box_h}", "-gravity", "west", f"caption:{text}",
        "-trim", "+repage", dest)


def render_pill(text: str, bg: str, fg: str, box_w: int, box_h: int, dest: pathlib.Path) -> None:
    """A call-to-action pill sized from its own text, then clamped to its box.

    The text colour is fixed against the pill colour rather than inherited from
    the palette — that inheritance is how the CTA ended up ink-on-ink.
    """
    pad_x = clamp(box_h * 0.55, 8, 40)
    pad_y = clamp(box_h * 0.26, 4, 18)
    label = dest.with_name(dest.stem + "-text.png")
    run("convert", "-background", "none", "-fill", fg, *FONT,
        "-size", f"{box_w - 2 * pad_x}x{box_h - 2 * pad_y}", f"label:{text}",
        "-trim", "+repage", label)

    text_w, text_h = size_of(label)
    pill_w, pill_h = text_w + 2 * pad_x, text_h + 2 * pad_y
    radius = pill_h // 2
    run("convert", "-size", f"{pill_w}x{pill_h}", "xc:none", "-fill", bg,
        "-draw", f"roundrectangle 0,0,{pill_w - 1},{pill_h - 1},{radius},{radius}",
        dest)
    run("composite", "-gravity", "center", label, dest, dest)
    label.unlink()


def compose(size: str, brief: dict, cut: pathlib.Path) -> dict:
    w, h = (int(n) for n in size.split("x"))
    ink = brief["palette"]["ink"]
    cream = brief["palette"]["cream"]
    accent = brief["palette"]["accent"]

    safe = clamp(min(w, h) * 0.05, 6, 28)
    gutter = clamp(min(w, h) * 0.04, 6, 24)
    inner_w, inner_h = w - 2 * safe, h - 2 * safe

    # Product and copy always get their own box, so they can never collide.
    # Side by side only when the ad is genuinely wide; stacked otherwise. A
    # leaderboard is so short that a 38% hero column is a sliver, so the
    # widest ratios hand most of the width back to the copy.
    if w / h >= 1.8:
        hero_w = round(inner_w * (0.16 if w / h >= 4 else 0.38))
        hero_box = (safe, safe, hero_w, inner_h)
        copy_box = (safe + hero_w + gutter, safe, inner_w - hero_w - gutter, inner_h)
    else:
        hero_h = round(inner_h * 0.52)
        hero_box = (safe, safe, inner_w, hero_h)
        copy_box = (safe, safe + hero_h + gutter, inner_w, inner_h - hero_h - gutter)

    hero_x, hero_y, hero_w, hero_h = hero_box
    copy_x, copy_y, copy_w, copy_h = copy_box

    work = OUT_DIR / f".work-{size}"
    work.mkdir(parents=True, exist_ok=True)

    hero_img = work / "hero.png"
    fit_hero(cut, hero_w, hero_h, hero_img)

    # The headline is sized first and the pill is scaled off what it actually
    # measured, so the two stay in proportion at every size instead of the pill
    # shrinking to a dash on wide ads. Capping the headline box by the copy
    # *width* keeps type from ballooning on tall boxes.
    inner_gap = clamp(copy_h * 0.08, 4, 20)
    head_h = min(copy_h - MIN_PILL_H - inner_gap, round(copy_w * 0.42))

    head_img = work / "head.png"
    render_headline(brief["headline"], cream, copy_w, head_h, head_img)
    head_w, head_real_h = size_of(head_img)

    pill_h = clamp(head_real_h * 0.5, MIN_PILL_H, 72)
    # Whatever the proportion suggests, the stack still has to fit its box.
    pill_h = max(MIN_PILL_H, min(pill_h, copy_h - head_real_h - inner_gap))

    pill_img = work / "pill.png"
    render_pill(brief["cta"], accent, ink, copy_w, pill_h, pill_img)
    pill_w, pill_real_h = size_of(pill_img)

    # Centre the copy stack in its box rather than pinning it to an edge.
    stack_h = head_real_h + inner_gap + pill_real_h
    stack_y = copy_y + max(0, (copy_h - stack_h) // 2)

    out = OUT_DIR / f"{size}.png"
    run("convert", "-size", f"{w}x{h}", f"xc:{ink}",
        hero_img, "-geometry", f"+{hero_x}+{hero_y}", "-composite",
        head_img, "-geometry", f"+{copy_x}+{stack_y}", "-composite",
        pill_img, "-geometry", f"+{copy_x}+{stack_y + head_real_h + inner_gap}", "-composite",
        out)

    for leftover in work.iterdir():
        leftover.unlink()
    work.rmdir()

    return {
        "size": size,
        "file": out.name,
        "width": w,
        "height": h,
        "backdrop": ink,
        "text": cream,
        "cta": {"fill": accent, "text": ink},
        "layout": "side-by-side" if w / h >= 1.8 else "stacked",
    }


def contact_sheet(variants: list[dict]) -> None:
    """A contact sheet with one uniform cell per variant, captioned underneath.

    Captions live on the sheet, never on the creative — a size label rendered
    into the ad itself is a defect, not a caption.
    """
    cells = []
    for variant in variants:
        cell = OUT_DIR / f".cell-{variant['size']}.png"
        run("convert", OUT_DIR / variant["file"], "-resize", "320x320",
            "-background", "#111318", "-gravity", "center", "-extent", "340x340", cell)
        cells.append((cell, variant["size"]))

    args: list[object] = ["montage"]
    for cell, size in cells:
        args += ["-label", size, cell]
    args += ["-tile", "3x", "-geometry", "+12+12", "-background", "#0B0B0F",
             "-fill", "#F6F1E7", *FONT, "-pointsize", "18",
             OUT_DIR / "contact-sheet.png"]
    run(*args)
    for cell, _ in cells:
        cell.unlink()


def main() -> None:
    brief = json.loads((BRIEF_DIR / "brand.json").read_text())
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    cut = OUT_DIR / "hero-cut.png"
    cut_hero(BRIEF_DIR / "hero.png", cut)

    variants = [compose(size, brief, cut) for size in brief["sizes"]]
    (OUT_DIR / "manifest.json").write_text(json.dumps({"brand": brief["name"], "variants": variants}, indent=2))
    contact_sheet(variants)

    for variant in variants:
        print(f"{variant['size']:>10}  {variant['layout']:<13} {variant['file']}")


if __name__ == "__main__":
    main()
