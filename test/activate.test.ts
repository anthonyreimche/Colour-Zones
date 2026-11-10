// What activate() registers: the stage, the panel (with its mask sub-panel)
// and the picker's canvas overlay, all named under the manifest's id;
// deactivate() takes the stage and the overlay back out.

import { describe, expect, it } from "vitest";
import manifest from "../safelight.json";
import { OVERLAY_ID, PANEL_ID, activate, deactivate } from "../src/index";
import { ZonesOverlay } from "../src/Overlay";
import { ColourZonesPanel } from "../src/Panel";
import { EXT_ID, PARAM_KEYS, STAGE_ID, qualified } from "../src/params";
import { fakeApi } from "./support/fake-api";

describe("activate", () => {
  it("registers the stage", () => {
    const rig = fakeApi();
    activate(rig.api);
    expect(rig.stages.map((s) => s.id)).toEqual([STAGE_ID]);
  });

  it("registers the panel in Develop, and for masks over every param", () => {
    const rig = fakeApi();
    activate(rig.api);
    expect(rig.panels).toHaveLength(1);
    expect(rig.panels[0]).toMatchObject({
      id: PANEL_ID,
      title: "Colour Zones",
      component: ColourZonesPanel,
      defaultDock: { module: "develop", direction: "right" },
      mask: { component: ColourZonesPanel, owns: PARAM_KEYS.map(qualified) },
    });
  });

  it("registers the picker's overlay on the develop canvas", () => {
    const rig = fakeApi();
    activate(rig.api);
    expect(rig.slots).toEqual([expect.objectContaining({ id: OVERLAY_ID, slot: "develop-canvas-overlay", component: ZonesOverlay })]);
  });

  it("names its contributions under the manifest's id", () => {
    expect(EXT_ID).toBe(manifest.id);
    expect(PANEL_ID.startsWith(`${manifest.id}.`)).toBe(true);
    expect(STAGE_ID.startsWith(`${manifest.id}.`)).toBe(true);
    expect(OVERLAY_ID.startsWith(`${manifest.id}.`)).toBe(true);
  });

  it("resets to the defaults from the panel header", () => {
    const rig = fakeApi({ [qualified("strength")]: 50 });
    activate(rig.api);
    rig.panels[0].onReset?.();
    expect(rig.params()[qualified("strength")]).toBe(0);
    expect(rig.commits).toEqual(["Colour Zones reset"]);
  });

  it("unregisters the stage and the overlay on deactivate, once", () => {
    const rig = fakeApi();
    activate(rig.api);
    deactivate();
    deactivate();
    expect(rig.unregistered).toEqual([STAGE_ID, OVERLAY_ID]);
  });
});
