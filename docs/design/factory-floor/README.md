# Factory Floor — design canvas

A proposed page that draws the whole factory in 3D, built with three.js,
and puts every open order where it stands in the factory. **Design only: nothing is built
in the app yet.** Published at
https://claude.ai/artifact/E5tzbtYHo3R1xfjVcTSwCS (private until shared).

The flow, left to right: raw material → packaging → labelling → base mixing →
7 production lines → packing & QC → warehouse → out for delivery.

| Artboard | What it shows |
|---|---|
| `Main` | Overview with every step tracked: order dots in stage colours, a red ring for past-due orders, a hover card, a 30-day replay strip, and a message when an order moves |
| `LineFocus` | Clicked into Line 4: the camera zooms in, the other lines fade, and a side panel shows the order on the line and the queue |
| `TodaysData` | The same floor built only from the 6 stages the portal records today |
| `Phone` | 390px: the floor on top, the 8 steps as a list below |
| `OptionControlRoom` | Option A: a dark 1920×1080 screen for a TV on the factory floor, with big figures and a scrolling event strip |
| `OptionTowers` | Option B: each step becomes a tower as tall as its queue, with red caps for late orders and the biggest queue highlighted |
| `OptionFollow` | Option C: one order's route through all 8 steps, with everything else faded |

Every artboard is animated with CSS: belts, carts, a forklift, trucks, and dots
that float and pulse. The animation stops under `prefers-reduced-motion`.
`previews/*.png` are still frames.

## The open decision

The portal records six `PoStage` values. It does **not** record:

- **Packaging, labelling or base mixing** for an order.
- **Which of the 7 lines** an order is on, or where it is along that line.

Anything in `[brackets]` on the canvas stands in for one of these.
`TodaysData` and Option B can be built from today's data. `Main`, `LineFocus`
and Option C need new fields, plus someone on the floor recording each step.

## Regenerating

The artboards are generated. Edit `generator/`, then run:

```bash
cd docs/design/factory-floor/generator
python3 sections.py   # Main, LineFocus, TodaysData, Phone
python3 options.py    # the three options and canvas.json
```

Both scripts write to `artboards/`. `engine.py` holds the isometric
projection, box, cylinder, order-dot and mover primitives. `build.py` lays out
the floor.
