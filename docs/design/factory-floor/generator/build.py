from engine import *

LINES_Y = [0.9 + i * 2.25 for i in range(7)]
ACTIVE = {0: False, 2: False, 3: True, 5: False}   # line index -> order on it is late


def build(mode="target", focus=None, animate=False, tokens=True, labels=True):
    s = Scene(animate)
    today = mode == "today"
    prep_op = 0.42 if today else 1
    ST = T["steel"]; BELT = T["belt"]; CARTON = T["carton"]; SACK = T["sack"]; WHITE = T["white"]
    if animate:
        bx, by = P(0.72, 0, 0); cx, cy = P(0.8, 0, 0)
        s.kf("belt", f"from{{transform:translate(0px,0px)}}to{{transform:translate({bx:.2f}px,{by:.2f}px)}}")
        s.kf("belt2", f"from{{transform:translate(0px,0px)}}to{{transform:translate({cx:.2f}px,{cy:.2f}px)}}")
        s.kf("blink", "0%,100%{opacity:1}50%{opacity:.25}")
        s.kf("shimmer", "0%,100%{opacity:0}50%{opacity:.55}")
    # walls + floor
    s.box(-1.5, -1.5, -0.5, 46, 20.5, 0.5, T["floor"], key=-1000)
    s.box(-1.5, -1.9, 0, 46, 0.4, 2.6, T["wall1"], key=-900)
    s.box(-1.9, -1.9, 0, 0.4, 20.9, 2.6, T["wall2"], key=-901)
    s.pad(-0.5, -0.5, 6.5, 17.8, T["pad_raw"])
    s.pad(6.6, -0.5, 5.4, 17.8, T["pad_prep"], dash=today)
    s.pad(12.6, -0.3, 15.8, 16.9, T["pad_line"])
    s.pad(29, -0.5, 5.6, 17.8, T["pad_qc"])
    s.pad(35.4, -0.5, 7.4, 13.3, T["pad_wh"])
    s.pad(35.4, 13.3, 8.2, 4.2, T["pad_del"])
    for p in ([(5.4, 8, 0), (6.8, 2.3, 0)], [(5.4, 8.5, 0), (6.8, 8.3, 0)], [(5.4, 9, 0), (6.8, 14.2, 0)],
              [(11.6, 2.3, 0), (12.8, 4.0, 0)], [(11.6, 8.3, 0), (12.8, 8.3, 0)], [(11.6, 14.2, 0), (12.8, 12.2, 0)],
              [(28.2, 8.3, 0), (29.4, 8.3, 0)], [(34.4, 6, 0), (35.8, 6, 0)], [(34.4, 14.5, 0), (35.8, 15.3, 0)]):
        s.line(p)
    # 1 raw material
    for i in range(2):
        for j in range(2):
            px, py = 0.3 + i * 2.3, 0.3 + j * 2.0
            s.box(px, py, 0, 1.9, 1.6, 0.25, T["pallet"])
            for k in range(3):
                s.box(px + 0.1, py + 0.1, 0.25 + k * 0.5, 1.7, 1.4, 0.46, SACK if k % 2 == 0 else lt(SACK, .12))
    for i in range(3):
        for j in range(3):
            s.cyl(0.9 + i * 1.5, 5.6 + j * 1.4, 0, 0.55, 1.3, T["drum1"] if (i + j) % 2 else T["drum2"])
    for i in range(2):
        for j in range(2):
            px, py = 0.3 + i * 2.3, 10.4 + j * 2.4
            s.box(px, py, 0, 1.9, 1.9, 0.25, T["pallet"]); s.box(px + 0.1, py + 0.1, 0.25, 1.7, 1.7, 1.6, WHITE)
    if tokens:
        for k in range(5):
            s.token(1.2 + k * 0.95, 16.3, 0, "placed")
    # material carts: raw -> prep
    if animate and not today:
        def cart(x, y, z):
            s.box(x - 0.45, y - 0.35, 0, 0.9, 0.7, 0.12, T["pallet"], key=-40)
            s.box(x - 0.4, y - 0.3, 0.12, 0.8, 0.6, 0.45, SACK, key=-39.9)
        s.mover("cartA", [(5.2, 8.0, 0), (6.9, 2.6, 0)], 5.5, -1.0, cart)
        s.mover("cartB", [(5.2, 8.5, 0), (6.9, 8.4, 0)], 4.5, -3.2, cart)
        s.mover("cartC", [(5.2, 9.0, 0), (6.9, 13.9, 0)], 6.0, -4.4, cart)
    # 2 packaging
    s.box(7.2, 0.4, 0, 3.0, 2.4, 2.2, ST, op=prep_op)
    s.box(7.5, 2.8, 1.0, 1.2, 0.05, 0.7, "#4fb9fa", op=prep_op)
    s.box(10.2, 1.6, 0, 1.6, 0.8, 0.7, BELT, op=prep_op)
    if animate and not today:
        s.anim = "animation: belt 0.9s linear infinite"
    for k in range(3):
        s.cyl(10.4 + k * 0.45, 2.0, 0.7, 0.16, 0.55, WHITE, op=prep_op, key=100 + k)
    s.anim = None
    # 3 labelling
    s.box(7.3, 6.7, 0, 2.6, 2.0, 1.5, ST, op=prep_op)
    s.box(7.5, 6.9, 1.5, 2.2, 1.2, 0.35, dk(ST, .15), op=prep_op)
    for k in range(3):
        s.cyl(10.6, 6.8 + k * 0.95, 0, 0.42, 0.55, "#fafafa" if k != 1 else "#ffe9c9", op=prep_op)
    # 4 mixing
    for k, (tx, ty) in enumerate([(8.0, 12.4), (10.4, 12.4), (9.2, 15.2)]):
        top = s.cyl(tx, ty, 0, 1.05, 3.2, T["tank"], op=prep_op)
        if animate and not today:
            s.add(tx * AY + ty * BY + 0.002, f'<polygon points="{pts(top)}" fill="#8fd3ff" style="animation: shimmer 2.2s ease-in-out {-k * 0.7:.1f}s infinite"></polygon>')
        s.cyl(tx, ty, 3.2, 0.35, 0.35, dk(ST, .2), op=prep_op, key=tx * AY + ty * BY + 0.01)
    s.box(11.2, 12.2, 2.2, 1.6, 0.2, 0.2, "#9aa3b3", op=prep_op, key=4.4)
    # 5 seven lines
    for i, gy in enumerate(LINES_Y):
        base = 13 * AY + gy * BY
        foc = focus is None or focus == i
        op = 1 if foc else 0.35
        beltc = "#2f5fa8" if focus == i else BELT
        s.box(13.2, gy, 0, 14.6, 1.0, 0.75, beltc, key=base, op=op)
        s.box(13.6, gy - 0.2, 0.75, 2.0, 1.4, 1.5, ST, key=base + 0.001, op=op)
        s.box(18.6, gy - 0.1, 0.75, 1.1, 1.2, 1.1, lt(ST, .1), key=base + 0.002, op=op)
        s.box(22.4, gy - 0.1, 0.75, 1.3, 1.2, 1.2, lt(ST, .05), key=base + 0.003, op=op)
        s.box(22.5, gy + 1.05, 1.2, 1.1, 0.05, 0.4, "#fd9a46", key=base + 0.0031, op=op)
        running = i in ACTIVE
        lx, ly = P(15.1, gy + 1.2, 2.0)
        light = "#1baf7a" if running else "#fd9a46"
        blink = ' style="animation: blink 1.2s ease-in-out infinite"' if animate and running else ''
        s.add(base + 0.0012, f'<circle cx="{lx:.1f}" cy="{ly:.1f}" r="3.2" fill="{light}" opacity="{op}"{blink}></circle>')
        if running:
            if animate:
                s.anim = f"animation: belt 0.8s linear {-i * 0.13:.2f}s infinite"
            for k in range(8):
                bx_ = 16.1 + k * 0.72
                if 18.4 < bx_ < 19.8:
                    continue
                s.cyl(bx_, gy + 0.5, 0.75, 0.2, 0.62, WHITE, key=base + 0.004 + k * 1e-5, op=op)
            if animate:
                s.anim = f"animation: belt2 0.9s linear {-i * 0.11:.2f}s infinite"
            for k in range(4):
                s.cyl(24.0 + k * 0.8, gy + 0.5, 0.75, 0.2, 0.62, "#f5d99b", key=base + 0.005 + k * 1e-5, op=op)
            s.anim = None
            if tokens and not today:
                s.token(20.9, gy + 0.5, 1.7, "prod", late=ACTIVE[i], key=base + 0.01)
        if labels or focus is not None:
            s.small(12.9, gy + 0.5, 0.4, f"L{i + 1}", color="#ffffff" if running else T["sub"],
                    bg=T["stage"]["prod"] if running else T["card"], border=T["stage"]["prod"] if running else T["cardline"])
    if tokens and today:
        for k, (ox, oy) in enumerate([(20.4, 5.2), (21.4, 5.9), (20.6, 6.9), (21.6, 7.6)]):
            s.token(ox, oy, 3.6, "prod", late=(k == 2), key=500 + k)
    # line output cartons -> packing
    if animate and not today:
        def ctn(x, y, z):
            s.box(x - 0.35, y - 0.35, 0.0, 0.7, 0.7, 0.55, CARTON, key=-39)
        s.mover("outA", [(28.0, LINES_Y[0] + 0.5, 0), (29.8, LINES_Y[0] + 1.5, 0), (30.0, 3.6, 0)], 4.0, -0.6, ctn)
        s.mover("outB", [(28.0, LINES_Y[3] + 0.5, 0), (29.6, LINES_Y[3] + 0.3, 0), (30.2, 7.2, 0)], 4.5, -2.5, ctn)
        s.mover("outC", [(28.0, LINES_Y[5] + 0.5, 0), (29.8, 11.5, 0)], 3.8, -1.7, ctn)
    # 6 packing & QC
    s.box(29.6, 1.0, 0, 2.6, 2.0, 1.6, ST)
    s.box(29.6, 5.2, 0, 3.4, 1.2, 0.9, lt(ST, .3))
    for i in range(2):
        for j in range(2):
            for k in range(2):
                s.box(29.8 + i * 1.4, 9.0 + j * 1.5, k * 0.62, 1.2, 1.2, 0.6, CARTON if (i + j + k) % 2 else lt(CARTON, .12))
    if tokens:
        for ox, oy in [(30.0, 3.7), (31.0, 3.8), (32.0, 3.7), (33.2, 4.1), (30.4, 7.3), (31.5, 7.4), (32.6, 7.3), (33.6, 7.9)]:
            s.token(ox, oy, 0, "qc")
    # an order advancing QC -> warehouse (pairs with the toast)
    if animate and tokens and not today:
        s.mover("advance", [(34.0, 7.9, 0), (35.2, 6.0, 0), (41.6, 6.2, 0), (41.6, 7.0, 0)], 10, 0,
                lambda x, y, z: s.token(x, y, z, "qc", key=60))
    # 7 warehouse
    for r in range(3):
        ry = 0.3 + r * 3.9
        for c in range(3):
            rx = 36.0 + c * 2.2
            s.box(rx, ry, 0, 2.0, 1.4, 0.12, T["pallet"])
            for lvl in range(3):
                zz = lvl * 1.35
                s.box(rx, ry, zz, 2.0, 1.4, 0.1, T["rack"] if lvl == 0 else T["rack2"])
                if (r * 3 + c + lvl) % 4 != 3:
                    s.box(rx + 0.15, ry + 0.15, zz + 0.1, 1.7, 1.1, 0.9, CARTON if lvl % 2 else lt(CARTON, .1))
            s.box(rx, ry + 1.35, 0, 0.08, 0.08, 4.1, T["post"]); s.box(rx + 1.92, ry + 1.35, 0, 0.08, 0.08, 4.1, T["post"])
    if animate:
        def fork(x, y, z):
            s.box(x - 0.4, y - 0.35, 0, 0.8, 0.7, 0.7, "#fd9a46", key=x * AY + y * BY)
            s.box(x - 0.3, y - 0.25, 0.7, 0.6, 0.5, 0.45, CARTON, key=x * AY + y * BY + 0.001)
        s.mover("fork", [(36.2, 2.95, 0), (41.6, 2.95, 0)], 8, -2, fork, mode="pingpong")
    if tokens:
        for k, (ox, oy) in enumerate([(37.2, 3.0), (39.4, 3.3), (41.5, 6.9), (38.3, 10.9)]):
            s.token(ox, oy, 0, "wh", late=(k == 1))
    # 8 dispatch
    if animate:
        dx, dy = P(8, 0, 0)
        s.kf("truck", f"0%,48%{{transform:translate(0px,0px);opacity:1}}72%{{transform:translate({dx:.0f}px,{dy:.0f}px);opacity:0}}"
                      f"73%{{transform:translate(0px,0px);opacity:0}}88%,100%{{transform:translate(0px,0px);opacity:1}}")
    for t, ty in enumerate([13.8, 15.9]):
        if animate and t == 1:
            s.anim = "animation: truck 12s ease-in 0s infinite"
        s.box(36.0, ty, 0.35, 4.4, 1.6, 1.9, T["truck"])
        s.box(36.0, ty + 1.58, 0.8, 4.4, 0.03, 0.25, "#e87ba4")
        s.box(40.4, ty + 0.1, 0.35, 1.3, 1.4, 1.3, T["cab"])
        s.box(40.5, ty + 0.25, 1.15, 0.05, 1.1, 0.4, "#9fd3f5")
        for wx in (36.8, 39.6, 41.0):
            s.box(wx, ty + 1.5, 0, 0.6, 0.15, 0.55, "#202020")
        if tokens:
            spots = [(37.0, 14.6), (38.2, 14.6), (39.4, 14.6)] if t == 0 else [(37.5, 16.7), (38.8, 16.7)]
            for k, (ox, oy) in enumerate(spots):
                s.token(ox, oy, 2.25, "del", late=(k == 0), key=900 + t * 10 + k)
        s.anim = None
    if focus is not None or not labels:
        return s
    A = T["stage"]
    s.label(1.2, 14.5, 1.9, "1", "Raw material", "5 orders waiting · order placed" if not today else "5 orders · order placed", accent=A["placed"])
    s.label(8.7, 1.6, 2.6, "2", "Packaging", "Bottles & caps · [batch]" if not today else "Not tracked yet", muted=today)
    s.label(8.6, 8.3, 1.6, "3", "Labelling", "Label rolls · [batch]" if not today else "Not tracked yet", muted=today)
    s.label(10.4, 15.8, 3.3, "4", "Base mixing", "3 tanks · [batch in tank]" if not today else "Not tracked yet", muted=today)
    s.label(20.5, 0.2, 3.0, "5", "Production lines", "4 of 7 running · 4 orders" if not today else "4 orders · line not recorded", accent=A["prod"], w=210)
    s.label(30.9, 1.8, 1.7, "6", "Packing & QC", "8 orders · QC passed", accent=A["qc"])
    s.label(41.0, 1.0, 4.2, "7", "Warehouse", "4 orders · 1 past due", accent=A["wh"])
    s.label(38.9, 14.6, 3.0, "8", "Out for delivery", "5 orders on 2 trucks", accent=A["del"])
    return s
