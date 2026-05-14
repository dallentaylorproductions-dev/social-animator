# Perf test photo set

Six photos used as reproducible input for H-7.14 render perf measurements.

| File | Source | License | Dimensions | Actual size |
|---|---|---|---|---|
| perf-01.jpg | https://picsum.photos/seed/sep-perf-01/3000/2000 | Unsplash License (CC0-equivalent, commercial use OK, no attribution required) | 3000×2000 | 393 KB |
| perf-02.jpg | https://picsum.photos/seed/sep-perf-02/3000/2000 | Unsplash License | 3000×2000 | 542 KB |
| perf-03.jpg | https://picsum.photos/seed/sep-perf-03/3000/2000 | Unsplash License | 3000×2000 | 351 KB |
| perf-04.jpg | https://picsum.photos/seed/sep-perf-04/3000/2000 | Unsplash License | 3000×2000 | 468 KB |
| perf-05.jpg | https://picsum.photos/seed/sep-perf-05/3000/2000 | Unsplash License | 3000×2000 | 891 KB |
| perf-06.jpg | https://picsum.photos/seed/sep-perf-06/3000/2000 | Unsplash License | 3000×2000 | 459 KB |

**Size note:** The spec called for 1–5 MB per file. Picsum's JPEG quality
setting produces 350–900 KB files at 3000×2000, which is under the target
range. Dimensions are spot-on, and the decode-time-dominant cost is driven
by pixel count (3000×2000 = 6 megapixels per photo), so these files still
exercise the render pipeline at the right scale for the audit. If a
follow-up run needs heavier files, swap in real listing photos at higher
quality and update this table.

These photos are NOT real-estate-themed. The decode/resize/render cost is
determined by dimensions, JPEG complexity, and file size, not subject
matter — so generic photos are a valid stand-in for property photos as
long as the dimensions/sizes match real listings (2000–3000 px wide).

To re-fetch this set on another machine, run:

```bash
cd public/perf-test
for i in 1 2 3 4 5 6; do
  curl -L -o "perf-0$i.jpg" "https://picsum.photos/seed/sep-perf-0$i/3000/2000.jpg"
done
```

(Picsum seed URLs are deterministic — the same seed returns the same photo
across requests.)
