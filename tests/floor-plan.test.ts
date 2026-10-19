import assert from "node:assert/strict";
import test from "node:test";
import { parseFloorPlan } from "../src/shared/leasing/plan-model";

const slot = { id: "slot-a1", code: "A.1", area: 152, geometry: { x: 0, y: 0, width: 80, height: 190 } };
const plan = { floor: 1, versionId: "reference-1", coordinateSystem: "reference", canvasWidth: 1000, canvasHeight: 250, sourceDocument: null, sourcePage: null, sourceSheet: null, orientation: null, features: [] };

test("map dimensions retain measured width/depth and never derive missing values from geometry or area", () => {
  const parse = (dimensions?: unknown) => parseFloorPlan({ ...plan, slots: [{ ...slot, dimensions }] }).slots[0];
  assert.deepEqual(parse({ width: 8, depth: 19 }).dimensions, { width: 8, depth: 19 });
  assert.equal(parse().dimensions, null);
  assert.equal(parse(null).dimensions, null);
  for (const dimensions of [{ width: 0, depth: 19 }, { width: 8, depth: -1 }, { width: NaN, depth: 19 }, { width: 8, depth: Infinity }, { width: 8 }, "8 × 19"]) {
    assert.throws(() => parse(dimensions));
  }
});
