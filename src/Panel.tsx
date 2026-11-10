// The Colour Zones panel in darktable's order and wording: a preset menu;
// the lightness, chroma and hue tabs that pick the curve to edit, with the
// two pickers; the graph; edit by area; then select by, process mode, mix
// and the edited curve's interpolation method. Choosing another axis starts
// every curve over, as darktable's select-by does (_reset_parameters). A
// drag writes the scope live and commits on release, so one gesture is one
// undo step.
//
// It edits whatever useParamScope hands it: the photo's bag in the dock, a
// mask's in the Masking panel's Adjust tab. The pickers read and write the
// photo, so a mask's panel doesn't show them.

import { ZonesGraph } from "./Graph";
import {
  CHANNELS,
  INTERPOLATIONS,
  MODES,
  STRENGTH_LIMIT,
  resetParams,
  withCurve,
  type Channel,
  type Interpolation,
  type Mode,
  type Params,
} from "./model";
import { bagPatch, readParams } from "./params";
import { PRESETS } from "./presets";
import { React, api } from "./rt";
import { store, type PickerMode } from "./store";

const CHANNEL_OPTIONS = [
  { value: String(CHANNELS.lightness), label: "Lightness" },
  { value: String(CHANNELS.chroma), label: "Chroma" },
  { value: String(CHANNELS.hue), label: "Hue" },
];

const MODE_OPTIONS = [
  { value: String(MODES.smooth), label: "Smooth" },
  { value: String(MODES.strong), label: "Strong" },
];

const INTERPOLATION_OPTIONS = [
  { value: String(INTERPOLATIONS.cubic), label: "Cubic spline" },
  { value: String(INTERPOLATIONS.centripetal), label: "Centripetal spline" },
  { value: String(INTERPOLATIONS.monotone), label: "Monotonic spline" },
];

const PICKER_TIPS: Record<Exclude<PickerMode, null>, string> = {
  show: "Show a colour from the image on the graph. Click a point or drag an area; Esc ends.",
  create:
    "Create the curve from an area of the image. Drag for a flat curve, Alt+drag to raise it, Shift+drag to lower it; Esc ends.",
};

export function ColourZonesPanel() {
  const { useEffect } = React;
  const { Slider, PickerIcon } = api.components;
  const { Button, Field, Row, SegmentedControl, Select, Stack, Toggle } = api.ui;
  const scope = api.develop.useParamScope();
  const channel = store()((s) => s.channel);
  const editByArea = store()((s) => s.editByArea);
  const picker = store()((s) => s.picker);
  const inMask = scope.maskId !== null;
  const p = readParams(scope.getParams());
  const live = (): Params => readParams(scope.getParams());
  const apply = (next: Params) => scope.setParams(bagPatch(next));
  const commit = (what: string) => scope.commit(`Colour Zones ${what}`);

  // A picker belongs to the dock's panel: closing it ends the picker.
  useEffect(() => {
    if (inMask) return;
    return () => store().getState().setPicker(null);
  }, [inMask]);

  const choice = (label: string, value: number, options: { value: string; label: string }[], pick: (v: number) => void) => (
    <Field label={label}>
      <Select ariaLabel={label} value={String(value)} options={options} onChange={(v) => pick(Number(v))} />
    </Field>
  );

  const pickerButton = (mode: Exclude<PickerMode, null>, label: string) => (
    <Button
      size="sm"
      active={picker === mode}
      title={PICKER_TIPS[mode]}
      aria-pressed={picker === mode}
      onClick={() => store().getState().setPicker(picker === mode ? null : mode)}
    >
      <Row gap={4} align="center">
        <PickerIcon size={12} />
        {label}
      </Row>
    </Button>
  );

  return (
    <Stack gap={6} style={{ padding: 8 }}>
      <Select
        ariaLabel="Colour Zones preset"
        value=""
        placeholder="Presets"
        options={PRESETS.map((pr) => ({ value: pr.id, label: pr.label }))}
        onChange={(id) => {
          const preset = PRESETS.find((pr) => pr.id === id);
          if (!preset) return;
          apply(preset.params);
          commit(`preset: ${preset.label}`);
        }}
      />
      <SegmentedControl
        size="sm"
        value={String(channel)}
        options={CHANNEL_OPTIONS}
        onChange={(v) => store().getState().setChannel(Number(v) as Channel)}
      />
      {inMask ? null : (
        <Row gap={6}>
          {pickerButton("show", "Show colour")}
          {pickerButton("create", "Create curve")}
        </Row>
      )}
      <ZonesGraph />
      <Toggle label="Edit by area" checked={editByArea} onChange={(on) => store().getState().setEditByArea(on)} />
      {choice("Select by", p.selectBy, CHANNEL_OPTIONS, (v) => {
        apply(resetParams(v as Channel));
        commit("select by");
      })}
      {choice("Process mode", p.mode, MODE_OPTIONS, (v) => {
        apply({ ...live(), mode: v as Mode });
        commit("process mode");
      })}
      <Slider
        label="Mix"
        value={p.strength}
        min={-STRENGTH_LIMIT}
        max={STRENGTH_LIMIT}
        step={1}
        defaultValue={0}
        onChange={(v) => apply({ ...live(), strength: v })}
        onCommit={() => commit("mix")}
      />
      {choice("Interpolation method", p.curves[channel].interpolation, INTERPOLATION_OPTIONS, (v) => {
        const cur = live();
        apply(withCurve(cur, channel, { ...cur.curves[channel], interpolation: v as Interpolation }));
        commit("interpolation");
      })}
    </Stack>
  );
}
