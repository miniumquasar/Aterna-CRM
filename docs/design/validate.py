#!/usr/bin/env python3
"""
AETERNA CRM palette validator.

Reads palettes.json (next to this file, or the path given as argv[1]) and checks,
for EVERY palette in BOTH modes and at EVERY glass effect level
(Full, Balanced, Lite, Reduce transparency):

  Text      text >= 7:1 (hard floor 4.5), textMuted >= 4.5, textFaint >= 3
            against every layer text can sit on: the glass surface, a raised card,
            a sunken input and a selected (accentSoft) row. Each translucent layer
            is composited over the darkest AND lightest backdrop colours, including
            the two ambient glows at full strength; the worst case is reported.
  Accent    accentFg on accent / hover / active / both gradient ends >= 4.5;
            accent as a UI graphic (toggle, checkbox, selection bar) >= 3;
            focus ring >= 3 (we hold it to 4.5 because it doubles as accent text);
            accent2 as a graphic >= 3; every semantic colour differs from the
            accent by dE2000 >= 10 (so "danger" never reads as the brand).
  Semantic  success / warning / danger / info as text >= 4.5 on the surface,
            on a raised card and on their own soft tint (so >= 3 as graphics too).
  Chart     every categorical colour >= 3:1 on the surface and on a raised card;
            adjacent pairs dE2000 >= 15 under normal vision and simulated
            protanopia, deuteranopia and tritanopia (Machado et al. 2009, severity 1);
            plus the dataviz skill's own checks (OKLCH lightness band, chroma floor,
            OKLab dE x100 >= 15 normal and >= 8 protan/deutan) - and, when the
            skill's validate_palette.py is found, its verdict on the same colours.
  Scales    sequential: one hue, monotone lightness, adjacent dL >= 0.06, the step
            nearest the surface >= 2:1 (so it also works as an ordinal ramp, e.g.
            aged-debt buckets); diverging: grey midpoint (C <= 0.03), both poles
            >= 3:1, poles dE2000 >= 15 under all four visions, monotone arms.

Exit code 0 only when every check passes. Writes validation.txt next to the JSON.
Standard library only.
"""
import json
import math
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

TOKEN_KEYS = [
    "backdropFrom", "backdropVia", "backdropTo", "glowA", "glowB",
    "surface", "surfaceRaised", "surfaceSunken", "border", "borderStrong",
    "highlight", "shadow", "text", "textMuted", "textFaint",
    "accent", "accentHover", "accentActive", "accentFg", "accentSoft", "accent2",
    "accentGradientFrom", "accentGradientTo", "focus",
    "success", "successSoft", "warning", "warningSoft", "danger", "dangerSoft",
    "info", "infoSoft", "chart", "chartSequential", "chartDiverging",
]

# Glass effect levels: multiplier on the alpha of the two glass layers
# (surface, surfaceRaised). "solid" = Reduce transparency: each layer is
# flattened over backdropVia and rendered opaque.
EFFECTS = [("full", 0.85), ("balanced", 1.0), ("lite", 1.15), ("solid", None)]

T_TEXT_TARGET, T_TEXT_FLOOR = 7.0, 4.5
T_MUTED, T_FAINT = 4.5, 3.0
T_UI, T_FOCUS = 3.0, 4.5
T_DE_CHART = 15.0
T_DE_ACCENT_SEMANTIC = 10.0

# ---------------------------------------------------------------- colour maths

_RGBA = re.compile(r"rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$")


def parse(c):
    """'#rrggbb' or 'rgba(r,g,b,a)' -> (r, g, b, a) with r,g,b in 0..255."""
    c = c.strip()
    if re.fullmatch(r"#[0-9a-fA-F]{6}", c):
        return (int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16), 1.0)
    m = _RGBA.match(c)
    if not m:
        raise ValueError(f"unparseable colour: {c!r}")
    r, g, b = (float(m.group(i)) for i in (1, 2, 3))
    a = float(m.group(4)) if m.group(4) is not None else 1.0
    return (r, g, b, a)


