#!/usr/bin/env python3
import re, glob, os, subprocess, sys
os.chdir("artboards")
bad = 0
for f in sorted(glob.glob("*.dc.html")):
    s = open(f, encoding="utf-8").read(); probs = []
    # tag balance
    for tag in ("div", "sc-if", "sc-for", "aside", "main", "table", "tbody", "thead", "tr", "td", "th", "span", "svg", "x-dc"):
        o = len(re.findall(rf'<{tag}\b', s)); c = len(re.findall(rf'</{tag}>', s))
        if o != c: probs.append(f"{tag}: {o} open / {c} close")
    # unresolved template vars: every {{ x }} must be a binding, a loop var, or a literal
    loopvars = set(re.findall(r'<sc-for[^>]*\bas="([^"]+)"', s))
    used = set(m.strip() for m in re.findall(r'\{\{([^}]+)\}\}', s))
    scr = ""
    if '<script data-dc-script' in s:
        i = s.index('<script data-dc-script'); j = s.index('</script>', i); scr = s[i:j]
    for u in sorted(used):
        if u in ("true", "false") or u.split(".")[0] in loopvars: continue
        if not re.search(rf'\b{re.escape(u)}\s*:', scr) and not re.search(rf'\b{re.escape(u)}\b', scr):
            probs.append(f"unbound {{{{ {u} }}}}")
    # js syntax
    if scr:
        body = scr[scr.index('>') + 1:]
        open("/tmp/_chk.js", "w").write("class DCLogic{constructor(p){this.props=p}setState(){}}\n" + body)
        r = subprocess.run(["node", "--check", "/tmp/_chk.js"], capture_output=True, text=True)
        if r.returncode: probs.append("JS: " + r.stderr.strip().split("\n")[-3:][0][:150])
    # palette guard: no hex outside the approved set
    ok = {"7612fa","4a2fff","b38cff","7b68ee","fa24ce","ff02f0","f76808","fc6d7b","fd9a46","4fb9fa","0091ff",
          "6647f0","a43cb4","078d3b","f0382d","ffffff","f8f9fa","e9ebf0","e8e8e8","d9d9d9","292d34","202020",
          "090c1d","646464","838383","b4b4b4","122ba5","1b1754","fa12e3","12d0fa",
          "4a3aa7","2a78d6","1baf7a","eda100","e87ba4","04642a","EA4335","4285F4","FBBC05","34A853"}
    stray = sorted({h.lower() for h in re.findall(r'#([0-9a-fA-F]{6})\b', s)} - {h.lower() for h in ok})
    if stray: probs.append("stray hex: " + ", ".join("#"+h for h in stray))
    print(f"{'FAIL' if probs else ' ok '} {f:26s} {'; '.join(probs) if probs else ''}")
    bad += bool(probs)
sys.exit(1 if bad else 0)
