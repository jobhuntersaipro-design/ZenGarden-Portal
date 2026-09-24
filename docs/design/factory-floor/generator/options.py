import json
from helpers import *

TAIL2 = TAIL
def railvb(s, frac):
    b = s.bounds; m = 30
    w = b[2] - b[0] + 2 * m; h = b[3] - b[1] + 2 * m
    return (b[0] - m, b[1] - m - 20, w / (1 - frac), h + 20)
def late_span(l):
    return f'<span style="color: #ff7a70; font-size: 13px">{l} late</span>' if l else ''
def sub_div(sub, c):
    return f'<div style="font-size: 12.5px; color: {c}; margin-top: 2px">{sub}</div>' if sub else ''

# ---------------------------------------------------------------- A: control room
use_theme("dark")
s = build("target", animate=True)
kpi = lambda v, l, c="#eef0f7": (f'<div style="display: flex; flex-direction: column; gap: 2px; padding: 0 24px; border-left: 1px solid #2c3456">'
                                 f'<span style="font-family: Plus Jakarta Sans, sans-serif; font-size: 34px; font-weight: 700; color: {c}; font-variant-numeric: tabular-nums">{v}</span>'
                                 f'<span style="font-size: 13px; color: #a4abc4">{l}</span></div>')
events = ["PO-2026-0027 · Tanjung Electrical moved to In warehouse", "Truck 2 left the dock with 2 orders",
          "PO-2026-0039 · Meridian Chemicals is 6 days past its date", "Line 2 is idle", "PO-2026-0025 started on Line 1",
          "8 orders passed QC today"]
tick = "".join(f'<span style="display: inline-flex; align-items: center; gap: 10px; padding: 0 28px"><span style="width: 6px; height: 6px; border-radius: 3px; background: #7d86a6"></span>{e}</span>' for e in events)
leg_rows = "".join(
    f'<li style="display: flex; align-items: center; gap: 12px; font-size: 15px"><span style="width: 12px; height: 12px; border-radius: 6px; background: {c}; box-shadow: 0 0 10px {c}"></span><span style="flex-grow: 1; color: #d6dbea">{n}</span>'
    f'{late_span(l)}<span style="font-weight: 700; min-width: 22px; text-align: right; color: #eef0f7">{v}</span></li>'
    for n, c, v, l in [("Order placed", DARK_STAGE["placed"], 5, 0), ("In production", DARK_STAGE["prod"], 4, 1), ("QC passed", DARK_STAGE["qc"], 8, 0),
                       ("In warehouse", DARK_STAGE["wh"], 4, 1), ("Delivering", DARK_STAGE["del"], 5, 2)])
css_a = s.keyframes() + "@keyframes live{0%,100%{opacity:1}50%{opacity:.3}}@keyframes marquee{from{transform:translate(0px,0px)}to{transform:translate(-50%,0px)}}"
A = (HEAD.format(title="Factory Floor — control room", css=css_a) +
     '<div style="width: 1920px; height: 1080px; position: relative; display: flex; flex-direction: column; background: #0b0e1a; color: #eef0f7; overflow: hidden">'
     '<header style="height: 112px; flex-shrink: 0; display: flex; align-items: center; padding: 0 40px; gap: 24px; border-bottom: 1px solid #1f2540">'
     '<div style="flex-grow: 1"><div style="display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 700; letter-spacing: 0.12em; color: #34e0a1">'
     '<span style="width: 10px; height: 10px; border-radius: 5px; background: #34e0a1; box-shadow: 0 0 12px #34e0a1; animation: live 1.6s ease-in-out infinite"></span>LIVE</div>'
     '<h1 style="margin: 6px 0 0; font-family: Plus Jakarta Sans, sans-serif; font-size: 34px; font-weight: 700; letter-spacing: -0.02em">Zen Garden · Factory Floor</h1></div>'
     + kpi("26", "orders in hand") + kpi("4", "past their date", "#ff7a70") + kpi("4 / 7", "lines running", "#4ea3ff") + kpi("8", "passed QC, waiting to pack", "#34e0a1")
     + '<div style="padding-left: 32px; border-left: 1px solid #2c3456; text-align: right"><div style="font-family: Plus Jakarta Sans, sans-serif; font-size: 34px; font-weight: 700; font-variant-numeric: tabular-nums">[14:32]</div><div style="font-size: 13px; color: #a4abc4">Wed 24 Sep</div></div></header>'
     f'<section aria-label="Factory floor" style="position: relative; flex-grow: 1; min-height: 0">{s.render()}'
     f'<div style="position: absolute; left: 40px; bottom: 32px; width: 280px; padding: 20px; box-sizing: border-box; background: rgb(23 28 48 / 0.88); border: 1px solid #2c3456; border-radius: 14px; display: flex; flex-direction: column; gap: 14px">'
     f'<div style="font-size: 12px; font-weight: 700; letter-spacing: 0.1em; color: #a4abc4">BY STAGE</div><ul style="list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 11px">{leg_rows}</ul></div></section>'
     f'<footer style="height: 56px; flex-shrink: 0; display: flex; align-items: center; border-top: 1px solid #1f2540; background: #0f1324; overflow: hidden">'
     f'<div style="flex-shrink: 0; height: 100%; display: flex; align-items: center; padding: 0 24px; background: #171c30; font-size: 12px; font-weight: 700; letter-spacing: 0.1em; color: #a4abc4">JUST NOW</div>'
     f'<div style="flex-grow: 1; overflow: hidden"><div style="display: inline-flex; white-space: nowrap; font-size: 15px; color: #d6dbea; animation: marquee 40s linear infinite">{tick}{tick}</div></div></footer></div>'
     + TAIL.format(w=1920, h=1080))
