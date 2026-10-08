#!/usr/bin/env python3
"""Generates banner-light.svg, banner-dark.svg and src/social.html. Run: python3 build.py"""
import os
H = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.dirname(H)
FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
SPEC = ["#ff5d6c", "#ffa24a", "#ffd84a", "#4ade80", "#38bdf8", "#8b7bff"]
T = {
 "dark": dict(bg1="#0b0d17", bg2="#151233", glow="#6d5dfc", title="#ffffff", sub="#b6bdd6", card="#171a2b", cardb="#2b3050",
              bar="#1f2340", ink="#e8ebf7", mute="#8189a8", chip="#1d2140", chipt="#c9cfe8", accent="#8b7bff", node="#222747", grid="#2a2f4d"),
 "light": dict(bg1="#f7f8ff", bg2="#e9e6ff", glow="#9a8cff", title="#14172b", sub="#4b5273", card="#ffffff", cardb="#d7daee",
              bar="#eef0fb", ink="#1c2038", mute="#6b7394", chip="#ffffff", chipt="#3b4268", accent="#6a55f5", node="#f0f1fc", grid="#e1e4f4"),
}

def card(x, y, w, h, c, uid):
    bars = [0.45, 0.7, 0.55, 0.9, 0.75]
    bx, by, bw, bh = 28, 70, 190, 110
    s = f'<g transform="translate({x},{y})">'
    s += f'<rect width="{w}" height="{h}" rx="16" fill="{c["card"]}" stroke="{c["cardb"]}" stroke-width="1.5"/>'
    s += f'<rect width="{w}" height="44" rx="16" fill="{c["bar"]}"/><rect y="28" width="{w}" height="16" fill="{c["bar"]}"/>'
    for i, col in enumerate(["#ff5f57", "#febc2e", "#28c840"]):
        s += f'<circle cx="{24+i*18}" cy="22" r="5" fill="{col}"/>'
    s += f'<text x="{w/2}" y="27" text-anchor="middle" font-family="{FONT}" font-size="13" font-weight="600" fill="{c["mute"]}">Q3 Report.md</text>'
    # chart
    s += f'<text x="{bx}" y="{by-6}" font-family="{FONT}" font-size="12" font-weight="700" fill="{c["ink"]}">Revenue</text>'
    for g in range(4):
        s += f'<line x1="{bx}" x2="{bx+bw}" y1="{by+14+g*28}" y2="{by+14+g*28}" stroke="{c["grid"]}" stroke-width="1"/>'
    for i, v in enumerate(bars):
        hh = v * 96; col = SPEC[[0, 1, 3, 4, 5][i]]
        s += f'<rect x="{bx+10+i*36}" y="{by+98-hh}" width="24" height="{hh}" rx="5" fill="{col}"/>'
    # diagram
    dx = 262
    s += f'<text x="{dx}" y="{by-6}" font-family="{FONT}" font-size="12" font-weight="700" fill="{c["ink"]}">Flow</text>'
    s += f'<g stroke="{c["mute"]}" stroke-width="1.8" fill="none"><path d="M{dx+40} {by+30} L{dx+40} {by+54} L{dx+14} {by+78}"/><path d="M{dx+40} {by+54} L{dx+86} {by+78}"/><path d="M{dx+14} {by+96} L{dx+14} {by+100}"/></g>'
    def node(nx, ny, nw, t, col, f=True):
        return (f'<rect x="{nx}" y="{ny}" width="{nw}" height="24" rx="8" fill="{c["node"]}" stroke="{col}" stroke-width="2"/>'
                f'<text x="{nx+nw/2}" y="{ny+16}" text-anchor="middle" font-family="{FONT}" font-size="11" font-weight="600" fill="{c["ink"]}">{t}</text>')
    s += node(dx+8, by+8, 64, "Agent", SPEC[5]) + node(dx-22, by+72, 62, "Render", SPEC[4]) + node(dx+58, by+72, 56, "Fix", SPEC[0])
    s += f'<path d="M{dx+86} {by+96} Q{dx+86} {by+112} {dx+30} {by+112} L{dx+14} {by+112} L{dx+14} {by+98}" stroke="{c["mute"]}" stroke-width="1.5" fill="none" stroke-dasharray="4 3"/>'
    # formula
    fy = 220
    s += f'<rect x="28" y="{fy}" width="{w-56}" height="{h-fy-28}" rx="12" fill="{c["bar"]}"/>'
    ty = fy + (h-fy-28)/2 + 8
    s += (f'<text x="{w/2-70}" y="{ty}" text-anchor="middle" font-family="Georgia, serif" font-size="26" font-style="italic" fill="{c["ink"]}">e<tspan font-size="16" dy="-10">iπ</tspan><tspan dy="10" font-style="normal"> + 1 = 0</tspan></text>')
    s += f'<line x1="{w/2+10}" x2="{w/2+10}" y1="{ty-22}" y2="{ty+8}" stroke="{c["cardb"]}" stroke-width="2"/>'
    s += f'<text x="{w/2+100}" y="{ty}" text-anchor="middle" font-family="Georgia, serif" font-size="24" fill="{c["mute"]}">∫ <tspan font-style="italic">f</tspan>(x) dx</text>'
    s += '</g>'
    return s

