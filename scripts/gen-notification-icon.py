import os
from PIL import Image

SRC = os.path.join(os.path.dirname(__file__), "..", "public", "push-notification.png")
RES = os.path.join(os.path.dirname(__file__), "..", "android", "app", "src", "main", "res")

# Standard Android notification (status bar) icon sizes.
DENSITIES = {
    "mdpi": 24,
    "hdpi": 36,
    "xhdpi": 48,
    "xxhdpi": 72,
    "xxxhdpi": 96,
}

# Android renders small/status-bar icons using only the alpha channel, painted
# solid white — so a flat "any opaque pixel -> white" conversion collapses
# this two-tone (purple ink / white background) logo into a single blob with
# no internal detail. Instead treat the purple "ink" pixels as the opaque
# silhouette and the white background/highlight pixels as transparent, so
# checkmarks and line detail survive as negative-space cutouts.
LUMA_THRESHOLD = 170

img = Image.open(SRC).convert("RGBA")
px = img.load()
w0, h0 = img.size
mask = Image.new("L", (w0, h0), 0)
mpx = mask.load()
for y in range(h0):
    for x in range(w0):
        r, g, b, a = px[x, y]
        if a < 16:
            continue
        luma = 0.299 * r + 0.587 * g + 0.114 * b
        if luma < LUMA_THRESHOLD:
            mpx[x, y] = a

bbox = mask.getbbox()
cropped = mask.crop(bbox)
w, h = cropped.size

# Pad to a square canvas with ~16% margin on the longer side, matching
# Android's status-bar icon safe-area convention.
side = int(max(w, h) * 1.32)
canvas_alpha = Image.new("L", (side, side), 0)
canvas_alpha.paste(cropped, ((side - w) // 2, (side - h) // 2))

white = Image.new("RGBA", (side, side), (255, 255, 255, 0))
white.putalpha(canvas_alpha)

for density, size in DENSITIES.items():
    out_dir = os.path.join(RES, f"drawable-{density}")
    os.makedirs(out_dir, exist_ok=True)
    resized = white.resize((size, size), Image.LANCZOS)
    resized.save(os.path.join(out_dir, "ic_stat_notify.png"))

print("done", side)