def to_hex(rgb):
    return "#%02x%02x%02x" % tuple(max(0, min(255, round(v))) for v in rgb[:3])


def with_alpha(c, k):
    r, g, b, a = parse(c)
    return (r, g, b, min(0.96, a * k))


def over(top, bottom):
    """Source-over composite of top (rgba tuple or string) on an opaque bottom."""
    if isinstance(top, str):
        top = parse(top)
    if isinstance(bottom, str):
        bottom = parse(bottom)
    r, g, b, a = top
    return tuple(a * t + (1 - a) * u for t, u in zip((r, g, b), bottom[:3])) + (1.0,)


def _s2l(v):
    v /= 255.0
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def _l2s(v):
    v = max(0.0, min(1.0, v))
    return 255.0 * (12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055)


def lin(c):
    p = parse(c) if isinstance(c, str) else c
    return tuple(_s2l(v) for v in p[:3])


def luminance(c):
    r, g, b = lin(c)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def lab_from_lin(r, g, b):
    x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047
    y = (0.2126729 * r + 0.7151522 * g + 0.0721750 * b)
    z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883

    def f(t):
        return t ** (1 / 3) if t > 216 / 24389 else (24389 / 27 * t + 16) / 116
    fx, fy, fz = f(x), f(y), f(z)
    return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))


def oklab_from_lin(r, g, b):
    l = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ** (1 / 3)
    m = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ** (1 / 3)
    s = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) ** (1 / 3)
    return (0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s)


def oklch(c):
    L, a, b = oklab_from_lin(*lin(c))
    return (L, math.hypot(a, b), math.degrees(math.atan2(b, a)) % 360)


def from_oklch(L, C, h):
    """OKLCH -> hex, reducing chroma until the colour is inside sRGB."""
    for _ in range(60):
        a, b = C * math.cos(math.radians(h)), C * math.sin(math.radians(h))
        l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
        m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
        s_ = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
        r = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_
        g = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_
        bb = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_
        if all(-1e-4 <= v <= 1.0001 for v in (r, g, bb)):
            return to_hex((_l2s(r), _l2s(g), _l2s(bb)))
        C *= 0.97
    return to_hex((_l2s(r), _l2s(g), _l2s(bb)))


# Machado, Oliveira & Fernandes (2009), severity 1.0, linear RGB - the same
# matrices the dataviz skill's validator uses.
MACHADO = {
    "protan": ((0.152286, 1.052583, -0.204868), (0.114503, 0.786281, 0.099216), (-0.003882, -0.048116, 1.051998)),
    "deutan": ((0.367322, 0.860646, -0.227968), (0.280085, 0.672501, 0.047413), (-0.011820, 0.042940, 0.968881)),
    "tritan": ((1.255528, -0.076749, -0.178779), (-0.078411, 0.930809, 0.147602), (0.004733, 0.691367, 0.303900)),
}
VISIONS = ("normal", "protan", "deutan", "tritan")


def sim_lin(c, vision):
    r, g, b = lin(c)
    if vision == "normal":
        return (r, g, b)
    M = MACHADO[vision]
    return tuple(max(0.0, min(1.0, M[i][0] * r + M[i][1] * g + M[i][2] * b)) for i in range(3))


