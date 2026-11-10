// A stand-in Safelight API for unit tests, over real React and zustand. It has
// only what this extension uses: reading any other member throws, naming it,
// so a test shows what to add here when the extension starts using more.
//
// The photo's edit is a param bag in a zustand store, so a panel re-renders
// when it changes. Reads fall back to the defaults of the registered stages'
// uniforms, as Safelight's do. Core's Slider is a stub that keeps the props it
// was last drawn with, so a test can drive a drag and its release. The UI kit
// pieces the panel uses are plain DOM (a <label>, a <select>, buttons), so
// Testing Library can drive them. The develop store holds the same bag, with
// what the header's reset and the picker use. `getParams` reads the bag as it
// is now, as the host's does, which a drag faster than React's renders
// relies on. A test can open the panel as a mask's (`maskId`), set the
// displayed image rect, and hand the picker a frame.

import * as React from "react";
import { create } from "zustand";
import type {
  ButtonProps,
  DevelopParams,
  FieldProps,
  FloatCaptureOptions,
  FloatFrame,
  PanelContribution,
  ParamScope,
  ProcessingStageContribution,
  RowProps,
  SafelightAPI,
  SegmentedControlProps,
  SelectProps,
  SliderProps,
  SlotContribution,
  StackProps,
  ToggleProps,
} from "../../src/safelight";
import { EXT_ID as EXTENSION_ID } from "../../src/params";

/** The members of SafelightAPI this fake implements, typed against the real thing. */
type FakeMembers = Pick<
  SafelightAPI,
  | "version"
  | "extensionId"
  | "react"
  | "registerPanel"
  | "registerProcessingStage"
  | "unregisterProcessingStage"
  | "registerSlot"
  | "unregisterSlot"
> & {
  components: Pick<SafelightAPI["components"], "Slider" | "PickerIcon">;
  cursors: Pick<SafelightAPI["cursors"], "resolve">;
  develop: Pick<SafelightAPI["develop"], "useParamScope" | "useDevelopOverlay" | "renderPhotoFloatFrame">;
  ui: Pick<SafelightAPI["ui"], "Button" | "Field" | "Row" | "SegmentedControl" | "Select" | "Stack" | "Toggle" | "tokens">;
  stores: Pick<SafelightAPI["stores"], "create" | "useDevelopStore">;
};

export interface FloatRender {
  photoId: string;
  options: FloatCaptureOptions | undefined;
}

export interface Rig {
  api: SafelightAPI;
  panels: PanelContribution[];
  stages: ProcessingStageContribution[];
  slots: SlotContribution[];
  /** The photo's param bag, by qualified key, without defaults. */
  params(): Readonly<Record<string, unknown>>;
  /** The labels of the undo steps the extension made, in order. */
  commits: string[];
  /** The latest props of each slider drawn in `root`, in document order. */
  sliders(root: ParentNode): SliderProps[];
  /** The stage ids and slot ids unregistered, in order. */
  unregistered: string[];
  /** Replaces the photo's bag from outside the panel, as an undo would. */
  replace(params: Record<string, unknown>): void;
  /** Panels drawn from now on edit this mask's scope (null: the photo's). */
  setMask(maskId: string | null): void;
  /** The displayed image rect the canvas overlay sees. */
  setImageRect(rect: { x: number; y: number; w: number; h: number } | null): void;
  /** What renderPhotoFloatFrame answers, and what it was asked. */
  setFloatFrame(frame: FloatFrame | null): void;
  floatRenders: FloatRender[];
  /** Marks a settled render, as the host's histogram update does. */
  settle(): void;
}

