from helpers import *

TOAST_CSS="@keyframes toast{0%,52%{opacity:0;transform:translate(-50%,-12px)}58%,90%{opacity:1;transform:translate(-50%,0px)}96%,100%{opacity:0;transform:translate(-50%,-12px)}}"
TOAST=('<div role="status" style="position: absolute; top: 16px; left: 50%; display: flex; align-items: center; gap: 10px; padding: 10px 16px; background: #292d34; color: #ffffff; border-radius: 20px; font-size: 13px; box-shadow: 0 10px 25px rgb(18 43 165 / 0.18); white-space: nowrap; animation: toast 10s linear infinite">'
       '<span style="width: 10px; height: 10px; border-radius: 5px; background: #eda100"></span><strong style="font-weight: 600">PO-2026-0027</strong> moved to In warehouse · just now</div>')
# ---- Main
s=build("target", animate=True)
hover=('<div style="position: absolute; right: 88px; top: 16px; width: 280px; box-sizing: border-box; padding: 16px; background: #ffffff; border: 1px solid #e8e8e8; border-radius: 14px; box-shadow: 0 10px 25px rgb(18 43 165 / 0.1); display: flex; flex-direction: column; gap: 10px">'
       '<div style="display: flex; align-items: center; gap: 8px"><span style="width: 10px; height: 10px; border-radius: 5px; background: #eda100"></span><span style="font-size: 12px; color: #646464">Hovering</span></div>'
       '<div style="font-family: Plus Jakarta Sans, sans-serif; font-size: 18px; font-weight: 700">7 · Warehouse</div>'
       '<div style="font-size: 13px; color: #646464; line-height: 1.5">4 orders stored, waiting for a truck. Click to zoom in and list them.</div>'
       '<ul style="list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 13px">'
       '<li style="display: flex; justify-content: space-between"><span>Sunway Packaging</span><span style="color: #d32b21">6 days late</span></li>'
       '<li style="display: flex; justify-content: space-between"><span>Meridian Chemicals</span><span style="color: #646464">due in 2 days</span></li>'
       '<li style="display: flex; justify-content: space-between; color: #646464"><span>+ 2 more</span><span></span></li></ul></div>')
write("Main.dc.html", page("Factory Floor — overview", s.render(), legend()+hover+TOAST+camera(), "Every open order, standing where it is. Drag to orbit, click a zone to go in.", timeline(), css=s.keyframes()+TOAST_CSS))

# ---- Today's data
s=build("today", animate=True)
banner=('<div role="note" style="display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: #fff3e9; border-radius: 12px; font-size: 13px; color: #292d34">'
        f'<span style="color: #cd5f02; display: flex">{icon("info")}</span><span><strong>Built on the stages the portal already records.</strong> Steps 2–4 are drawn but empty, and the 4 orders in production float above the lines because nobody records which line an order is on.</span></div>')
write("TodaysData.dc.html", page("Factory Floor — today's data", s.render(), legend(True)+camera(), "Every open order, standing where it is. Drag to orbit, click a zone to go in.", timeline(), banner=banner, css=s.keyframes()))

# ---- Line focus
s=build("target", focus=3, animate=True)
# selection outline on line 4
gy=LINES_Y[3]
q=[P(13.0,gy-0.4,0),P(28.0,gy-0.4,0),P(28.0,gy+1.4,0),P(13.0,gy+1.4,0)]
sel=f'<polygon points="{pts(q)}" fill="none" stroke="#2a78d6" stroke-width="2.5" stroke-dasharray="7 5"></polygon>'
s.over.insert(0,sel)
x0,y0=P(12.2,gy-4.5,3.5); x1,y1=P(28.8,gy+4.5,0)
xa,_=P(12,gy+4.5,0); xb,_=P(29,gy-4.5,0)
vb=(xa-20,y0-110,(xb-xa)+40,(y1-y0)+170)
# simpler: explicit vb in scene units around line 4
cx,cy=P(20.5,gy+0.5,1)
vb=(cx-300,cy-210,760,440)
steps=[("Filling","done"),("Capping","done"),("Labelling","now"),("Into cartons","next")]
st=""
for i,(n,state) in enumerate(steps):
    dot = {"done":"background: #2a78d6; border: 2px solid #2a78d6","now":"background: #ffffff; border: 3px solid #2a78d6","next":"background: #ffffff; border: 2px solid #d9d9d9"}[state]
    col = "#292d34" if state!="next" else "#6f6f6f"
    extra = '<span style="margin-left: auto; font-size: 12px; color: #2a78d6; font-weight: 600">now</span>' if state=="now" else ''
    st+=f'<li style="display: flex; align-items: center; gap: 12px; font-size: 14px; color: {col}"><span style="width: 14px; height: 14px; border-radius: 7px; box-sizing: border-box; {dot}"></span>{n}{extra}</li>'
