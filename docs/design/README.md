# Design canvas

The approved design for every screen. Published at
https://claude.ai/code/artifact/43c584c8-b4b6-4479-8d0f-391ab44299ae?org=a2177e54-d854-4d2e-a8f5-d482dfd63d88
and linked from `CLAUDE.md`. The written companion is
`../specs/design/loving-hands-portal-design.md`; the product-wide rules are in
`../specs/00-master.md` §4.

| Path | What it is |
|---|---|
| `artboards/*.dc.html` | The twelve artboards, one file per screen. **Edit these.** Each is a standalone HTML document: a `<helmet>` of shared CSS, inline-styled markup, and for the interactive ones a `<script data-dc-script>` holding a `Component extends DCLogic` whose `renderVals()` returns the `{{ bindings }}`. Templating is `{{ value }}`, `<sc-for list="{{ rows }}" as="r">` and `<sc-if value="{{ flag }}">`. |
| `artboards/canvas.json` | Artboard positions, sizes and the notes pinned to the canvas. |
| `loving-hands-portal-canvas.html` | The publishable bundle: the canvas runtime with the artboards embedded as JSON. Generated — do not hand-edit. |

## Working on it

```bash
cd docs/design
python3 validate.py     # tag balance, unbound {{ }}, JS syntax, palette
node render.js          # runs each artboard's logic, writes flat previews to render/
python3 rebuild.py      # folds artboards/ back into loving-hands-portal-canvas.html
```

Then publish `loving-hands-portal-canvas.html` to the artifact URL above, passing
that URL so it updates in place rather than creating a second canvas.

`render.js` is a stand-in for the canvas runtime — enough to screenshot a
screen locally (`python3 -m http.server` in `render/`, then any headless
browser). It is not the real renderer; the artifact is the source of truth.

Two things `rebuild.py` must keep doing, because getting either wrong corrupts
the artifact silently: every `<` inside the embedded JSON stays escaped as
`<` (a literal `</script>` would end the script block early), and the JSON
sits on its own line between the script tags.
