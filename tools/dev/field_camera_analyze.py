"""Turns a field camera capture into images and measurements.  python3 field_camera_analyze.py <outDir>"""
import json, sys, math
from PIL import Image
out = sys.argv[1]
cap = json.load(open(f"{out}/capture.json"))
planes = cap["spec"]["planes"]
print("world seed:", cap["seed"])
grids = {}
for r in cap["rows"]:
    grids.setdefault(r["plane"], {})[r["z"]] = r["row"]
def color(v):  # heat map: blue -> green -> yellow -> red
    t = v / 15
    stops = [(0, (30, 40, 120)), (0.33, (40, 150, 160)), (0.55, (90, 180, 70)), (0.78, (235, 200, 60)), (1, (200, 50, 40))]
    for (a, ca), (b, cb) in zip(stops, stops[1:]):
        if t <= b:
            f = (t - a) / (b - a); return tuple(round(ca[i] + f * (cb[i] - ca[i])) for i in range(3))
    return stops[-1][1]
for p, plane in enumerate(planes):
    rows = grids.get(p, {}); n = len(rows)
    if not n: print(f"plane {p}: no data"); continue
    size = len(next(iter(rows.values())))
    g = [[(int(c, 16) if c != "." else None) for c in rows[z]] for z in range(n)]
    missing = sum(v is None for row in g for v in row)
    vals = [v for row in g for v in row if v is not None]
    img = Image.new("RGB", (size, n), (255, 0, 255))
    for z in range(n):
        for x in range(size):
            if g[z][x] is not None: img.putpixel((x, z), color(g[z][x]))
    img.resize((size * 3, n * 3), Image.NEAREST).save(f"{out}/plane{p}.png")
    hist = [vals.count(k) for k in range(16)]
    lo, hi = plane["lo"], plane["hi"]; mid = lambda k: lo + (k + 0.5) / 16 * (hi - lo)
    mean = sum(mid(v) for v in vals) / len(vals); sd = math.sqrt(sum((mid(v) - mean) ** 2 for v in vals) / len(vals))
    present = [k for k in range(16) if hist[k]]
    print(f"\nplane {p}  {plane['name']}\n  painted {len(vals)} of {size*n} ({missing} missing)   mean {mean:+.3f}  sd {sd:.3f}   observed range about {mid(present[0])-(hi-lo)/32:+.2f} .. {mid(present[-1])+(hi-lo)/32:+.2f}")
    print("  histogram (16 bands, low to high):", hist)
    grids[p] = g
def same(a, b):
    pairs = [(x, y) for ra, rb in zip(a, b) for x, y in zip(ra, rb) if x is not None and y is not None]
    return sum(x == y for x, y in pairs) / max(1, len(pairs))
if 0 in grids and 3 in grids and isinstance(grids[0], list):
    print(f"\nA vs D (same input shifted by 256 units): {same(grids[0], grids[3])*100:.1f}% of blocks identical")
A = grids.get(0)
if isinstance(A, list):
    # Lattice test: gradient (Perlin) noise is exactly 0 wherever both inputs are whole numbers, i.e. x, z multiples of 16.
    lat = [A[z][x] for z in range(0, len(A), 16) for x in range(0, len(A[0]), 16) if A[z][x] is not None]
    off = [A[z][x] for z in range(8, len(A), 16) for x in range(8, len(A[0]), 16) if A[z][x] is not None]
    print(f"A at whole-number inputs: bands {sorted(set(lat))} (n={len(lat)});  at half-way inputs: bands {sorted(set(off))} (n={len(off)})   [0 lies on the boundary of bands 7|8]")
    # Isotropy: mean absolute step along x vs along z
    sx = [abs(A[z][x+1]-A[z][x]) for z in range(len(A)) for x in range(len(A[0])-1) if None not in (A[z][x], A[z][x+1])]
    sz = [abs(A[z+1][x]-A[z][x]) for z in range(len(A)-1) for x in range(len(A[0])) if None not in (A[z][x], A[z+1][x])]
    print(f"A mean band-step per block: along x {sum(sx)/len(sx):.3f}, along z {sum(sz)/len(sz):.3f}")
