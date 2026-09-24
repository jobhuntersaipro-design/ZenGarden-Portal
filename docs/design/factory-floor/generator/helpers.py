import os
from build import *
OUT=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),'artboards')
HEAD='''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;family=Plus+Jakarta+Sans:wght@600;700&amp;display=swap" rel="stylesheet">
<style>
body{{margin:0;font-family:Inter,sans-serif;background:#ffffff;color:#292d34}}
a{{color:#7b68ee}}a:hover{{color:#6647f0}}
{css}
@media (prefers-reduced-motion: reduce){{*{{animation:none !important}}}}
</style>
</helmet>
'''
TAIL='''</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":{w},"height":{h}}}}}'>
class Component extends DCLogic {{
renderVals() {{ return {{}}; }}
}}
</script>
</body>
</html>
'''

def icon(name,size=18,color="currentColor"):
    paths={
     "grid":'<rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="3" width="7" height="7" rx="1.5"></rect><rect x="3" y="14" width="7" height="7" rx="1.5"></rect><rect x="14" y="14" width="7" height="7" rx="1.5"></rect>',
     "file":'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path><path d="M14 3v5h5"></path>',
     "cal":'<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M3 10h18M8 3v4M16 3v4"></path>',
     "factory":'<path d="M3 21V10l6 4V10l6 4V6l6 3v12z"></path><path d="M7 18h2M12 18h2M17 18h2"></path>',
     "users":'<circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"></path><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.9.7 3.2 2.4 3.6 5.2"></path>',
     "box":'<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"></path><path d="M3 7.5 12 12l9-4.5M12 12v9"></path>',
     "boxes":'<rect x="3" y="12" width="8" height="8" rx="1"></rect><rect x="13" y="12" width="8" height="8" rx="1"></rect><rect x="8" y="3" width="8" height="8" rx="1"></rect>',
     "play":'<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"></path>',
     "plus":'<path d="M12 5v14M5 12h14"></path>',
     "minus":'<path d="M5 12h14"></path>',
     "home":'<path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z"></path>',
     "rotate":'<path d="M20 12a8 8 0 1 1-2.3-5.6"></path><path d="M20 4v4h-4"></path>',
     "target":'<circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="3"></circle>',
     "search":'<circle cx="11" cy="11" r="6.5"></circle><path d="m20 20-4.2-4.2"></path>',
     "x":'<path d="M6 6l12 12M18 6 6 18"></path>',
     "chev":'<path d="m9 6 6 6-6 6"></path>',
     "back":'<path d="m15 6-6 6 6 6"></path>',
     "info":'<circle cx="12" cy="12" r="9"></circle><path d="M12 11v5M12 8h.01"></path>',
    }
    return f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{paths[name]}</svg>'

NAV=[("grid","Dashboard"),("file","Purchase Orders"),("cal","Demand Board"),("factory","Factory Floor"),("users","Buyers"),("box","Products"),("boxes","Stock")]
def sidebar():
    rows=""
    for ic,lab in NAV:
        act = lab=="Factory Floor"
        st = "background: #ffffff; box-shadow: 0 4px 12px rgb(18 43 165 / 0.08); color: #292d34; font-weight: 600" if act else "color: #646464"
        new = '<span style="margin-left: auto; font-size: 10.5px; font-weight: 700; letter-spacing: 0.04em; padding: 2px 7px; border-radius: 20px; background: #292d34; color: #ffffff">NEW</span>' if act else ''
        rows+=f'<a href="#" style="display: flex; align-items: center; gap: 12px; height: 40px; padding: 0 12px; border-radius: 9px; font-size: 14px; text-decoration: none; {st}">{icon(ic)}<span>{lab}</span>{new}</a>'
    return (f'<nav aria-label="Portal" style="width: 240px; flex-shrink: 0; box-sizing: border-box; padding: 24px 16px; background: #f8f9fa; border-right: 1px solid #e8e8e8; display: flex; flex-direction: column; gap: 4px">'
            f'<div style="font-family: Plus Jakarta Sans, sans-serif; font-weight: 700; font-size: 22px; padding: 0 12px 20px"><span style="background: linear-gradient(263deg,#fa12e3 -35%,#7612fa 41%,#12d0fa 135%); -webkit-background-clip: text; background-clip: text; color: transparent">Zen</span> Garden</div>{rows}'
            f'<div style="margin-top: auto; display: flex; align-items: center; gap: 10px; padding: 12px"><div style="width: 32px; height: 32px; border-radius: 16px; background: #6647f0; color: #ffffff; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center">AR</div><div style="font-size: 13px; line-height: 1.3"><div style="font-weight: 600">Aisha Rahman</div><div style="color: #6f6f6f">Super admin</div></div></div></nav>')

def legend(today=False, compact=False):
    rows=[("Order placed","#4a3aa7",5,0),("In production","#2a78d6",4,1),("QC passed","#1baf7a",8,0),("In warehouse","#eda100",4,1),("Delivering","#e87ba4",5,2)]
    r=""
    for n,c,v,l in rows:
        late = f'<span style="color: #d32b21; font-size: 12px">{l} late</span>' if l else ''
        r+=f'<li style="display: flex; align-items: center; gap: 10px; font-size: 13px"><span style="width: 12px; height: 12px; border-radius: 6px; background: {c}; flex-shrink: 0"></span><span style="flex-grow: 1">{n}</span>{late}<span style="font-weight: 600; font-variant-numeric: tabular-nums; min-width: 16px; text-align: right">{v}</span></li>'
    return (f'<div style="position: absolute; bottom: 16px; left: 16px; width: 240px; box-sizing: border-box; padding: 16px; background: #ffffff; border: 1px solid #e8e8e8; border-radius: 14px; box-shadow: 0 10px 25px rgb(18 43 165 / 0.1); display: flex; flex-direction: column; gap: 12px">'
            f'<div><div style="font-family: Plus Jakarta Sans, sans-serif; font-size: 20px; font-weight: 700">26 orders in hand</div><div style="font-size: 12px; color: #646464; margin-top: 2px">Each dot is one open order</div></div>'
            f'<ul style="list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 9px">{r}</ul>'
            f'<div style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #646464; padding-top: 10px; border-top: 1px solid #e8e8e8"><span style="width: 12px; height: 12px; border-radius: 6px; border: 2px solid #f0382d; box-sizing: border-box"></span>Red ring: past its expected date</div></div>')