export function fakeApi(initial: Record<string, unknown> = {}): Rig {
  const panels: PanelContribution[] = [];
  const stages: ProcessingStageContribution[] = [];
  const slots: SlotContribution[] = [];
  const commits: string[] = [];
  const defaults = new Map<string, unknown>();
  const photo = create<{ params: Record<string, unknown>; histogram: object }>()(() => ({ params: { ...initial }, histogram: {} }));
  const sliderProps = new Map<number, SliderProps>();
  const unregistered: string[] = [];
  const floatRenders: FloatRender[] = [];
  let floatFrame: FloatFrame | null = null;
  let maskId: string | null = null;
  let imageRect: { x: number; y: number; w: number; h: number } | null = null;
  let nextSlider = 0;

  const setBag = (patch: Record<string, unknown>) =>
    photo.setState((s) => {
      const next = { ...s.params, ...patch };
      for (const [key, value] of Object.entries(patch)) if (value === undefined) delete next[key];
      return { params: next };
    });

  function useParamScope(): ParamScope {
    const params = photo((s) => s.params);
    return {
      maskId,
      getParam: (key) => (key in params ? params[key] : defaults.get(key)),
      getParams: () => photo.getState().params,
      setParams: setBag,
      commit: (label) => void commits.push(label),
    };
  }

  function Slider(props: SliderProps) {
    const id = React.useRef(nextSlider++).current;
    sliderProps.set(id, props);
    return React.createElement("div", { "data-slider": id }, `${props.label} ${props.value}`);
  }

  // The develop state the extension reads, over the same bag.
  const developParams = {} as DevelopParams;
  const developState = () => ({
    photoId: "photo-1",
    params: developParams,
    previewParams: null,
    paramBag: photo.getState().params,
    histogram: photo.getState().histogram,
    setDynParams: setBag,
    commitEdit: async (label: string) => void commits.push(label),
  });
  type DevelopView = ReturnType<typeof developState>;
  const developStore = {
    getState: developState,
    subscribe: (fn: (state: DevelopView, prev: DevelopView) => void) => {
      let prev = developState();
      return photo.subscribe(() => {
        const next = developState();
        fn(next, prev);
        prev = next;
      });
    },
  };

  const members: FakeMembers = {
    version: 1,
    extensionId: EXTENSION_ID,
    react: React,
    registerPanel: (c) => void panels.push(c),
    registerProcessingStage: (c) => {
      stages.push(c);
      for (const u of c.uniforms) defaults.set(`${c.id}.${u.key}`, u.default);
    },
    unregisterProcessingStage: (id) => void unregistered.push(id),
    registerSlot: (c) => void slots.push(c),
    unregisterSlot: (id) => void unregistered.push(id),
    components: { Slider, PickerIcon: () => React.createElement("i", { "data-icon": "picker" }) },
    cursors: { resolve: (token) => token },
    develop: {
      useParamScope,
      useDevelopOverlay: () => ({ rect: imageRect, nonce: 0 }) as ReturnType<SafelightAPI["develop"]["useDevelopOverlay"]>,
      renderPhotoFloatFrame: async (photoId, _params, options) => {
        floatRenders.push({ photoId, options });
        return floatFrame;
      },
    },
    ui: ui as unknown as FakeMembers["ui"],
    stores: { create, useDevelopStore: developStore as unknown as SafelightAPI["stores"]["useDevelopStore"] },
  };

  return {
    api: strict(members, "api") as unknown as SafelightAPI,
    panels,
    stages,
    slots,
    params: () => photo.getState().params,
    commits,
    unregistered,
    replace: (params) => photo.setState({ params: { ...params } }),
    setMask: (id) => void (maskId = id),
    setImageRect: (rect) => void (imageRect = rect),
    setFloatFrame: (frame) => void (floatFrame = frame),
    floatRenders,
    settle: () => photo.setState({ histogram: {} }),
    sliders: (root) =>
      [...root.querySelectorAll("[data-slider]")].map((el) => {
        const props = sliderProps.get(Number(el.getAttribute("data-slider")));
        if (!props) throw new Error("a slider without props");
        return props;
      }),
  };
}

const e = React.createElement;

const ui = {
  Button: ({ active, size: _size, variant: _variant, full: _full, ...rest }: ButtonProps) =>
    e("button", { ...rest, "data-active": active ? "true" : "false" }),
  Field: (props: FieldProps) => e("label", null, props.label, props.children),
  Row: (props: RowProps) => e("div", null, props.children),
  SegmentedControl: (props: SegmentedControlProps) =>
    e(
      "div",
      { role: "tablist" },
      ...props.options.map((o) =>
        e("button", { key: o.value, role: "tab", "aria-selected": o.value === props.value, onClick: () => props.onChange(o.value) }, o.label),
      ),
    ),
  Select: (props: SelectProps) =>
    e(
      "select",
      { "aria-label": props.ariaLabel, value: props.value, onChange: (ev: React.ChangeEvent<HTMLSelectElement>) => props.onChange(ev.target.value) },
      props.placeholder !== undefined ? e("option", { value: "" }, props.placeholder) : null,
      ...(props.options ?? []).map((o) => e("option", { key: o.value, value: o.value }, o.label)),
    ),
  Stack: (props: StackProps) => e("div", null, props.children),
  Toggle: (props: ToggleProps) =>
    e(
      "label",
      null,
      props.label,
      e("input", { type: "checkbox", checked: props.checked, onChange: (ev: React.ChangeEvent<HTMLInputElement>) => props.onChange(ev.target.checked) }),
    ),
  tokens: { textSecondary: "var(--color-text-secondary)" },
};

/** Wraps a plain object so reading a member it lacks throws, naming the member. */
function strict<T extends object>(target: T, path: string): T {
  return new Proxy(target, {
    get(obj, key, receiver) {
      if (typeof key === "symbol" || key === "then" || key === "toJSON") return Reflect.get(obj, key, receiver);
      if (!(key in obj)) throw new Error(`The fake API has no ${path}.${key}. Add it to test/support/fake-api.ts.`);
      const value: unknown = Reflect.get(obj, key, receiver);
      const isPlainObject = typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;
      return isPlainObject && key !== "react" ? strict(value, `${path}.${key}`) : value;
    },
  });
}