panel=(f'<aside aria-label="Line 4" style="position: absolute; top: 16px; right: 16px; bottom: 16px; width: 380px; box-sizing: border-box; padding: 24px; background: #ffffff; border: 1px solid #e8e8e8; border-radius: 14px; box-shadow: 0 20px 60px rgb(18 43 165 / 0.12); display: flex; flex-direction: column; gap: 20px; overflow: hidden">'
       f'<div style="display: flex; align-items: flex-start; gap: 12px"><div style="flex-grow: 1"><div style="font-size: 12px; color: #646464">5 · Production lines</div><h2 style="margin: 4px 0 0; font-family: Plus Jakarta Sans, sans-serif; font-size: 24px; font-weight: 700">Line 4</h2></div>'
       f'<button type="button" aria-label="Close and go back to the overview" style="width: 44px; height: 44px; border: 0; border-radius: 22px; background: #f8f9fa; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #292d34">{icon("x")}</button></div>'
       f'<div style="display: flex; gap: 8px"><span style="padding: 4px 10px; border-radius: 20px; background: #e0f2ff; color: #007bd9; font-size: 12px; font-weight: 600">Running</span><span style="padding: 4px 10px; border-radius: 20px; background: #fde7e6; color: #c42a20; font-size: 12px; font-weight: 600">Order is 6 days late</span></div>'
       f'<div style="padding: 16px; border-radius: 12px; background: #f8f9fa; display: flex; flex-direction: column; gap: 6px"><div style="font-size: 12px; color: #646464">On the line now</div>'
       f'<a href="#" style="font-weight: 600; font-size: 15px; text-decoration: none; color: #292d34">PO number PO-2026-0039</a>'
       f'<div style="font-size: 13px; color: #646464">Meridian Chemicals · MR.KING 1.5L — Lemon</div>'
       f'<div style="display: flex; gap: 24px; margin-top: 8px"><div><div style="font-family: Plus Jakarta Sans, sans-serif; font-size: 20px; font-weight: 700">[ n ] / 27</div><div style="font-size: 12px; color: #646464">cartons done</div></div><div><div style="font-family: Plus Jakarta Sans, sans-serif; font-size: 20px; font-weight: 700">12 Sep</div><div style="font-size: 12px; color: #646464">expected</div></div></div></div>'
       f'<div><div style="font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #6f6f6f; margin-bottom: 12px">Along the line</div><ul style="list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px">{st}</ul></div>'
       f'<div><div style="font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #6f6f6f; margin-bottom: 10px">Next on Line 4</div>'
       f'<ul style="list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; font-size: 14px">'
       f'<li style="display: flex; justify-content: space-between; padding: 10px 0; border-top: 1px solid #e8e8e8"><span>Tanjung Electrical</span><span style="color: #646464">PO-2026-0027</span></li>'
       f'<li style="display: flex; justify-content: space-between; padding: 10px 0; border-top: 1px solid #e8e8e8"><span>Acme Industrial Sdn Bhd</span><span style="color: #646464">[PO number]</span></li></ul></div>'
       f'<a href="#" style="margin-top: auto; height: 44px; border-radius: 20px; border: 1px solid #d9d9d9; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 14px; font-weight: 600; text-decoration: none; color: #292d34">Open the purchase order {icon("chev",16)}</a></aside>')
crumb=(f'<div style="position: absolute; top: 16px; left: 16px; display: flex; align-items: center; gap: 8px"><a href="Main.dc.html" style="height: 44px; padding: 0 16px 0 10px; border-radius: 22px; background: #ffffff; border: 1px solid #e8e8e8; display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 600; color: #292d34; text-decoration: none; box-shadow: 0 4px 12px rgb(18 43 165 / 0.08)">{icon("back",16)}Whole floor</a>'
       f'<span style="font-size: 13px; color: #646464">Other lines dimmed · camera eased in over 0.6s</span></div>')
write("LineFocus.dc.html", page("Factory Floor — Line 4", s.render(vb=vb), crumb+panel+camera(right=412), "Every open order, standing where it is. Drag to orbit, click a zone to go in.", timeline(), css=s.keyframes()))

