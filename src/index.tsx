// Colour Zones, a Safelight extension (GPL-3.0-or-later).
//
// darktable's color zones: lightness, chroma and hue curves over the pixel's
// lightness, chroma or hue. Registers the display-adjust stage (stage.ts),
// the Develop panel (Panel.tsx), which also edits a mask's curves in the
// Masking panel, and the on-image picker (Overlay.tsx).

import { ZonesOverlay } from "./Overlay";
import { ColourZonesPanel } from "./Panel";
import { EXT_ID, PARAM_KEYS, STAGE_ID, qualified, resetPatch } from "./params";
import { api, initRuntime } from "./rt";
import type { SafelightAPI } from "./safelight";
import { zonesStage } from "./stage";
import { initStore, store } from "./store";

export const PANEL_ID = `${EXT_ID}.panel`;
export const OVERLAY_ID = `${EXT_ID}.overlay`;

// Null until activate() runs.
let activeHost: SafelightAPI | null = null;

function reset(): void {
  const dev = api.stores.useDevelopStore.getState();
  dev.setDynParams(resetPatch());
  void dev.commitEdit("Colour Zones reset");
}

export function activate(host: SafelightAPI): void {
  initRuntime(host);
  initStore();
  activeHost = host;
  // While every node sits on the centre line `active` is 0: the renderer
  // leaves the stage out, so an untouched photo renders bit for bit unchanged.
  host.registerProcessingStage(zonesStage());
  host.registerPanel({
    id: PANEL_ID,
    title: "Colour Zones",
    component: ColourZonesPanel,
    defaultDock: { module: "develop", direction: "right", width: 268 },
    onReset: reset,
    mask: { component: ColourZonesPanel, owns: PARAM_KEYS.map(qualified) },
  });
  host.registerSlot({ id: OVERLAY_ID, slot: "develop-canvas-overlay", component: ZonesOverlay, order: 60 });
}

export function deactivate(): void {
  const host = activeHost;
  if (!host) return;
  activeHost = null;
  // A throw here would skip the host's sweep of this extension's
  // registrations, so a failure is logged instead.
  try {
    store().getState().setPicker(null);
    host.unregisterProcessingStage(STAGE_ID);
    host.unregisterSlot(OVERLAY_ID);
  } catch (err) {
    console.warn("[colour-zones] deactivate failed:", err);
  }
}
