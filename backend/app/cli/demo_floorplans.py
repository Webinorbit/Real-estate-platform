"""Demo floor plans: room geometry is shared by the SVG generator and the seeded tour scenes,
so the "you are here" marker in the viewer lands exactly on the right room."""

PLAN_W = 800
PLAN_H = 520

FLOORPLANS = {
    "villa": {
        "title": "Ground floor",
        "rooms": [
            {"key": "living", "label": "Living room", "x": 40, "y": 40, "w": 380, "h": 250, "fill": "#f4efe6"},
            {"key": "lounge", "label": "Family lounge", "x": 420, "y": 40, "w": 340, "h": 190, "fill": "#eef3f1"},
            {"key": "study", "label": "Study", "x": 420, "y": 230, "w": 340, "h": 130, "fill": "#f3eeea"},
            {"key": "bedroom", "label": "Master bedroom", "x": 40, "y": 290, "w": 380, "h": 190, "fill": "#eef0f6"},
            {"key": "terrace", "label": "Terrace", "x": 420, "y": 360, "w": 340, "h": 120, "fill": "#e9f2e6"},
        ],
    },
    "apartment": {
        "title": "Apartment layout",
        "rooms": [
            {"key": "living", "label": "Living & dining", "x": 40, "y": 60, "w": 400, "h": 280, "fill": "#f4efe6"},
            {"key": "kitchen", "label": "Open kitchen", "x": 440, "y": 60, "w": 320, "h": 160, "fill": "#f2efe9"},
            {"key": "bedroom", "label": "Master bedroom", "x": 440, "y": 220, "w": 320, "h": 240, "fill": "#eef0f6"},
            {"key": "lobby", "label": "Entrance lobby", "x": 40, "y": 340, "w": 400, "h": 120, "fill": "#eef3f1"},
        ],
    },
}


def room_center(plan: str, key: str) -> dict:
    r = next(x for x in FLOORPLANS[plan]["rooms"] if x["key"] == key)
    return {"x": (r["x"] + r["w"] / 2) / PLAN_W, "y": (r["y"] + r["h"] / 2) / PLAN_H}


def _n(v) -> str:
    """Render numbers the way JS template strings do (no trailing .0)."""
    return str(int(v)) if float(v).is_integer() else repr(float(v))


def floorplan_svg(plan: str, accent: str = "#0f766e") -> str:
    d = FLOORPLANS[plan]
    rooms = "\n  ".join(
        f"""<g>
    <rect x="{r['x']}" y="{r['y']}" width="{r['w']}" height="{r['h']}" fill="{r['fill']}" stroke="#1f2937" stroke-width="5" stroke-linejoin="round"/>
    <text x="{_n(r['x'] + r['w'] / 2)}" y="{_n(r['y'] + r['h'] / 2 + 6)}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="20" font-weight="600" fill="#374151">{r['label']}</text>
  </g>"""
        for r in d["rooms"]
    )
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {PLAN_W} {PLAN_H}" width="{PLAN_W}" height="{PLAN_H}">
  <rect width="{PLAN_W}" height="{PLAN_H}" fill="#ffffff"/>
  <defs><pattern id="g" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#eef0f3" stroke-width="1"/></pattern></defs>
  <rect width="{PLAN_W}" height="{PLAN_H}" fill="url(#g)"/>
  {rooms}
  <text x="24" y="28" font-family="Helvetica, Arial, sans-serif" font-size="16" font-weight="700" fill="{accent}">{d['title'].upper()}</text>
</svg>
"""