write("OptionControlRoom.dc.html", A)

# ---------------------------------------------------------------- B: bottleneck towers
use_theme("light")
s = build("target", animate=False, tokens=False, labels=False)
s.animate = True
s.layer2 = True
TW = [("1", "Raw material", 1.3, 7.0, 5, 0, STAGE["placed"], True), ("2", "Packaging", 7.9, 1.2, None, 0, None, False),
      ("3", "Labelling", 7.9, 6.9, None, 0, None, False), ("4", "Base mixing", 7.9, 12.9, None, 0, None, False),
      ("5", "Production lines", 19.3, 7.0, 4, 1, STAGE["prod"], True), ("6", "Packing & QC", 30.6, 6.4, 8, 0, STAGE["qc"], True),
      ("7", "Warehouse", 37.6, 5.0, 4, 1, STAGE["wh"], True), ("8", "Out for delivery", 38.2, 13.9, 5, 2, STAGE["del"], True)]
UNIT = 0.62
for i, (num, name, x, y, n, late, c, tracked) in enumerate(TW):
    fw = 2.6
    if not tracked:
        s.layer2 = False
        s.pad(x, y, fw, fw, "#ffffff", op=0.9, dash=True, key=-30)
        s.layer2 = True
        ax_, ay_ = P(x + fw / 2, y + fw / 2, 0.2)
        s.over.append(f'<text x="{ax_:.1f}" y="{ay_ + 4:.1f}" text-anchor="middle" font-size="11" fill="#646464" font-family="Inter, sans-serif">not tracked</text>')
        continue
    h = n * UNIT
    ox, oy = P(x + fw / 2, y + fw, 0)
    grow = f"animation: grow 1.4s cubic-bezier(.2,.8,.2,1) {0.15 * i:.2f}s both; transform-origin: {ox:.1f}px {oy:.1f}px"
    s.anim = grow
    s.box(x, y, 0, fw, fw, (n - late) * UNIT, c, key=x * AY + y * BY)
    if late:
        s.box(x, y, (n - late) * UNIT, fw, fw, late * UNIT, "#f0382d", key=x * AY + y * BY + 0.001)
    s.anim = None
    tx, ty = P(x + fw / 2, y + fw / 2, h)
    big = "#c42a20" if name == "Packing & QC" else "#292d34"
    s.over.append(f'<g style="animation: fadein 0.6s ease-out {0.15 * i + 1.0:.2f}s both"><text x="{tx:.1f}" y="{ty - 16:.1f}" text-anchor="middle" font-size="34" font-weight="700" fill="{big}" font-family="Plus Jakarta Sans, sans-serif">{n}</text>'
                  f'<text x="{tx:.1f}" y="{ty - 52:.1f}" text-anchor="middle" font-size="14" font-weight="600" fill="#646464" font-family="Inter, sans-serif">{num} · {name}</text></g>')