def de2000(c1, c2, vision="normal"):
    L1, a1, b1 = lab_from_lin(*sim_lin(c1, vision))
    L2, a2, b2 = lab_from_lin(*sim_lin(c2, vision))
    C1, C2 = math.hypot(a1, b1), math.hypot(a2, b2)
    Cm = (C1 + C2) / 2
    G = 0.5 * (1 - math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)))
    a1p, a2p = (1 + G) * a1, (1 + G) * a2
    C1p, C2p = math.hypot(a1p, b1), math.hypot(a2p, b2)
    h1p = math.degrees(math.atan2(b1, a1p)) % 360 if (a1p or b1) else 0.0
    h2p = math.degrees(math.atan2(b2, a2p)) % 360 if (a2p or b2) else 0.0
    dLp, dCp = L2 - L1, C2p - C1p
    if C1p * C2p == 0:
        dhp = 0.0
    else:
        dhp = h2p - h1p
        if dhp > 180:
            dhp -= 360
        elif dhp < -180:
            dhp += 360
    dHp = 2 * math.sqrt(C1p * C2p) * math.sin(math.radians(dhp / 2))
    Lpm, Cpm = (L1 + L2) / 2, (C1p + C2p) / 2
    if C1p * C2p == 0:
        hpm = h1p + h2p
    elif abs(h1p - h2p) <= 180:
        hpm = (h1p + h2p) / 2
    elif h1p + h2p < 360:
        hpm = (h1p + h2p + 360) / 2
    else:
        hpm = (h1p + h2p - 360) / 2
    T = (1 - 0.17 * math.cos(math.radians(hpm - 30)) + 0.24 * math.cos(math.radians(2 * hpm))
         + 0.32 * math.cos(math.radians(3 * hpm + 6)) - 0.20 * math.cos(math.radians(4 * hpm - 63)))
    dtheta = 30 * math.exp(-(((hpm - 275) / 25) ** 2))
    Rc = 2 * math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7))
    Sl = 1 + 0.015 * (Lpm - 50) ** 2 / math.sqrt(20 + (Lpm - 50) ** 2)
    Sc = 1 + 0.045 * Cpm
    Sh = 1 + 0.015 * Cpm * T
    Rt = -math.sin(math.radians(2 * dtheta)) * Rc
    return math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh))


def de_oklab(c1, c2, vision="normal"):
    return 100 * math.dist(oklab_from_lin(*sim_lin(c1, vision)), oklab_from_lin(*sim_lin(c2, vision)))


# ---------------------------------------------------------------- glass layers

def layers(t, effect):
    """Every opaque colour each kind of text can sit on, for one effect level.
    Returns dict name -> list of (label, rgb-tuple)."""
    k = dict(EFFECTS)[effect]
    stops = [("backdropFrom", parse(t["backdropFrom"])), ("backdropVia", parse(t["backdropVia"])),
             ("backdropTo", parse(t["backdropTo"]))]
    bases = list(stops)
    for g in ("glowA", "glowB"):
        for name, s in stops:
            bases.append((f"{g} over {name}", over(t[g], s)))
    if effect == "solid":
        surf = [("solid surface", over(t["surface"], t["backdropVia"]))]
        raised = [("solid raised", over(t["surfaceRaised"], surf[0][1]))]
    else:
        surf = [(f"surface over {n}", over(with_alpha(t["surface"], k), b)) for n, b in bases]
        raised = [(f"raised on {n}", over(with_alpha(t["surfaceRaised"], k), b)) for n, b in surf]
    sunken = [(f"sunken on {n}", over(t["surfaceSunken"], b)) for n, b in surf + raised]
    soft = [(f"accentSoft on {n}", over(t["accentSoft"], b)) for n, b in surf + raised]
    return {"surface": surf, "raised": raised, "sunken": sunken, "accentSoft": soft}


def worst(fg, bgs):
    """Lowest contrast of fg against a list of (label, rgb); returns (ratio, label)."""
    best = None
    for label, bg in bgs:
        r = contrast(fg, bg)
        if best is None or r < best[0]:
            best = (r, label)
    return best


# ---------------------------------------------------------------- checks

class Result:
    def __init__(self):
        self.rows = []

    def add(self, mode, group, name, value, threshold, ok, detail="", fmt="{:.2f}", cmp=">="):
        self.rows.append(dict(mode=mode, group=group, name=name, value=value, threshold=threshold,
                              ok=bool(ok), detail=detail, fmt=fmt, cmp=cmp))

    @property
    def ok(self):
        return all(r["ok"] for r in self.rows)


