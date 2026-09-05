// Minimal stand-in for the canvas runtime: run each artboard's logic and
// expand {{ }}, <sc-for> and <sc-if> so the result can be screenshotted.
const fs = require("fs"), path = require("path"), vm = require("vm");
const dir = "artboards", out = "render"; fs.mkdirSync(out, { recursive: true });
const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
function get(scope, expr) {
  expr = expr.trim();
  if (expr === "true") return true; if (expr === "false") return false;
  return expr.split(".").reduce((o, k) => (o == null ? undefined : o[k]), scope);
}
function expand(html, scope) {
  // <sc-for list="{{ rows }}" as="r"> ... </sc-for>
  html = expandTag(html, "sc-for", (attrs, inner) => {
    const list = get(scope, attrs.list.replace(/[{}]/g, "")) || [];
    return list.map(item => expand(inner, { ...scope, [attrs.as]: item })).join("");
  });
  html = expandTag(html, "sc-if", (attrs, inner) => {
    const v = get(scope, attrs.value.replace(/[{}]/g, ""));
    return v ? expand(inner, scope) : "";
  });
  return html.replace(/\{\{([^}]+)\}\}/g, (m, e) => {
    const v = get(scope, e); return v === undefined || v === null || typeof v === "function" ? "" : esc(v);
  });
}
function expandTag(html, tag, fn) {
  const open = new RegExp(`<${tag}\\b([^>]*)>`, "g");
  let m;
  while ((m = open.exec(html))) {
    let d = 1, i = open.lastIndex;
    const re = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, "g"); re.lastIndex = i;
    let mm, end = -1, close = -1;
    while ((mm = re.exec(html))) { d += mm[0].startsWith(`</`) ? -1 : 1; if (d === 0) { end = mm.index; close = re.lastIndex; break; } }
    if (end < 0) break;
    const attrs = {}; m[1].replace(/([\w-]+)="([^"]*)"/g, (_, k, v) => attrs[k] = v);
    const rep = fn(attrs, html.slice(i, end));
    html = html.slice(0, m.index) + rep + html.slice(close);
    open.lastIndex = m.index + rep.length;
  }
  return html;
}
const report = [];
for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".dc.html"))) {
  let s = fs.readFileSync(path.join(dir, f), "utf8");
  const body = s.slice(s.indexOf("<x-dc>") + 6, s.lastIndexOf("</x-dc>"));
  const style = (s.match(/<style>[\s\S]*?<\/style>/) || [""])[0];
  let markup = body.replace(/<helmet>[\s\S]*?<\/helmet>/, ""), vals = {}, note = "ok";
  const si = s.indexOf("<script data-dc-script");
  if (si >= 0) {
    const js = s.slice(s.indexOf(">", si) + 1, s.indexOf("</script>", si));
    const props = JSON.parse((s.slice(si, s.indexOf(">", si)).match(/data-props='([^']*)'/) || [0, "{}"])[1]);
    const defaults = Object.fromEntries(Object.entries(props).map(([k, v]) => [k, v.default]));
    const ctx = { console, performance: { now: () => 0 }, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
      DCLogic: class { constructor(p) { this.props = p; } setState(p, cb) { Object.assign(this.state, p); if (cb) cb(); } } };
    vm.createContext(ctx);
    try {
      vm.runInContext(js + "\n;globalThis.__C = Component;", ctx);
      const inst = new ctx.__C(defaults);
      vals = inst.renderVals();
      const used = new Set([...markup.matchAll(/\{\{([^}]+)\}\}/g)].map(m => m[1].trim().split(".")[0]));
      const loop = new Set([...markup.matchAll(/<sc-for[^>]*\bas="([^"]+)"/g)].map(m => m[1]));
      const missing = [...used].filter(u => !(u in vals) && !loop.has(u) && u !== "true" && u !== "false");
      if (missing.length) note = "MISSING BINDINGS: " + missing.join(", ");
    } catch (e) { note = "THREW: " + e.message; }
  }
  const html = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@200..800&family=Inter:wght@400..700&family=Sometype+Mono:wght@400;500&display=swap">${style}<body style="margin:0">${expand(markup, vals)}</body>`;
  fs.writeFileSync(path.join(out, f.replace(".dc.html", ".html")), html);
  report.push(`${note === "ok" ? " ok " : "FAIL"} ${f.padEnd(24)} ${note === "ok" ? Object.keys(vals).length + " bindings" : note}`);
}
console.log(report.sort().join("\n"));
