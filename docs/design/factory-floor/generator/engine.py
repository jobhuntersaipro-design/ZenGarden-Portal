import math

S = 22.0
AX, AY = 0.93, 0.36
BX, BY = -0.62, 0.48
CZ = 0.95

STAGE = {"placed": "#4a3aa7", "prod": "#2a78d6", "qc": "#1baf7a", "wh": "#eda100", "del": "#e87ba4"}
DARK_STAGE = {"placed": "#8f7dff", "prod": "#4ea3ff", "qc": "#34e0a1", "wh": "#ffc233", "del": "#ff8fc0"}

LIGHT = dict(floor="#dfe2ea", wall1="#eceef3", wall2="#e6e8ee",
             pad_raw="#efe7d8", pad_prep="#e9ebf0", pad_line="#e0ecfa", pad_qc="#dff3ea", pad_wh="#fdf1d6", pad_del="#fbe6ee",
             steel="#c3c9d6", belt="#3d4350", carton="#c89b62", sack="#dccaa6", white="#f4f5f8", pallet="#a88b5d",
             drum1="#5d7ea8", drum2="#7b93b5", tank="#d3d8e2", rack="#f7b500", rack2="#e2a300", post="#d98f00",
             truck="#ffffff", cab="#3d4350", flow="#6f6f6f",
             card="#ffffff", cardline="#e8e8e8", text="#292d34", sub="#646464", muted="#b4b4b4",
             glow=0.16, stage=STAGE, shadow="#1b1754", dark=False)
DARK = dict(floor="#161b2e", wall1="#1c2238", wall2="#1a2034",
            pad_raw="#262318", pad_prep="#1d2236", pad_line="#152443", pad_qc="#11302a", pad_wh="#2e2610", pad_del="#2e1726",
            steel="#4b5470", belt="#0a0c15", carton="#8f6b43", sack="#7d705a", white="#d4dbeb", pallet="#5e4a2e",
            drum1="#34507a", drum2="#46618a", tank="#56607c", rack="#c98f00", rack2="#a87700", post="#8a6200",
            truck="#c9cfdd", cab="#0f1220", flow="#7d86a6",
            card="#171c30", cardline="#2c3456", text="#eef0f7", sub="#a4abc4", muted="#5b6380",
            glow=0.34, stage=DARK_STAGE, shadow="#000000", dark=True)
T = dict(LIGHT)


def use_theme(name):
    T.clear()
    T.update(DARK if name == "dark" else LIGHT)


def P(x, y, z=0):
    return ((x * AX + y * BX) * S, (x * AY + y * BY - z * CZ) * S)


def pts(ps):
    return " ".join(f"{a:.1f},{b:.1f}" for a, b in ps)


def hx(c):
    c = c.lstrip("#")
    return [int(c[i:i + 2], 16) for i in (0, 2, 4)]


def mix(c, t, k):
    a, b = hx(c), hx(t)
    return "#%02x%02x%02x" % tuple(round(a[i] + (b[i] - a[i]) * k) for i in range(3))


def lt(c, k=.22):
    return mix(c, "#ffffff", k)


def dk(c, k=.2):
    return mix(c, "#1b1754" if not T["dark"] else "#000000", k)