def camera(bottom=16, right=16):
    b=lambda ic,lab: f'<button type="button" aria-label="{lab}" style="width: 44px; height: 44px; border: 0; background: transparent; border-radius: 9px; display: flex; align-items: center; justify-content: center; color: #292d34; cursor: pointer">{icon(ic)}</button>'
    return (f'<div style="position: absolute; right: {right}px; bottom: {bottom}px; display: flex; flex-direction: column; padding: 4px; background: #ffffff; border: 1px solid #e8e8e8; border-radius: 12px; box-shadow: 0 4px 12px rgb(18 43 165 / 0.08)">'
            +b("plus","Zoom in")+b("minus","Zoom out")+b("rotate","Rotate view")+b("home","Back to overview")+'</div>')

def timeline(active_day=29):
    ticks=""
    for i in range(30):
        h=[3,6,6,8,11,11,11,13,13,15,17,19,19,19,22,23,24,25,26,24,22,24,24,25,24,26,26,26,28,26][i]
        c="#292d34" if i==active_day else "#d9d9d9"
        ticks+=f'<span style="flex-grow: 1; height: {h*1.1+4:.0f}px; background: {c}; border-radius: 2px"></span>'
    return (f'<div style="display: flex; align-items: center; gap: 16px; padding: 12px 16px; background: #ffffff; border: 1px solid #e8e8e8; border-radius: 14px">'
            f'<button type="button" aria-label="Replay the last 30 days" style="width: 44px; height: 44px; flex-shrink: 0; border: 0; border-radius: 22px; background: #292d34; color: #ffffff; display: flex; align-items: center; justify-content: center; cursor: pointer">{icon("play",16)}</button>'
            f'<div style="flex-shrink: 0; width: 150px"><div style="font-size: 13px; font-weight: 600">Today, 24 Sep</div><div style="font-size: 12px; color: #646464">Drag to replay any day</div></div>'
            f'<div style="flex-grow: 1; display: flex; align-items: flex-end; gap: 3px; height: 40px">{ticks}</div>'
            f'<div style="flex-shrink: 0; font-size: 12px; color: #646464; width: 56px; text-align: right">30 days</div></div>')

def header(sub, extra="", follow="Follow an order"):
    seg=lambda lab,on: f'<button type="button" aria-pressed="{"true" if on else "false"}" style="height: 36px; padding: 0 16px; border: 0; border-radius: 20px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; {"background: #ffffff; color: #292d34; box-shadow: 0 4px 12px rgb(18 43 165 / 0.08)" if on else "background: transparent; color: #646464"}">{lab}</button>'
    return (f'<header style="display: flex; align-items: flex-end; gap: 16px">'
            f'<div style="flex-grow: 1"><div style="font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #6f6f6f">Operations</div>'
            f'<h1 style="margin: 4px 0 0; font-family: Plus Jakarta Sans, sans-serif; font-size: 32px; font-weight: 700; letter-spacing: -0.02em">Factory Floor</h1>'
            f'<p style="margin: 4px 0 0; font-size: 14px; color: #646464">{sub}</p></div>{extra}'
            f'<div role="group" aria-label="View" style="display: flex; padding: 4px; background: #e9ebf0; border-radius: 22px">{seg("Live",True)}{seg("Replay",False)}</div>'
            f'<label style="display: flex; align-items: center; gap: 8px; height: 44px; width: 230px; flex-shrink: 0; box-sizing: border-box; padding: 0 14px; border: 1px solid #d9d9d9; border-radius: 20px; color: #6f6f6f; font-size: 14px">{icon("search",16)}<input type="text" placeholder="Find an order, buyer or product" style="border: 0; outline: none; font: inherit; flex-grow: 1; min-width: 0; background: transparent"></label>'
            f'<button type="button" style="height: 44px; padding: 0 20px; border: 0; border-radius: 20px; background: #292d34; color: #ffffff; font: inherit; font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 8px; white-space: nowrap; flex-shrink: 0; cursor: pointer">{icon("target",16)}{follow}</button></header>')

def page(title, svg, overlays, sub, below, w=1440, h=960, banner="", css="", follow="Follow an order"):
    return (HEAD.format(title=title, css=css)+
        f'<div style="width: {w}px; height: {h}px; display: flex; background: #ffffff; overflow: hidden">{sidebar()}'
        f'<main style="flex-grow: 1; min-width: 0; box-sizing: border-box; padding: 28px 32px; display: flex; flex-direction: column; gap: 16px">{header(sub, follow=follow)}{banner}'
        f'<section aria-label="Factory floor" style="position: relative; flex-grow: 1; min-height: 0; flex-basis: 0; border-radius: 14px; border: 1px solid #e8e8e8; background: #f4f5f9; overflow: hidden">{svg}{overlays}</section>{below}</main></div>'
        + TAIL.format(w=w,h=h))

def write(name, txt):
    open(os.path.join(OUT,name),"w").write(txt)

