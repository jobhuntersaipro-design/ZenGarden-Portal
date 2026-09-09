"""Turn a printed Google Sheets PDF of the DC inventory into import labels.

    python3 scripts/pdf-to-labels.py <file.pdf> > docs/imports/<name>.labels.json

Then feed the result to the importer, which parses it with the same code an
.xlsx goes through:

    npx tsx --env-file=.env.local scripts/import-catalog.ts \
      --labels docs/imports/<name>.labels.json --dry-run

Why this exists: the customer's sheet arrived as a one-page PDF print. Every
column of a 300-row, 800-column sheet is squeezed onto one A4 page, so the text
is sub-1pt and a plain text extraction interleaves the columns into nonsense.
But Google Sheets draws each cell border as a vector line and *omits* the
internal borders of a merged cell, so the drawn borders recover the merge
structure exactly: the horizontal borders inside one column's x-range mark
where that column's merged cells start and end, and a merged cell's text sits
at the vertical centre of its range. That is enough to rebuild the three label
columns — brand, line, variant — which is all the importer needs.

Needs PyMuPDF (`pip install pymupdf`). Prefer the .xlsx when there is one;
this is for when there is not.
"""
import sys, bisect, json, collections

import fitz

PDF = sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__)
COLS = {"brand": (50.3, 54.8), "block": (54.8, 61.2), "variant": (61.2, 68.9)}

page = fitz.open(PDF)[0]

hlines = []          # (y, x0, x1)
vset = set()
for item in page.get_drawings():
    for op in item["items"]:
        if op[0] == "l":
            p1, p2 = op[1], op[2]
            if abs(p1.y - p2.y) < 0.2:
                hlines.append((p1.y, min(p1.x, p2.x), max(p1.x, p2.x)))
            elif abs(p1.x - p2.x) < 0.2:
                vset.add(round(p1.x, 1))
        elif op[0] == "re":
            r = op[1]
            if r.height < 0.3: hlines.append((r.y0, r.x0, r.x1))
            if r.width  < 0.3: vset.add(round(r.x0, 1))

def merge_vals(vals, tol):
    vals = sorted(vals); out = [vals[0]]
    for v in vals[1:]:
        if v - out[-1] > tol: out.append(v)
    return out

row_edges = merge_vals([y for y, _, _ in hlines], 0.4)
print("row bands:", len(row_edges) - 1, file=sys.stderr)

def borders_in(x0, x1):
    """The y positions where a border is drawn across this column."""
    ys = [y for y, a, b in hlines if a <= x0 + 0.3 and b >= x1 - 0.3]
    return merge_vals(ys, 0.4) if ys else []

words = page.get_text("words")

def column_text(x0, x1):
    """Row-band -> text, then spread each value across its merged range."""
    per_band = collections.defaultdict(list)
    for w in words:
        cx = (w[0] + w[2]) / 2
        if not (x0 <= cx < x1):
            continue
        band = bisect.bisect_right(row_edges, (w[1] + w[3]) / 2) - 1
        if band >= 0:
            per_band[band].append(w)

    raw = {}
    for band, ws in per_band.items():
        ws.sort(key=lambda w: (round(w[1] * 2), w[0]))   # line, then left-to-right
        raw[band] = " ".join(w[4] for w in ws)

    edges = borders_in(x0, x1)
    cuts = sorted({bisect.bisect_right(row_edges, y) - 1 for y in edges})
    out = {}
    for i, start in enumerate(cuts):
        end = cuts[i + 1] if i + 1 < len(cuts) else len(row_edges) - 1
        text = " ".join(raw[b] for b in range(start, end) if b in raw).strip()
        if text:
            for b in range(start, end):
                out[b] = text
    return out

cols = {name: column_text(*rng) for name, rng in COLS.items()}

# Rows the sheet uses for its own headers, not for products.
HEADER = {"PURCHASE", "INVOICE NO.", "PERSON-IN-CHARGE", "DOs (CONFIRM"}

labels = []
for band in range(len(row_edges) - 1):
    brand = cols["brand"].get(band, "").strip()
    block = cols["block"].get(band, "").strip()
    variant = cols["variant"].get(band, "").strip()
    if not brand or brand in HEADER or not block:
        continue
    # The font subset mangles the O of "SUPER INDO".
    block = block.replace("IND\u29be", "INDO").replace("\u29be", "O")
    labels.append({"brand": brand, "block": block, "variant": variant})

print(json.dumps(labels, indent=0))
print(f"{len(labels)} label rows from {len(row_edges) - 1} row bands", file=sys.stderr)