def prism_logo(x, y, s, c, uid):
    # triangle with beam in and spectrum out
    t = f'<g transform="translate({x},{y}) scale({s})">'
    t += f'<line x1="-60" y1="62" x2="30" y2="46" stroke="{c["title"]}" stroke-width="3" stroke-linecap="round" opacity="0.9"/>'
    for i, col in enumerate(SPEC):
        t += f'<line x1="60" y1="44" x2="{150}" y2="{12+i*14}" stroke="{col}" stroke-width="4" stroke-linecap="round" opacity="0.95"/>'
    t += f'<path d="M45 4 L88 80 L2 80 Z" fill="url(#pg{uid})" stroke="{c["title"]}" stroke-width="3" stroke-linejoin="round"/>'
    t += '</g>'
    return t

def scene(W, H, theme, uid, layout):
    c = T[theme]
    s = f'<defs><linearGradient id="bg{uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{c["bg1"]}"/><stop offset="1" stop-color="{c["bg2"]}"/></linearGradient>'
    s += f'<radialGradient id="gl{uid}" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="{c["glow"]}" stop-opacity="{0.45 if theme=="dark" else 0.35}"/><stop offset="1" stop-color="{c["glow"]}" stop-opacity="0"/></radialGradient>'
    s += f'<linearGradient id="pg{uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{c["accent"]}" stop-opacity="0.55"/><stop offset="1" stop-color="{c["accent"]}" stop-opacity="0.12"/></linearGradient>'
    s += f'<filter id="sh{uid}" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#000" flood-opacity="{0.45 if theme=="dark" else 0.16}"/></filter></defs>'
    s += f'<rect width="{W}" height="{H}" fill="url(#bg{uid})"/>'
    if layout == "banner":
        cx, cy, cw, ch, tx, ty, ts, ss = 1000, 70, 520, 360, 80, 0, 1, 1
        s += f'<ellipse cx="1260" cy="250" rx="420" ry="300" fill="url(#gl{uid})"/>'
        pad = 0
        # spectrum rays flowing into the card
        for i, col in enumerate(SPEC):
            s += f'<path d="M700 {250+ (i-2.5)*4} C 800 {250+(i-2.5)*30}, 900 {250+(i-2.5)*70}, {cx} {110+i*46}" stroke="{col}" stroke-width="3" fill="none" opacity="0.55" stroke-linecap="round"/>'
        s += prism_logo(80, 78, 0.62, c, uid)
        s += f'<text x="80" y="230" font-family="{FONT}" font-size="92" font-weight="800" letter-spacing="-3" fill="{c["title"]}">Prism</text>'
        s += f'<text x="82" y="288" font-family="{FONT}" font-size="25" font-weight="600" fill="{c["title"]}">Let your AI agent draw in Obsidian</text>'
        s += f'<text x="82" y="322" font-family="{FONT}" font-size="25" font-weight="400" fill="{c["sub"]}">and see its own mistakes.</text>'
        x = 82
        for t, w in [("Offline", 84), ("Theme-aware", 128), ("Sandboxed", 106), ("render → error → fix", 178)]:
            s += (f'<rect x="{x}" y="364" width="{w}" height="34" rx="17" fill="{c["chip"]}" stroke="{c["cardb"]}"/>'
                  f'<text x="{x+w/2}" y="386" text-anchor="middle" font-family="{FONT}" font-size="14" font-weight="600" fill="{c["chipt"]}">{t}</text>')
            x += w + 10
        s += f'<g filter="url(#sh{uid})">{card(cx, cy, cw, ch, c, uid)}</g>'
    else:  # social 1280x640, content inside 1100x520 safe area
        cx, cy, cw, ch = 690, 130, 500, 380
        s += f'<ellipse cx="930" cy="330" rx="480" ry="340" fill="url(#gl{uid})"/>'
        for i, col in enumerate(SPEC):
            s += f'<path d="M560 {320+(i-2.5)*4} C 620 {320+(i-2.5)*30}, 650 {320+(i-2.5)*60}, {cx} {170+i*44}" stroke="{col}" stroke-width="3" fill="none" opacity="0.55" stroke-linecap="round"/>'
        s += prism_logo(110, 150, 0.7, c, uid)
        s += f'<text x="108" y="320" font-family="{FONT}" font-size="112" font-weight="800" letter-spacing="-4" fill="{c["title"]}">Prism</text>'
        s += f'<text x="112" y="378" font-family="{FONT}" font-size="27" font-weight="600" fill="{c["title"]}">Let your AI agent draw in Obsidian</text>'
        s += f'<text x="112" y="414" font-family="{FONT}" font-size="27" font-weight="400" fill="{c["sub"]}">and see its own mistakes.</text>'
        x = 112
        for t, w in [("Offline", 84), ("Theme-aware", 128), ("Sandboxed", 106)]:
            s += (f'<rect x="{x}" y="452" width="{w}" height="34" rx="17" fill="{c["chip"]}" stroke="{c["cardb"]}"/>'
                  f'<text x="{x+w/2}" y="474" text-anchor="middle" font-family="{FONT}" font-size="14" font-weight="600" fill="{c["chipt"]}">{t}</text>')
            x += w + 10
        s += f'<g filter="url(#sh{uid})">{card(cx, cy, cw, ch, c, uid)}</g>'
    return s

def svg(W, H, theme, uid, layout):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-label="Prism: let your AI agent draw in Obsidian and see its own mistakes.">{scene(W,H,theme,uid,layout)}</svg>\n'

for th in ("light", "dark"):
    open(f"{OUT}/banner-{th}.svg", "w").write(svg(1600, 500, th, th[0], "banner"))
open(f"{H}/social.html", "w").write('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#0b0d17}svg{display:block}</style>' + svg(1280, 640, "dark", "s", "social"))