def convex(ps):
    ps = sorted(set((round(a, 2), round(b, 2)) for a, b in ps))

    def cr(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for p in ps:
        while len(lo) >= 2 and cr(lo[-2], lo[-1], p) <= 0:
            lo.pop()
        lo.append(p)
    for p in reversed(ps):
        while len(up) >= 2 and cr(up[-2], up[-1], p) <= 0:
            up.pop()
        up.append(p)
    return lo[:-1] + up[:-1]


class Scene:
    def __init__(s, animate=False):
        s.items = []; s.items2 = []; s.over = []; s.grads = {}; s.css = {}
        s.bounds = [1e9, 1e9, -1e9, -1e9]
        s.anim = None; s.layer2 = False; s.animate = animate; s.tok_n = 0

    def track(s, ps):
        for a, b in ps:
            s.bounds = [min(s.bounds[0], a), min(s.bounds[1], b), max(s.bounds[2], a), max(s.bounds[3], b)]

    def kf(s, name, body):
        s.css[name] = f"@keyframes {name}{{{body}}}"

    def add(s, key, svg):
        if s.anim:
            svg = f'<g style="{s.anim}">{svg}</g>'
        lst = s.items2 if s.layer2 else s.items
        lst.append((key, len(lst), svg))

    def box(s, x, y, z, w, d, h, c, key=None, op=1, stroke=None):
        top = [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)]
        front = [P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)]
        right = [P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)]
        s.track(top + front + right)
        st = f' stroke="{stroke}" stroke-width="0.8"' if stroke else ' stroke="#ffffff" stroke-opacity="0.25" stroke-width="0.5"'
        g = (f'<g opacity="{op}"><polygon points="{pts(front)}" fill="{c}"{st}></polygon>'
             f'<polygon points="{pts(right)}" fill="{dk(c)}"{st}></polygon>'
             f'<polygon points="{pts(top)}" fill="{lt(c)}"{st}></polygon></g>')
        k = key if key is not None else (x + w / 2) * AY + (y + d / 2) * BY + z * 0.001
        s.add(k, g)

    def grad(s, c):
        gid = "g" + c.lstrip("#")
        if gid not in s.grads:
            s.grads[gid] = (f'<linearGradient id="{gid}" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="{lt(c, .18)}"></stop>'
                            f'<stop offset="0.45" stop-color="{c}"></stop><stop offset="1" stop-color="{dk(c, .28)}"></stop></linearGradient>')
        return gid

    def cyl(s, cx, cy, z, r, h, c, key=None, op=1):
        n = 32
        ang = [i * 2 * math.pi / n for i in range(n)]
        bot = [P(cx + r * math.cos(t), cy + r * math.sin(t), z) for t in ang]
        top = [P(cx + r * math.cos(t), cy + r * math.sin(t), z + h) for t in ang]
        s.track(bot + top)
        hull = convex(bot + top)
        g = (f'<g opacity="{op}"><polygon points="{pts(hull)}" fill="url(#{s.grad(c)})"></polygon>'
             f'<polygon points="{pts(top)}" fill="{lt(c, .3)}" stroke="{dk(c, .1)}" stroke-width="0.5"></polygon></g>')
        k = key if key is not None else cx * AY + cy * BY + z * 0.001
        s.add(k, g)
        return top

    def pad(s, x, y, w, d, c, op=1, dash=False, key=-100):
        q = [P(x, y, 0), P(x + w, y, 0), P(x + w, y + d, 0), P(x, y + d, 0)]
        st = f' stroke="{dk(c, .3)}" stroke-width="1.2" stroke-dasharray="5 4"' if dash else ''
        s.add(key, f'<polygon points="{pts(q)}" fill="{c}" opacity="{op}"{st}></polygon>')

    def token(s, x, y, z, stage, late=False, key=None, r=0.42):
        c = T["stage"][stage]
        sx, sy = P(x, y, z + r); fx, fy = P(x, y, z)
        rr = r * S * 0.95; gid = ("d" if T["dark"] else "t") + stage
        s.grads[gid] = (f'<radialGradient id="{gid}" cx="0.35" cy="0.3" r="0.75"><stop offset="0" stop-color="{lt(c, .6)}"></stop>'
                        f'<stop offset="0.55" stop-color="{c}"></stop><stop offset="1" stop-color="{dk(c, .3)}"></stop></radialGradient>')
        s.tok_n += 1
        n = s.tok_n
        ringanim = ' style="animation: ringpulse 1.4s ease-in-out infinite"' if s.animate else ''
        ring = f'<circle cx="{sx:.1f}" cy="{sy:.1f}" r="{rr + 3.5:.1f}" fill="none" stroke="#f0382d" stroke-width="2"{ringanim}></circle>' if late else ''
        glowanim = f' style="animation: glowpulse 2.6s ease-in-out {-(n * 0.37) % 2.6:.2f}s infinite"' if s.animate else ''
        glow = f'<circle cx="{sx:.1f}" cy="{sy:.1f}" r="{rr * 1.9:.1f}" fill="{c}" opacity="{T["glow"]}"{glowanim}></circle>'
        bob = f' style="animation: bob 2.4s ease-in-out {-(n * 0.53) % 2.4:.2f}s infinite"' if s.animate else ''
        g = (f'<g><ellipse cx="{fx:.1f}" cy="{fy:.1f}" rx="{rr:.1f}" ry="{rr * 0.45:.1f}" fill="{T["shadow"]}" opacity="0.2"></ellipse>'
             f'<g{bob}>{glow}<circle cx="{sx:.1f}" cy="{sy:.1f}" r="{rr:.1f}" fill="url(#{gid})"></circle>{ring}</g></g>')
        if s.animate:
            s.kf("bob", "0%,100%{transform:translate(0px,0px)}50%{transform:translate(0px,-5px)}")
            s.kf("glowpulse", "0%,100%{opacity:.08}50%{opacity:.42}")
            s.kf("ringpulse", "0%,100%{stroke-opacity:1;stroke-width:2px}50%{stroke-opacity:.35;stroke-width:4px}")
        s.add(key if key is not None else x * AY + y * BY + z * 0.001 + 0.05, g)

    def line(s, path, color=None, w=1.6, dash="6 5", arrow=True, key=-50):
        color = color or T["flow"]
        q = [P(*p) for p in path]
        d = "M" + " L".join(f"{a:.1f},{b:.1f}" for a, b in q)
        mk = ' marker-end="url(#arr)"' if arrow else ''
        an = ''
        if s.animate:
            s.kf("dash", "to{stroke-dashoffset:-22}")
            an = ' style="animation: dash 1.1s linear infinite"'
        s.add(key, f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" stroke-dasharray="{dash}" stroke-linecap="round"{mk}{an}></path>')

    def mover(s, name, path, dur, delay, draw, mode="fade"):
        """Animate whatever draw(x, y, z) adds along path (grid points)."""
        q = [P(*p) for p in path]
        x0, y0 = q[0]
        segs = [math.dist(q[i], q[i + 1]) for i in range(len(q) - 1)]
        tot = sum(segs) or 1
        fr = []
        if mode == "fade":
            a, b = 8, 82
            fr.append("0%{transform:translate(0px,0px);opacity:0}")
            fr.append(f"{a}%{{transform:translate(0px,0px);opacity:1}}")
            acc = 0
            for i, sg in enumerate(segs):
                acc += sg
                pc = a + (b - a) * acc / tot
                fr.append(f"{pc:.1f}%{{transform:translate({q[i + 1][0] - x0:.1f}px,{q[i + 1][1] - y0:.1f}px);opacity:1}}")
            ex, ey = q[-1][0] - x0, q[-1][1] - y0
            fr.append(f"90%,100%{{transform:translate({ex:.1f}px,{ey:.1f}px);opacity:0}}")
        else:  # pingpong
            acc = 0
            fr.append("0%,100%{transform:translate(0px,0px)}")
            for i, sg in enumerate(segs):
                acc += sg
                pc = 45 * acc / tot
                pb = 100 - pc
                v = f"transform:translate({q[i + 1][0] - x0:.1f}px,{q[i + 1][1] - y0:.1f}px)"
                fr.append(f"{pc:.1f}%,{max(pc, 55) if i == len(segs) - 1 else pb:.1f}%{{{v}}}")
        s.kf(name, "".join(fr))
        s.anim = f"animation: {name} {dur}s linear {delay}s infinite"
        draw(*path[0])
        s.anim = None

    def label(s, x, y, z, num, title, sub, accent=None, muted=False, w=None, sel=False):
        accent = accent or T["text"]
        ax_, ay_ = P(x, y, z)
        w = w or max(len(title) * 7.6, len(sub) * 6.3) + (50 if num else 24)
        h = 40; bx = ax_ - w / 2; by = ay_ - h - 26
        dash = ' stroke-dasharray="4 3"' if muted else ''
        tx = bx + 12; numsvg = ''
        if num:
            numsvg = (f'<circle cx="{bx + 20:.1f}" cy="{by + h / 2:.1f}" r="11" fill="{accent if not muted else T["muted"]}"></circle>'
                      f'<text x="{bx + 20:.1f}" y="{by + h / 2 + 4:.1f}" text-anchor="middle" font-size="11.5" font-weight="700" fill="{"#0b0e1a" if T["dark"] and not muted else "#ffffff"}" font-family="Inter, sans-serif">{num}</text>')
            tx = bx + 38
        tcol = T["sub"] if muted else T["text"]
        g = (f'<g><line x1="{ax_:.1f}" y1="{ay_:.1f}" x2="{ax_:.1f}" y2="{by + h:.1f}" stroke="{T["text"]}" stroke-opacity="0.35" stroke-width="1"></line>'
             f'<circle cx="{ax_:.1f}" cy="{ay_:.1f}" r="2.5" fill="{T["text"]}" opacity="0.5"></circle>'
             f'<rect x="{bx:.1f}" y="{by + 4:.1f}" width="{w:.1f}" height="{h}" rx="10" fill="#122ba5" opacity="0.07"></rect>'
             f'<rect x="{bx:.1f}" y="{by:.1f}" width="{w:.1f}" height="{h}" rx="10" fill="{T["card"]}" stroke="{accent if sel else T["cardline"]}" stroke-width="{2 if sel else 1}"{dash}></rect>{numsvg}'
             f'<text x="{tx:.1f}" y="{by + 17:.1f}" font-size="12.5" font-weight="650" fill="{tcol}" font-family="Plus Jakarta Sans, sans-serif">{title}</text>'
             f'<text x="{tx:.1f}" y="{by + 31:.1f}" font-size="11" fill="{T["sub"]}" font-family="Inter, sans-serif">{sub}</text></g>')
        s.over.append(g); s.track([(bx, by), (bx + w, by + h)])

    def small(s, x, y, z, text, color=None, bg=None, border=None):
        color = color or T["text"]; bg = bg or T["card"]; border = border or T["cardline"]
        ax_, ay_ = P(x, y, z); w = len(text) * 6.4 + 18; h = 22
        bx = ax_ - w
        s.over.append(f'<g><rect x="{bx:.1f}" y="{ay_ - h / 2:.1f}" width="{w:.1f}" height="{h}" rx="11" fill="{bg}" stroke="{border}"></rect>'
                      f'<text x="{bx + w / 2:.1f}" y="{ay_ + 4:.1f}" text-anchor="middle" font-size="11" font-weight="600" fill="{color}" font-family="Inter, sans-serif">{text}</text></g>')

    def render(s, vb=None, base_op=1, extra=""):
        b = s.bounds; m = 30
        vb = vb or (b[0] - m, b[1] - m, b[2] - b[0] + 2 * m, b[3] - b[1] + 2 * m)
        it = sorted(s.items, key=lambda t: (t[0], t[1]))
        it2 = sorted(s.items2, key=lambda t: (t[0], t[1]))
        defs = ("".join(s.grads.values()) +
                f'<marker id="arr" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9 z" fill="{T["flow"]}"></path></marker>'
                '<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"></feGaussianBlur></filter>')
        return (f'<svg viewBox="{vb[0]:.0f} {vb[1]:.0f} {vb[2]:.0f} {vb[3]:.0f}" preserveAspectRatio="xMidYMid meet" style="position: absolute; inset: 0; width: 100%; height: 100%" role="img" aria-label="Isometric view of the factory floor"><defs>{defs}</defs>'
                + f'<g opacity="{base_op}">' + "".join(t[2] for t in it) + '</g>'
                + "".join(t[2] for t in it2) + "".join(s.over) + extra + '</svg>')

    def keyframes(s):
        return "\n".join(s.css.values())