# bottleneck pulse under Packing & QC
q = [P(30.3, 6.1, 0), P(33.5, 6.1, 0), P(33.5, 9.3, 0), P(30.3, 9.3, 0)]
s.layer2 = False
s.add(-29, f'<polygon points="{pts(q)}" fill="none" stroke="#f0382d" stroke-width="3" style="animation: pulse 1.6s ease-in-out infinite"></polygon>')
# order particles flowing along the route
route = [(4.5, 8.3, 0.1), (12.8, 8.3, 0.1), (28.4, 8.3, 0.1), (34.6, 7.6, 0.1), (36.8, 6.3, 0.1), (38.9, 12.0, 0.1)]
s.line([(a, b, 0) for a, b, _ in route], color="#b4b4b4", w=1.4, dash="2 6", arrow=False, key=-35)
for k in range(10):
    s.mover("part", route, 9, -k * 0.9, lambda x, y, z: s.add(-34, f'<circle cx="{P(x, y, z)[0]:.1f}" cy="{P(x, y, z)[1]:.1f}" r="4" fill="#292d34" opacity="0.55"></circle>'))
s.kf("grow", "from{transform:scale(1,0)}to{transform:scale(1,1)}")
s.kf("fadein", "from{opacity:0}to{opacity:1}")
s.kf("pulse", "0%,100%{stroke-opacity:.9}50%{stroke-opacity:.15}")
rank = [("6", "Packing & QC", 8, 0, STAGE["qc"]), ("1", "Raw material", 5, 0, STAGE["placed"]), ("8", "Out for delivery", 5, 2, STAGE["del"]),
        ("5", "Production lines", 4, 1, STAGE["prod"]), ("7", "Warehouse", 4, 1, STAGE["wh"])]
rr = ""
for num, name, n, late, c in rank:
    lt_ = f'<span style="color: #c42a20">{late} late</span>' if late else '<span style="color: #6f6f6f">on time</span>'
    rr += (f'<li style="display: flex; flex-direction: column; gap: 6px; padding: 12px 0; border-top: 1px solid #e8e8e8">'
           f'<div style="display: flex; align-items: baseline; gap: 8px; font-size: 14px"><span style="color: #6f6f6f">{num}</span><span style="flex-grow: 1; font-weight: 600">{name}</span>{lt_}<span style="font-family: Plus Jakarta Sans, sans-serif; font-weight: 700; font-size: 18px; min-width: 20px; text-align: right">{n}</span></div>'
           f'<div style="height: 8px; border-radius: 4px; background: #e9ebf0; display: flex; overflow: hidden"><span style="width: {(n - late) * 12}%; background: {c}"></span><span style="width: {late * 12}%; background: #f0382d"></span></div></li>')
rail = (f'<aside aria-label="Where orders are piling up" style="position: absolute; top: 16px; right: 16px; bottom: 16px; width: 340px; box-sizing: border-box; padding: 24px; background: #ffffff; border: 1px solid #e8e8e8; border-radius: 14px; box-shadow: 0 10px 25px rgb(18 43 165 / 0.1); display: flex; flex-direction: column; gap: 16px">'
        f'<div><div style="font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #6f6f6f">Biggest queue</div>'
        f'<h2 style="margin: 6px 0 0; font-family: Plus Jakarta Sans, sans-serif; font-size: 24px; font-weight: 700">Packing &amp; QC</h2>'
        f'<p style="margin: 6px 0 0; font-size: 14px; color: #646464; line-height: 1.5">8 orders have passed QC and are waiting to be packed. That is more than any other step.</p></div>'
        f'<ul style="list-style: none; margin: 0; padding: 0">{rr}</ul>'
        f'<p style="margin: 0; font-size: 12.5px; color: #6f6f6f; line-height: 1.5">Packaging, labelling and base mixing have no tower yet because the portal does not record them.</p>'
        f'<a href="#" style="margin-top: auto; height: 44px; border-radius: 20px; background: #292d34; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; text-decoration: none">See the 8 orders</a></aside>')
seg_note = '<div style="position: absolute; left: 16px; top: 16px; padding: 8px 14px; border-radius: 20px; background: #ffffff; border: 1px solid #e8e8e8; font-size: 13px; color: #646464">Tower height = orders in that step · red cap = past their date</div>'
write("OptionTowers.dc.html", page("Factory Floor — where orders pile up", s.render(vb=railvb(s, 0.33), base_op=0.35), seg_note + rail + camera(right=372),
                                   "Each step rises by how many orders are sitting in it.", timeline(), css=s.keyframes()))

