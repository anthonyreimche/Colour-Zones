# Colour Zones for Safelight

A [Safelight](https://github.com/anthonyreimche/SafeLight) extension that ports
[**darktable**](https://www.darktable.org/)'s *color zones* module: three
curves that change a pixel's lightness, chroma and hue, drawn over its
lightness, chroma or hue. Darken the blues and keep the skin, desaturate
everything but red, turn greens towards yellow, lift the shadows' colour:
darktable's maths, presets, pickers and node gestures.

## What it does

Every pixel is read in D50 Lab. Its **selector** (lightness, chroma or hue,
your choice) picks a point on each of the three curves, and the pixel changes
by the curves' heights there:

```
L' = L · 2^(4 · (lightness curve − 0.5))     two stops either way
C' = C · 2 · chroma curve                    grey at the bottom, double at the top
h' = h + (hue curve − 0.5)                   half a turn either way
```

So the centre line leaves a pixel as it is.

### The panel

- **Presets**: darktable's six: *B&W: with red*, *B&W: with skin tones*,
  *Polarizing filter*, *Natural skin tones*, *B&W: film* and *HSL base
  setting*. Each sets every control.
- **Lightness / Chroma / Hue**: the tabs pick the curve you edit. The graph
  shows all three, the edited one bright.
- **Show colour** and **Create curve**: the pickers. Click a point on the
  photo or drag an area. *Show colour* marks the picked colour on the graph
  (its mean as a line, its range as a band) and colours the graph from it.
  *Create curve* also rebuilds the edited curve around it: flat by default,
  raised with **Alt**, lowered with **Shift**. Both read the photo as Colour
  Zones receives it, and stay on until you press the button again or Esc.
- **The graph.** The selector runs left to right, the edited quantity bottom
  to top, over darktable's colour cells: what the curve does to a sample
  colour at each point. Under it, a bar of the selector's colours. Gestures
  follow darktable's:
  - hover a node to pick it, and drag it to move it;
  - drag where there is no node to add one there and drag it;
  - **Ctrl+click** adds a node on the curve;
  - **right-click** removes the picked node, **Ctrl+right-click** puts it back
    on the centre line;
  - **double-click** resets the curve;
  - the **arrow keys** nudge the picked node by 0.001.
  Nodes keep at least 0.0025 apart, and there are at most twenty per curve.
- **Edit by area**: dragging pulls every node near the pointer towards it,
  more the nearer it is (a Gaussian as wide as the circle); the **wheel** sizes
  the circle. Arrows under the plot mark the nodes: drag one to slide its node
  along the axis.
- **Select by**: *Lightness*, *Chroma* or *Hue*. Hue wraps around, so the
  curves' two ends meet. Changing it starts every curve over, as in darktable.
- **Process mode**: *Smooth* (the default) or *Strong*, darktable's two pixel
  routines. Smooth reads chroma at C / 128 and, selecting by hue, fades the
  lightness and hue curves out towards grey, where hue means little. Strong
  reads chroma at C / (128 · √2), clamped, and applies every curve in full.
- **Mix** (−200 to 200 %): stretches every node away from the centre line by
  this much, so 100 % doubles the curves' effect and −100 % flattens them.
- **Interpolation method**: the edited curve's: *Cubic spline*, *Centripetal
  spline* (the default) or *Monotonic spline*. Each curve keeps its own.

**In masks:** add Colour Zones to a mask from the Masking panel's Adjust tab
to apply curves inside that mask only. The pickers work on the photo's own
panel.

**Defaults:** darktable's: select by hue, smooth, mix 0, three centripetal
curves of two nodes on the centre line. An untouched module renders the photo
bit for bit unchanged (the renderer leaves it out altogether), and the dock
header's *Reset to defaults* gives that back.

## The math

Faithful to darktable 5.6.1's `src/iop/colorzones.c` (params version 5,
version 2 splines) and `src/common/splines.cpp`:

- commit_params' `strength()` on every node, `y + (y − 0.5) · mix / 100`;
- the three spline rules (smooth cubic with natural or periodic ends,
  Catmull–Rom tangents, Fritsch–Carlson monotone, and the weighted harmonic
  variant darktable uses around hue's period), clamped to [0, 1];
- each curve as darktable's table reads it: at `selector · 65536/65535`, held
  at the ends, rounded to the table's 16 bits;
- `process_v3` (smooth) and `process_v1` (strong);
- darktable's Bradford-adapted sRGB → XYZ D50 matrix, its D50 white and the
  CIE Lab constants;
- `init_presets()`, the node gestures, `dt_iop_colorzones_get_params` (edit by
  area) and `color_picker_apply` (create curve).

### How it maps onto Safelight

darktable runs color zones in the Lab section of its pipeline, on the
display-referred image. Safelight's equivalent is its display-adjust phase:
the stage runs on the display-encoded colour after the tone pipeline, after
the Colour Correction port when that is installed (darktable's order). Per
pixel it decodes with the host's transfer function, converts to D50 Lab,
applies the curves, and encodes back, unclipped. Each spline is solved once
whenever its curve changes and stored in the photo's edit beside its nodes;
the shader only evaluates them. Presets, copy and paste and undo carry both
like any slider.

### Differences from darktable

- **Strong mode, selecting by hue, on neutral greys.** Strong mode applies
  the lightness curve in full at the pixel's hue, and a grey has none: its
  hue comes from the rounding of the RGB → Lab matrix. darktable's comes from
  its working profile's matrix (on a linear Rec.709 profile it lands near
  cyan); this port's from darktable's sRGB matrix, which puts every grey near
  violet. With a lightness curve that differs between those hues, greys come
  out differently. Every colour with any chroma matches.
- When the mix pushes an end node above 1 or below 0 and that node isn't on
  the graph's edge (lightness and chroma only), darktable stores the value
  beyond the node in a 16-bit integer that wraps around, so 1.2 reads back as
  0.2 and −0.2 as 0.8. This port clamps to 1 and 0 instead.
- The create-curve picker raises the curve with Alt, where darktable uses
  Ctrl: Safelight keeps Ctrl, ⌘ and Space for panning and zooming the photo.
- Selecting by hue, a node can't be added within 0.0025 of the other end
  across the wrap; darktable allows it, and the curve then has a piece of
  zero width.
- The pickers read the photo as cropped. While the crop tool shows the whole
  photo, a pick lands off the point you clicked.
- Not ported: the *display selection* mask, the graph's zoom, the histogram
  behind the graph, the wheel moving a node outside edit by area, and
  darktable's per-colour shortcuts.

### Tests

```bash
npm install
npm run check    # typecheck, build, then test
```

The unit tests pin the curves and the pixel path against darktable's own
code: `test/reference/dt_ref.cpp` compiles darktable's `splines.cpp`, its
curve sampler and color zones' `commit_params`, `lookup`, `process_v3`,
`process_v1` and `init_presets` as they are, over 28 sets of curves and
darktable's six presets, on 1,085 Lab pixels
(`node test/reference/build.cjs` regenerates `vectors.json`; it needs g++).
The curves agree to one step of darktable's 16-bit table and each pixel to
what one step does to it; the presets match darktable's to single precision.
A line-by-line transcription of the shader, reading only what the photo's
edit stores, gives the same pixels to 1e-9. The panel's controls, graph
gestures, edit by area and pickers are tested too.

The shader was checked on Safelight's real renderer against `darktable-cli`
5.6.1 renders of a synthetic chart, 23 cases: each curve by each axis, all
three at once, every interpolation, both process modes, the mix, a node at
hue 1, single nodes and all six presets. Largest difference 2·10⁻³ in linear
values (on values above 2; the rig's half-float floor), ΔE2000 at most 0.064,
except strong mode by hue on the neutral greys described above.

## Licence

GPL-3.0-or-later, as the darktable code it ports.