# ---- Phone
s=build("target", animate=True)
s.over=[]
nums=[(2.5,3,2.2,"1","#4a3aa7"),(8.7,1.6,2.6,"2","#9aa3b3"),(8.6,7.7,2.1,"3","#9aa3b3"),(9.2,13.8,3.8,"4","#9aa3b3"),(20.5,3,1.8,"5","#2a78d6"),(31.5,1.9,2.2,"6","#1baf7a"),(38.5,0.9,4.6,"7","#eda100"),(38.9,14.6,3.0,"8","#e87ba4")]
for x,y,z,n,c in nums:
    a,b=P(x,y,z)
    s.over.append(f'<g><circle cx="{a:.1f}" cy="{b-30:.1f}" r="34" fill="{c}" stroke="#ffffff" stroke-width="6"></circle><text x="{a:.1f}" y="{b-18:.1f}" text-anchor="middle" font-size="34" font-weight="700" fill="#ffffff" font-family="Inter, sans-serif">{n}</text></g>')
svg=s.render()
rows=[("1","Raw material","5 waiting","#4a3aa7"),("2","Packaging","[batch]","#9aa3b3"),("3","Labelling","[batch]","#9aa3b3"),("4","Base mixing","[batch]","#9aa3b3"),("5","Production lines","4 on 4 lines","#2a78d6"),("6","Packing & QC","8","#1baf7a"),("7","Warehouse","4 · 1 late","#eda100"),("8","Out for delivery","5","#e87ba4")]
lis=""
for n,lab,v,c in rows:
    lis+=f'<li><a href="#" style="display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 0 4px; text-decoration: none; color: #292d34; border-top: 1px solid #e8e8e8"><span style="width: 24px; height: 24px; border-radius: 12px; background: {c}; color: #ffffff; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0">{n}</span><span style="flex-grow: 1; font-size: 15px">{lab}</span><span style="font-size: 14px; color: #646464">{v}</span><span style="color: #b4b4b4; display: flex">{icon("chev",16)}</span></a></li>'
tabs=""
for ic,lab,on in [("grid","Home",False),("file","Orders",False),("factory","Floor",True),("cal","Demand",False),("box","Products",False)]:
    tabs+=f'<a href="#" style="flex-grow: 1; height: 56px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; font-size: 11px; text-decoration: none; color: {"#292d34" if on else "#6f6f6f"}; font-weight: {600 if on else 400}">{icon(ic,20)}{lab}</a>'
phone=(HEAD.format(title="Factory Floor — phone", css=s.keyframes())+
 f'<div style="width: 390px; height: 844px; position: relative; display: flex; flex-direction: column; background: #f4f5f9; overflow: hidden">'
 f'<header style="height: 56px; flex-shrink: 0; display: flex; align-items: center; padding: 0 16px; gap: 12px; background: #ffffff; border-bottom: 1px solid #e8e8e8"><div style="font-family: Plus Jakarta Sans, sans-serif; font-weight: 700; font-size: 18px; flex-grow: 1">Factory Floor</div>'
 f'<button type="button" aria-label="Replay the last 30 days" style="width: 44px; height: 44px; border: 0; border-radius: 22px; background: #292d34; color: #ffffff; display: flex; align-items: center; justify-content: center">{icon("play",14)}</button></header>'
 f'<section aria-label="Factory floor" style="position: relative; height: 300px; flex-shrink: 0">{svg}'
 f'<div style="position: absolute; left: 12px; top: 12px; padding: 6px 12px; border-radius: 20px; background: #ffffff; font-size: 12px; font-weight: 600; box-shadow: 0 4px 12px rgb(18 43 165 / 0.08)">26 orders in hand</div>'
 f'<div style="position: absolute; left: 12px; bottom: 10px; font-size: 11.5px; color: #646464">Pinch to zoom · drag to orbit</div></section>'
 f'<div style="flex-grow: 1; min-height: 0; background: #ffffff; border-radius: 20px 20px 0 0; box-shadow: 0 -10px 25px rgb(18 43 165 / 0.08); padding: 10px 16px 0; display: flex; flex-direction: column">'
 f'<div style="width: 40px; height: 4px; border-radius: 2px; background: #d9d9d9; align-self: center; margin-bottom: 10px"></div>'
 f'<div style="font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #6f6f6f; margin-bottom: 4px">Tap a step to fly there</div>'
 f'<ul style="list-style: none; margin: 0; padding: 0; overflow: hidden">{lis}</ul></div>'
 f'<nav aria-label="Portal" style="height: 56px; flex-shrink: 0; display: flex; background: #ffffff; border-top: 1px solid #e8e8e8">{tabs}</nav></div>'
 + TAIL.format(w=390,h=844))
write("Phone.dc.html", phone)