# ---------------------------------------------------------------- C: follow one order
s = build("target", animate=True, tokens=False, labels=False)
gy = LINES_Y[3] + 0.5
stops = [(2.5, 9.0, 0.3), (8.7, 3.2, 0.3), (8.6, 8.9, 0.3), (9.2, 11.2, 0.3), (13.2, gy, 1.0), (21.0, gy, 1.0)]
todo = [(21.0, gy, 1.0), (28.0, gy, 1.0), (31.2, 6.4, 0.3), (38.8, 6.8, 0.3), (38.4, 13.2, 0.3)]
dpath = "M" + " L".join(f"{P(*p)[0]:.1f},{P(*p)[1]:.1f}" for p in stops)
tpath = "M" + " L".join(f"{P(*p)[0]:.1f},{P(*p)[1]:.1f}" for p in todo)
s.over.append(f'<path d="{dpath}" fill="none" stroke="#7612fa" stroke-width="10" stroke-opacity="0.18" stroke-linecap="round" stroke-linejoin="round"></path>'
              f'<path d="{dpath}" fill="none" stroke="#7612fa" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"></path>'
              f'<path d="{tpath}" fill="none" stroke="#7612fa" stroke-width="2.5" stroke-dasharray="3 7" stroke-linecap="round" stroke-opacity="0.6" style="animation: dash 1.1s linear infinite"></path>')
s.kf("dash", "to{stroke-dashoffset:-20}")
# comet running along the finished part
s.layer2 = True
s.mover("comet", stops, 4.5, 0, lambda x, y, z: s.add(99, f'<circle cx="{P(x, y, z)[0]:.1f}" cy="{P(x, y, z)[1]:.1f}" r="6" fill="#ffffff" stroke="#7612fa" stroke-width="3"></circle>'))
s.layer2 = False
marks = [((2.5, 9.0, 0.3), "1", "done"), ((8.7, 3.2, 0.3), "2", "done"), ((8.6, 8.9, 0.3), "3", "done"), ((9.2, 11.2, 0.3), "4", "done"),
         ((21.0, gy, 1.0), "5", "now"), ((31.2, 6.4, 0.3), "6", "next"), ((38.8, 6.8, 0.3), "7", "next"), ((38.4, 13.2, 0.3), "8", "next")]
for p, n, st in marks:
    x, y = P(*p)
    if st == "now":
        s.over.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="16" fill="#2a78d6" opacity="0.25" style="animation: nowpulse 1.6s ease-out infinite; transform-origin: {x:.1f}px {y:.1f}px"></circle>'
                      f'<circle cx="{x:.1f}" cy="{y:.1f}" r="15" fill="#2a78d6" stroke="#ffffff" stroke-width="3"></circle><circle cx="{x:.1f}" cy="{y:.1f}" r="19" fill="none" stroke="#f0382d" stroke-width="2.5"></circle>'
                      f'<text x="{x:.1f}" y="{y + 5:.1f}" text-anchor="middle" font-size="14" font-weight="700" fill="#ffffff" font-family="Inter, sans-serif">{n}</text>')
    else:
        fill = "#7612fa" if st == "done" else "#ffffff"; tc = "#ffffff" if st == "done" else "#646464"
        s.over.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="12" fill="{fill}" stroke="{"#ffffff" if st == "done" else "#b4b4b4"}" stroke-width="2.5"></circle>'
                      f'<text x="{x:.1f}" y="{y + 4:.1f}" text-anchor="middle" font-size="12" font-weight="700" fill="{tc}" font-family="Inter, sans-serif">{n}</text>')
s.kf("nowpulse", "from{transform:scale(1);opacity:.5}to{transform:scale(2.4);opacity:0}")
steps = [("Raw material", "Order placed · [date]", "done"), ("Packaging", "[time]", "done"), ("Labelling", "[time]", "done"),
         ("Base mixing", "[time]", "done"), ("Production · Line 4", "Labelling now · 6 days past its date", "now"),
         ("Packing &amp; QC", "Next", "next"), ("Warehouse", "", "next"), ("Out for delivery", "Expected 12 Sep", "next")]
li = ""
for i, (n, sub, st) in enumerate(steps):
    dot = {"done": "background: #7612fa; border: 2px solid #7612fa", "now": "background: #ffffff; border: 4px solid #2a78d6", "next": "background: #ffffff; border: 2px solid #d9d9d9"}[st]
    bar = '' if i == len(steps) - 1 else f'<span style="position: absolute; left: 7px; top: 20px; bottom: -6px; width: 2px; background: {"#7612fa" if st == "done" else "#e8e8e8"}"></span>'
    subc = "#c42a20" if st == "now" else "#646464"
    li += (f'<li style="position: relative; display: flex; gap: 14px; padding-bottom: 14px">{bar}<span style="width: 16px; height: 16px; border-radius: 8px; box-sizing: border-box; flex-shrink: 0; margin-top: 2px; {dot}"></span>'
           f'<div><div style="font-size: 14px; font-weight: {700 if st == "now" else 500}; color: {"#6f6f6f" if st == "next" else "#292d34"}">{n}</div>'
           f'{sub_div(sub, subc)}</div></li>')