def check_schema(p, res):
    for k in ("id", "name", "tagline", "description", "swatches", "recommendedFor", "day", "night"):
        res.add("both", "schema", f"has {k}", 1 if k in p else 0, 1, k in p, fmt="{}", cmp="==")
    words = len(p.get("tagline", "").split())
    res.add("both", "schema", "tagline <= 6 words", words, 6, words <= 6, fmt="{}", cmp="<=")
    sw = p.get("swatches", [])
    res.add("both", "schema", "3 hex swatches", len(sw), 3,
            len(sw) == 3 and all(re.fullmatch(r"#[0-9a-f]{6}", s) for s in sw), fmt="{}", cmp="==")
    for mode in ("day", "night"):
        t = p.get(mode, {})
        missing = [k for k in TOKEN_KEYS if k not in t]
        extra = [k for k in t if k not in TOKEN_KEYS]
        res.add(mode, "schema", "exact token keys", len(missing) + len(extra), 0,
                not missing and not extra, f"missing {missing} extra {extra}" if missing or extra else "", fmt="{}",
                cmp="==")
        lens = {"chart": 8, "chartSequential": 5, "chartDiverging": 5}
        for k, n in lens.items():
            v = t.get(k, [])
            res.add(mode, "schema", f"{k} has {n}", len(v), n, len(v) == n, fmt="{}", cmp="==")
        bad = []
        for k, v in t.items():
            for c in (v if isinstance(v, list) else [v]):
                try:
                    parse(c)
                except ValueError:
                    bad.append(f"{k}={c}")
        res.add(mode, "schema", "colours parse", len(bad), 0, not bad, ", ".join(bad), fmt="{}", cmp="==")


