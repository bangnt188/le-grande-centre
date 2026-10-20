import assert from "node:assert/strict";
import test from "node:test";
import { parsePublicWebsite } from "../src/shared/public/parse-website";
import { DEFAULT_WEBSITE_SETTINGS } from "../src/shared/admin/website-defaults";
import { publicBuildEnv } from "../scripts/public-build-env.mjs";

const projection = () => ({
  website: { ...DEFAULT_WEBSITE_SETTINGS }, logoUrl: null, tenants: [],
  floors: [{
    number: 1, publicTitle: "Tầng 1", publicDescription: "Nội dung công khai",
    plan: {
      floor: 1, versionId: "plan-v1", coordinateSystem: "diagram-reference",
      canvasWidth: 100, canvasHeight: 100, sourceDocument: null, sourcePage: null,
      sourceSheet: null, orientation: null, features: [], slots: [],
    },
  }],
  units: [{
    id: "6bd43851-f9b6-4c37-8448-92c78df62a4d", code: "A.1", floor: 1, area: 100,
    status: "Còn trống", geometry: { x: 0, y: 0, width: 10, height: 10 },
    types: [], orientation: "", dimensions: null, note: "",
  }],
});

test("public prerender data cannot carry private API fields into pages", () => {
  const expected = projection();
  const input = {
    ...expected, companies: [{ email: "private@example.test" }],
    website: { ...expected.website, sessionToken: "private-token" },
    units: expected.units.map(unit => ({ ...unit, tenant: "Private tenant", rent: 1234, businessStatus: "Đang thương lượng" })),
  };
  const before = structuredClone(input);
  assert.deepEqual(parsePublicWebsite(input), expected);
  assert.doesNotMatch(JSON.stringify(parsePublicWebsite(input)), /businessStatus|Đang thương lượng/);
  assert.deepEqual(input, before);
});

test("malformed public projections fail instead of producing a cached fallback", () => {
  for (const input of [
    null, { ...projection(), website: null }, { ...projection(), units: {} },
    { ...projection(), logoUrl: "javascript:alert(1)" },
    { ...projection(), units: [{ ...projection().units[0], floor: 7 }] },
    { ...projection(), units: [{ ...projection().units[0], area: NaN }] },
    { ...projection(), units: [{ ...projection().units[0], status: "private-state" }] },
    { ...projection(), units: [{ ...projection().units[0], status: "Đang thương lượng", businessStatus: "Đang thương lượng" }] },
    { ...projection(), floors: [{ ...projection().floors[0], plan: { ...projection().floors[0].plan, slots: [{ id: "private", code: "A.5", geometry: { x: 0, y: 0, width: 1, height: 1 }, status: "Đang thương lượng" }] } }] },
  ]) assert.throws(() => parsePublicWebsite(input));
});

test("changed build content has a different cache identity and strips private fields", async () => {
  const first = projection(), changed = projection();
  changed.floors[0].publicTitle = "Nội dung mới";
  const a = await publicBuildEnv({ LE_GRANDE_BUILD_PUBLIC_WEBSITE: JSON.stringify({ ...first, privateRecords: ["secret"] }) });
  const b = await publicBuildEnv({ LE_GRANDE_BUILD_PUBLIC_WEBSITE: JSON.stringify(changed) });
  assert.notEqual(a.LE_GRANDE_BUILD_PUBLIC_WEBSITE_KEY, b.LE_GRANDE_BUILD_PUBLIC_WEBSITE_KEY);
  assert.deepEqual(JSON.parse(a.LE_GRANDE_BUILD_PUBLIC_WEBSITE), first);
  await assert.rejects(publicBuildEnv({ LE_GRANDE_BUILD_PUBLIC_WEBSITE: "{}" }));
});