rail = (f'<aside aria-label="Following one order" style="position: absolute; top: 16px; right: 16px; bottom: 16px; width: 360px; box-sizing: border-box; padding: 24px; background: #ffffff; border: 1px solid #e8e8e8; border-radius: 14px; box-shadow: 0 20px 60px rgb(18 43 165 / 0.12); display: flex; flex-direction: column; gap: 18px">'
        f'<div style="display: flex; align-items: flex-start; gap: 12px"><div style="flex-grow: 1"><div style="font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #6f6f6f">Following</div>'
        f'<h2 style="margin: 4px 0 0; font-family: Plus Jakarta Sans, sans-serif; font-size: 20px; font-weight: 700">PO number <span style="white-space: nowrap">PO-2026-0039</span></h2>'
        f'<div style="font-size: 13px; color: #646464; margin-top: 4px">Meridian Chemicals · MR.KING 1.5L — Lemon · 27 cartons</div></div>'
        f'<button type="button" aria-label="Stop following" style="width: 44px; height: 44px; flex-shrink: 0; border: 0; border-radius: 22px; background: #f8f9fa; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #292d34">{icon("x")}</button></div>'
        f'<div style="display: flex; gap: 8px"><span style="padding: 4px 10px; border-radius: 20px; background: #e0f2ff; color: #007bd9; font-size: 12px; font-weight: 600">Step 5 of 8</span><span style="padding: 4px 10px; border-radius: 20px; background: #fde7e6; color: #c42a20; font-size: 12px; font-weight: 600">6 days late</span></div>'
        f'<ol style="list-style: none; margin: 0; padding: 0">{li}</ol>'
        f'<div style="margin-top: auto; display: flex; gap: 8px"><a href="#" style="flex-grow: 1; height: 44px; border-radius: 20px; border: 1px solid #d9d9d9; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; text-decoration: none; color: #292d34">Open the order</a>'
        f'<a href="#" style="flex-grow: 1; height: 44px; border-radius: 20px; background: #292d34; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; text-decoration: none">Copy link to this view</a></div></aside>')
note = '<div style="position: absolute; left: 16px; top: 16px; padding: 8px 14px; border-radius: 20px; background: #ffffff; border: 1px solid #e8e8e8; font-size: 13px; color: #646464">Everything else fades back · the camera follows the carton</div>'
write("OptionFollow.dc.html", page("Factory Floor — follow an order", s.render(vb=railvb(s, 0.34), base_op=0.32), note + rail + camera(right=392),
                                   "Track one order through every step of the factory.", timeline(), css=s.keyframes(), follow="Stop following"))

canvas = {"v": 3, "createdOnFiles": {"v": 1, "at": "2026-09-24T09:00:00Z"}, "title": "Factory Floor 3D", "launch": {"view": "canvas"}, "pages": [],
          "boards": {"Main.dc.html": {"x": 0, "y": 0, "w": 1440, "h": 960, "title": "1 · Overview — every step tracked"},
                     "LineFocus.dc.html": {"x": 1520, "y": 0, "w": 1440, "h": 960, "title": "2 · Clicked into Line 4"},
                     "TodaysData.dc.html": {"x": 0, "y": 1080, "w": 1440, "h": 960, "title": "3 · With the data the portal has today"},
                     "Phone.dc.html": {"x": 1520, "y": 1080, "w": 390, "h": 844, "title": "4 · Phone"},
                     "OptionControlRoom.dc.html": {"x": 0, "y": 2500, "w": 1920, "h": 1080, "title": "Option A · Control room TV"},
                     "OptionTowers.dc.html": {"x": 2000, "y": 2500, "w": 1440, "h": 960, "title": "Option B · Where orders pile up"},
                     "OptionFollow.dc.html": {"x": 3520, "y": 2500, "w": 1440, "h": 960, "title": "Option C · Follow one order"}},
          "order": ["Main.dc.html", "LineFocus.dc.html", "TodaysData.dc.html", "Phone.dc.html", "OptionControlRoom.dc.html", "OptionTowers.dc.html", "OptionFollow.dc.html"],
          "notes": {"optionsTitle": {"x": 0, "y": 2220, "text": "Three more directions", "kind": "title1", "maxW": 4960}},
          "designSystems": []}
json.dump(canvas, open(os.path.join(OUT, "canvas.json"), "w"), indent=1)
print("ok")
