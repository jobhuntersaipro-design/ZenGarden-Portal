#!/usr/bin/env python3
"""Rebuild the ZenGarden Portal artifact HTML from the edited canvas/ files."""
import json, sys, os
SRC="zengarden-portal-canvas.html"   # the published bundle doubles as the shell
OUT="zengarden-portal-canvas.html"
def load_shell(src=SRC):
    s=open(src,encoding="utf-8").read()
    start=s.index('<script type="application/json" id="appifact-doc">')
    b=s.index('>',start)+1
    e=s.index('</script>',b)
    return s[:b], json.loads(s[b:e]), s[e:]
def main():
    pre,doc,post=load_shell()
    files={}
    for name in sorted(os.listdir("artboards")):
        key=name.replace("__","/")
        files[key]=open("artboards/"+name,encoding="utf-8").read()
    # preserve original key order where possible
    ordered={k:files[k] for k in doc["content"]["files"] if k in files}
    for k,v in files.items():
        ordered.setdefault(k,v)
    doc["content"]["files"]=ordered
    body=json.dumps(doc,ensure_ascii=False,separators=(",",":")).replace("<","\\u003c")
    open(OUT,"w",encoding="utf-8").write(pre+"\n"+body+"\n"+post)
    print(f"wrote {OUT} ({os.path.getsize(OUT):,} bytes), {len(ordered)} files")
if __name__=="__main__": main()