def check_mode(p, mode, res, skill_script=None, extra=None):
    t = p[mode]
    # --- text tiers, all effect levels
    tiers = [("text", T_TEXT_FLOOR, ("surface", "raised", "sunken", "accentSoft")),
             ("textMuted", T_MUTED, ("surface", "raised", "sunken", "accentSoft")),
             ("textFaint", T_FAINT, ("surface", "raised", "sunken", "accentSoft"))]
    for key, thr, where in tiers:
        lo = None
        for eff, _ in EFFECTS:
            L = layers(t, eff)
            bgs = [x for w in where for x in L[w]]
            r = worst(t[key], bgs)
            if lo is None or r[0] < lo[0]:
                lo = (r[0], f"{eff}: {r[1]}")
        res.add(mode, "text", key, lo[0], thr, lo[0] >= thr, lo[1])
        if key == "text":
            res.add(mode, "text", "text (target 7:1)", lo[0], T_TEXT_TARGET, lo[0] >= T_TEXT_TARGET, lo[1])

    # --- accent
    for key in ("accent", "accentHover", "accentActive", "accentGradientFrom", "accentGradientTo"):
        r = contrast(t["accentFg"], t[key])
        res.add(mode, "accent", f"accentFg on {key}", r, 4.5, r >= 4.5)

    def worst_all(color, where=("surface", "raised")):
        lo = None
        for eff, _ in EFFECTS:
            L = layers(t, eff)
            r = worst(color, [x for w in where for x in L[w]])
            if lo is None or r[0] < lo[0]:
                lo = (r[0], f"{eff}: {r[1]}")
        return lo

    r = worst_all(t["accent"], ("surface",))
    res.add(mode, "accent", "accent as UI graphic vs surface", r[0], T_UI, r[0] >= T_UI, r[1])
    r = worst_all(t["focus"])
    res.add(mode, "accent", "focus ring vs surface (>=3)", r[0], T_UI, r[0] >= T_UI, r[1])
    res.add(mode, "accent", "focus as accent text (>=4.5)", r[0], T_FOCUS, r[0] >= T_FOCUS, r[1])
    r = worst_all(t["accent2"])
    res.add(mode, "accent", "accent2 as graphic vs surface", r[0], T_UI, r[0] >= T_UI, r[1])
    for s in ("success", "warning", "danger", "info"):
        d = de2000(t["accent"], t[s])
        res.add(mode, "accent", f"accent vs {s} dE2000", d, T_DE_ACCENT_SEMANTIC, d >= T_DE_ACCENT_SEMANTIC,
                fmt="{:.1f}")

    # --- semantic: plain as text on surface, raised and own soft tint
    for s in ("success", "warning", "danger", "info"):
        lo = None
        for eff, _ in EFFECTS:
            L = layers(t, eff)
            bgs = L["surface"] + L["raised"]
            bgs = bgs + [(f"{s}Soft on {n}", over(t[s + "Soft"], b)) for n, b in bgs]
            r = worst(t[s], bgs)
            if lo is None or r[0] < lo[0]:
                lo = (r[0], f"{eff}: {r[1]}")
        res.add(mode, "semantic", f"{s} as text (>=4.5)", lo[0], 4.5, lo[0] >= 4.5, lo[1])

    # --- chart: contrast
    chart = t["chart"]
    for i, c in enumerate(chart):
        r = worst_all(c)
        res.add(mode, "chart", f"chart[{i + 1}] {c} vs surface", r[0], 3.0, r[0] >= 3.0, r[1])
    # --- chart: adjacent dE2000 under four visions
    for v in VISIONS:
        ds = [(de2000(chart[i], chart[i + 1], v), i) for i in range(len(chart) - 1)]
        d, i = min(ds)
        res.add(mode, "chart", f"adjacent dE2000 {v}", d, T_DE_CHART, d >= T_DE_CHART,
                f"worst {i + 1}-{i + 2} {chart[i]}/{chart[i + 1]}", fmt="{:.1f}")
    # --- chart: dataviz skill checks (re-implemented; thresholds from the skill)
    band = (0.43, 0.77) if mode == "day" else (0.48, 0.67)
    Ls = [oklch(c)[0] for c in chart]
    Cs = [oklch(c)[1] for c in chart]
    res.add(mode, "chart-skill", f"OKLCH L in band {band}", min(Ls) if mode == "day" else min(Ls), band[0],
            all(band[0] <= x <= band[1] for x in Ls), f"L range {min(Ls):.3f}-{max(Ls):.3f}", fmt="{:.3f}")
    res.add(mode, "chart-skill", "OKLCH chroma >= 0.10", min(Cs), 0.10, min(Cs) >= 0.10, fmt="{:.3f}")
    dn = min(de_oklab(chart[i], chart[i + 1]) for i in range(7))
    res.add(mode, "chart-skill", "OKLab dE normal >= 15", dn, 15, dn >= 15, fmt="{:.1f}")
    dc = min(de_oklab(chart[i], chart[i + 1], v) for i in range(7) for v in ("protan", "deutan"))
    res.add(mode, "chart-skill", "OKLab dE protan/deutan >= 8", dc, 8, dc >= 8, fmt="{:.1f}")
    if skill_script:
        # pass the surface the chart actually renders on: worst case for marks
        Lb = layers(t, "balanced")
        cands = [b for _, b in Lb["surface"] + Lb["raised"]]
        surf = min(cands, key=luminance) if mode == "day" else max(cands, key=luminance)
        cmd = [sys.executable, "-I", skill_script, ",".join(chart), "--mode",
               "light" if mode == "day" else "dark", "--surface", to_hex(surf)]
        out = subprocess.run(cmd, capture_output=True, text=True)
        lines = [ln.strip() for ln in out.stdout.splitlines() if ln.strip().startswith("[")]
        warn = [ln for ln in lines if ln.startswith("[WARN")]
        res.add(mode, "chart-skill", "dataviz validate_palette.py (exit 0, no WARN)", out.returncode, 0,
                out.returncode == 0 and not warn,
                f"surface {to_hex(surf)}; " + " | ".join(ln.split("]")[0][1:].strip() + " " + ln.split("]")[1].split()[0]
                                                        for ln in lines), fmt="exit {}", cmp="==")
        if extra is not None:
            extra.append((p["id"], mode, to_hex(surf), out.stdout.strip()))

    # --- sequential
    seq = t["chartSequential"]
    sL = [oklch(c)[0] for c in seq]
    mono = all(sL[i] > sL[i + 1] for i in range(4))
    res.add(mode, "scales", "sequential light->dark monotone", 1 if mono else 0, 1, mono,
            "L " + " ".join(f"{x:.2f}" for x in sL), fmt="{}", cmp="==")
    gap = min(sL[i] - sL[i + 1] for i in range(4))
    res.add(mode, "scales", "sequential adjacent dL >= 0.06", gap, 0.06, gap >= 0.06, fmt="{:.3f}")
    hues = [oklch(c)[2] for c in seq if oklch(c)[1] > 0.02]
    spread = max(abs(((a - b + 180) % 360) - 180) for a in hues for b in hues) if hues else 0
    res.add(mode, "scales", "sequential single hue (spread <= 40)", spread, 40, spread <= 40, fmt="{:.0f}",
            cmp="<=")
    near = seq[0] if mode == "day" else seq[-1]
    r = worst_all(near)
    res.add(mode, "scales", "sequential step nearest surface >= 2", r[0], 2.0, r[0] >= 2.0, f"{near}; {r[1]}")

    # --- diverging
    dv = t["chartDiverging"]
    mid = oklch(dv[2])
    res.add(mode, "scales", "diverging midpoint grey (C <= 0.03)", mid[1], 0.03, mid[1] <= 0.03, fmt="{:.3f}",
            cmp="<=")
    for i in (0, 4):
        r = worst_all(dv[i])
        res.add(mode, "scales", f"diverging pole {i + 1} vs surface", r[0], 3.0, r[0] >= 3.0, r[1])
    dpol = min(de2000(dv[0], dv[4], v) for v in VISIONS)
    res.add(mode, "scales", "diverging poles dE2000 (all visions)", dpol, 15, dpol >= 15, fmt="{:.1f}")
    dinner = min(de2000(dv[1], dv[3], v) for v in VISIONS)
    res.add(mode, "scales", "diverging inner steps dE2000 (all visions)", dinner, 10, dinner >= 10, fmt="{:.1f}")
    dL = [oklch(c)[0] for c in dv]
    if mode == "day":   # poles darkest, midpoint lightest
        arms = dL[0] < dL[1] < dL[2] and dL[4] < dL[3] < dL[2]
    else:               # poles lightest, midpoint darkest
        arms = dL[0] > dL[1] > dL[2] and dL[4] > dL[3] > dL[2]
    res.add(mode, "scales", "diverging arms monotone to midpoint", 1 if arms else 0, 1, arms,
            "L " + " ".join(f"{x:.2f}" for x in dL), fmt="{}", cmp="==")


