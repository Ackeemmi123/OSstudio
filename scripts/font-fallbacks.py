"""Metric-matched fallback @font-face rules for the services design's web fonts.

For each web font: size-adjust makes the fallback's average character as wide as
the web font's, and ascent/descent/line-gap overrides give it the same vertical
metrics, so text takes the same space before and after the web font arrives
(no layout shift on swap). Same method as next/font and capsize.
Usage (needs Python with fontTools and brotli, on a Mac for Arial and Times New Roman):
  python3 scripts/font-fallbacks.py design-systems/services/fonts
Paste the printed rules into design-systems/services/styles.ts when a font is added
or changed, and list "<Family> Fallback" right after "<Family>" in its font stacks.
The services tests check that every web font has one.
"""
import sys
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

# Words as these sites use them: Finnish, Swedish and English, with spaces.
SAMPLE = (
    "Immateriaalioikeuksia koskevia asiantuntijapalveluita ja oikeudellisia arvioita "
    "suojien sisällöstä. Välkommen till vårt café, öppet alla dagar med nybakat bröd. "
    "Carefully built websites for small businesses and associations, in three languages. "
    "ÅÄÖ åäö 2026 – 12,50 €"
)

FALLBACKS = {
    "serif": ("/System/Library/Fonts/Supplemental/Times New Roman.ttf", ['local("Times New Roman")', 'local("Times")', 'local("Liberation Serif")', 'local("Tinos")']),
    "sans": ("/System/Library/Fonts/Supplemental/Arial.ttf", ['local("Arial")', 'local("Helvetica")', 'local("Liberation Sans")', 'local("Arimo")']),
}

# The weight a variable font is measured at: the one the design sets most text in
# (statement's display is 900, editorial's 300, statement's body Archivo 400).
WEIGHTS = {"Big Shoulders Display": 900, "Fraunces": 300, "Archivo": 400}

FAMILIES = [
    # family, file, kind
    ("Fraunces", "fraunces-display-normal.woff2", "serif"),
    ("Instrument Sans", "instrument-sans-latin-wght-normal.woff2", "sans"),
    ("Bodoni Moda", "bodoni-moda-latin-wght-normal.woff2", "serif"),
    ("Hanken Grotesk", "hanken-grotesk-latin-wght-normal.woff2", "sans"),
    ("Big Shoulders Display", "big-shoulders-display-latin-wght-normal.woff2", "sans"),
    ("Archivo", "archivo-latin-wdth-normal.woff2", "sans"),
    ("Young Serif", "young-serif-latin-normal.woff2", "serif"),
    ("Figtree", "figtree-latin-wght-normal.woff2", "sans"),
    ("Cormorant Garamond", "cormorant-garamond-latin-wght-normal.woff2", "serif"),
    ("Work Sans", "work-sans-latin-wght-normal.woff2", "sans"),
]


def metrics(path, weight=None):
    font = TTFont(path)
    if weight and "fvar" in font:
        font = instancer.instantiateVariableFont(font, {"wght": weight})
    upm = font["head"].unitsPerEm
    cmap = font.getBestCmap()
    hmtx = font["hmtx"].metrics
    widths = [hmtx[cmap[ord(ch)]][0] for ch in SAMPLE if ord(ch) in cmap]
    missing = [ch for ch in SAMPLE if ord(ch) not in cmap]
    os2 = font["OS/2"]
    use_typo = bool(os2.fsSelection & (1 << 7))
    if use_typo:
        ascent, descent, gap = os2.sTypoAscender, os2.sTypoDescender, os2.sTypoLineGap
    else:
        hhea = font["hhea"]
        ascent, descent, gap = hhea.ascent, hhea.descent, hhea.lineGap
    return {"upm": upm, "avg": sum(widths) / len(widths) / upm, "ascent": ascent, "descent": descent, "gap": gap, "missing": missing}


def pct(value):
    return f"{value * 100:.2f}%"


def main(fonts_dir):
    base = {kind: metrics(path) for kind, (path, _) in FALLBACKS.items()}
    rules = []
    for family, file, kind in FAMILIES:
        m = metrics(Path(fonts_dir) / file, WEIGHTS.get(family))
        size_adjust = m["avg"] / base[kind]["avg"]
        upm = m["upm"]
        ascent = m["ascent"] / (upm * size_adjust)
        descent = abs(m["descent"]) / (upm * size_adjust)
        gap = m["gap"] / (upm * size_adjust)
        locals_ = ",".join(FALLBACKS[kind][1])
        rules.append(
            f'@font-face{{font-family:"{family} Fallback";src:{locals_};size-adjust:{pct(size_adjust)};'
            f"ascent-override:{pct(ascent)};descent-override:{pct(descent)};line-gap-override:{pct(gap)}}}"
        )
        if m["missing"]:
            print(f"/* {family}: no glyph for {''.join(sorted(set(m['missing'])))} */", file=sys.stderr)
    print("\n".join(rules))


main(sys.argv[1])