def check_pairing(p, res):
    """Colour follows the entity: slot i must be the same hue family in Day and
    Night (the dark column is the same hue re-stepped, never a new colour)."""
    worst_dh, where = 0.0, ""
    for key in ("chart", "chartSequential", "chartDiverging"):
        for i, (a, b) in enumerate(zip(p["day"][key], p["night"][key])):
            la, lb = oklch(a), oklch(b)
            if min(la[1], lb[1]) < 0.03:      # greys have no meaningful hue
                continue
            dh = abs(((la[2] - lb[2] + 180) % 360) - 180)
            if dh > worst_dh:
                worst_dh, where = dh, f"{key}[{i + 1}] {a} / {b}"
    res.add("both", "chart", "slot hue day vs night (<= 25 deg)", worst_dh, 25, worst_dh <= 25, where,
            fmt="{:.1f}", cmp="<=")


def solids(t):
    s = over(t["surface"], t["backdropVia"])
    return {"surface": to_hex(s), "surfaceRaised": to_hex(over(t["surfaceRaised"], s)),
            "surfaceSunken": to_hex(over(t["surfaceSunken"], s)),
            "accentSoft": to_hex(over(t["accentSoft"], s))}


# Colours sampled from the brief's Burgundy screenshots (images 2 and 3).
BRIEF_BURGUNDY = {
    "night": {"backdropFrom": "#2b0a15", "backdropVia": "#0d0a10", "backdropTo": "#07060b",
              "text": "#fff4ff", "textMuted": "#bba6b9", "textFaint": "#7c687f",
              "accent": "#ac113f", "accentGradientFrom": "#9e1439", "accentGradientTo": "#d16472"},
    "day": {"backdropFrom": "#f1dfe7", "backdropVia": "#eceff7", "backdropTo": "#dadeed",
            "text": "#080b1a", "textMuted": "#5e535d", "textFaint": "#838594",
            "accent": "#91143a", "accentGradientFrom": "#710f2c", "accentGradientTo": "#b54959"},
}


def find_skill_script():
    env = os.environ.get("DATAVIZ_VALIDATOR")
    if env and os.path.exists(env):
        return env
    root = "/tmp/claude-0/bundled-skills"
    if os.path.isdir(root):
        for dp, _, fs in os.walk(root):
            if dp.endswith(os.path.join("dataviz", "scripts")) and "validate_palette.py" in fs:
                return os.path.join(dp, "validate_palette.py")
    return None


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "palettes.json")
    out_path = os.path.join(os.path.dirname(os.path.abspath(path)), "validation.txt")
    with open(path) as f:
        palettes = json.load(f)
    skill = find_skill_script()
    out, extra, all_ok = [], [], True
    out.append("AETERNA CRM - palette validation")
    out.append(f"source: {os.path.basename(path)}  palettes: {len(palettes)}  "
               f"effect levels: {', '.join(e for e, _ in EFFECTS)}")
    out.append(f"dataviz skill validator: {skill or 'not found (internal re-implementation only)'}")
    out.append("")
    results = {}
    for p in palettes:
        res = Result()
        check_schema(p, res)
        check_pairing(p, res)
        for mode in ("day", "night"):
            check_mode(p, mode, res, skill, extra)
        results[p["id"]] = res
        all_ok &= res.ok

    # summary table
    groups = ["text", "accent", "semantic", "chart", "chart-skill", "scales", "schema"]
    out.append("SUMMARY (checks passed / total, per palette and mode)")
    hdr = f"{'palette':12} {'mode':6} " + " ".join(f"{g:>12}" for g in groups) + "   verdict"
    out.append(hdr)
    out.append("-" * len(hdr))
    for p in palettes:
        res = results[p["id"]]
        for mode in ("day", "night"):
            cells = []
            ok_mode = True
            for g in groups:
                rows = [r for r in res.rows if r["group"] == g and r["mode"] in (mode, "both")]
                n_ok = sum(r["ok"] for r in rows)
                ok_mode &= n_ok == len(rows)
                cells.append(f"{n_ok}/{len(rows)}".rjust(12))
            out.append(f"{p['id']:12} {mode:6} " + " ".join(cells) + f"   {'PASS' if ok_mode else 'FAIL'}")
    out.append("")

    # key numbers table
    out.append("KEY RESULTS (worst case across Full / Balanced / Lite / Reduce transparency and every layer)")
    keys = [("text", "text"), ("muted", "textMuted"), ("faint", "textFaint"),
            ("fg/acc", "accentFg on accent"), ("fg/gTo", "accentFg on accentGradientTo"),
            ("accUI", "accent as UI graphic vs surface"), ("focus", "focus ring vs surface (>=3)"),
            ("acc2", "accent2 as graphic vs surface"), ("succ", "success as text (>=4.5)"),
            ("warn", "warning as text (>=4.5)"), ("dang", "danger as text (>=4.5)"),
            ("info", "info as text (>=4.5)")]
    hdr = f"{'palette':12} {'mode':6} " + " ".join(f"{k:>7}" for k, _ in keys) + \
          f" {'chart>=':>8} {'dE norm':>8} {'protan':>7} {'deutan':>7} {'tritan':>7}"
    out.append(hdr)
    out.append("-" * len(hdr))
    for p in palettes:
        res = results[p["id"]]
        for mode in ("day", "night"):
            def val(name):
                for r in res.rows:
                    if r["mode"] == mode and r["name"] == name:
                        return r["value"]
            cells = [f"{val(n):7.2f}" for _, n in keys]
            ch = min(r["value"] for r in res.rows if r["mode"] == mode and r["name"].startswith("chart["))
            de = [val(f"adjacent dE2000 {v}") for v in VISIONS]
            out.append(f"{p['id']:12} {mode:6} " + " ".join(cells) + f" {ch:8.2f} " +
                       " ".join(f"{d:7.1f}" if i else f"{d:8.1f}" for i, d in enumerate(de)))
    out.append("Thresholds: text 7 (floor 4.5) | muted 4.5 | faint 3 | accentFg 4.5 | accent UI 3 | focus 4.5 |"
               " accent2 3 | semantic text 4.5 | chart 3 | adjacent dE2000 15 in every vision")
    out.append("")

    # reduce transparency solids
    out.append("REDUCE TRANSPARENCY - opaque equivalents (layer flattened over backdropVia)")
    out.append(f"{'palette':12} {'mode':6} {'surface':>9} {'raised':>9} {'sunken':>9} {'selected':>9}")
    for p in palettes:
        for mode in ("day", "night"):
            s = solids(p[mode])
            out.append(f"{p['id']:12} {mode:6} {s['surface']:>9} {s['surfaceRaised']:>9} "
                       f"{s['surfaceSunken']:>9} {s['accentSoft']:>9}")
    out.append("")

    # fidelity to brief
    bur = next((p for p in palettes if p["id"] == "burgundy"), None)
    if bur:
        out.append("FIDELITY TO THE BRIEF - Burgundy & Slate tokens vs colours sampled from the screenshots (dE2000)")
        for mode in ("night", "day"):
            parts = []
            for k, ref in BRIEF_BURGUNDY[mode].items():
                parts.append(f"{k} {bur[mode][k]} vs {ref}: {de2000(bur[mode][k], ref):.1f}")
            out.append(f"  {mode}:")
            for ln in parts:
                out.append(f"    {ln}")
        out.append("  (accentGradientTo moved deliberately: the brief's sheen end gives white text only "
                   f"{contrast('#ffffff', '#d16472'):.2f}:1 in Night)")
        out.append("")

    # details
    out.append("DETAIL")
    for p in palettes:
        res = results[p["id"]]
        out.append(f"== {p['id']} - {p['name']} ({'PASS' if res.ok else 'FAIL'})")
        for r in res.rows:
            if r["group"] == "schema" and r["ok"]:
                continue
            v = r["fmt"].format(r["value"]) if r["fmt"] != "{}" else str(r["value"])
            out.append(f"  [{'PASS' if r['ok'] else 'FAIL'}] {r['mode']:5} {r['group']:11} {r['name']:44} "
                       f"{v:>8}  ({r['cmp']} {r['threshold']})  {r['detail']}")
        out.append("")

    if extra:
        out.append("DATAVIZ SKILL VALIDATOR - raw output per palette and mode")
        for pid, mode, surf, txt in extra:
            out.append(f"-- {pid} {mode} (surface {surf})")
            out.extend("   " + ln for ln in txt.splitlines() if ln.strip())
        out.append("")

    out.append("OVERALL: " + ("ALL CHECKS PASS" if all_ok else "FAILURES - see DETAIL"))
    text = "\n".join(out) + "\n"
    with open(out_path, "w") as f:
        f.write(text)
    print(text)
    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()
