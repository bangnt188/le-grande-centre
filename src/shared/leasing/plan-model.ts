import type { Floor, SlotStatus } from "../admin/space-model";

export type PlanPoint = Readonly<{ x: number; y: number }>;

/** Coordinates are local to the declared plan canvas. Optional points are local to the shape box. */
export type PlanGeometry = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
  points?: readonly PlanPoint[];
  labelPosition?: Readonly<{ x: number; y: number }>;
}>;

export type PlanFeature = Readonly<{
  code: string;
  kind: string;
  label: string;
  geometry: PlanGeometry;
}>;

export type PlanSlot = Readonly<{
  id: string;
  code: string;
  geometry: PlanGeometry;
  area?: number;
  dimensions?: Readonly<{ width: number; depth: number }> | null;
  status?: SlotStatus;
}>;

export type PlanOrientation = Readonly<{
  front: string;
  rear: string;
  lakeSide: string;
  waterworksSide: string;
  sourceUrl: string;
}>;

export type FloorPlan = Readonly<{
  floor: Floor;
  versionId: string;
  coordinateSystem: string;
  canvasWidth: number;
  canvasHeight: number;
  sourceDocument: string | null;
  sourcePage: number | null;
  sourceSheet: string | null;
  orientation: PlanOrientation | null;
  features: readonly PlanFeature[];
  slots: readonly PlanSlot[];
}>;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid floor plan projection.");
  return value as Record<string, unknown>;
}

function boundedText(value: unknown, max: number, optional = false): string | null {
  if (optional && value === null) return null;
  if (typeof value !== "string" || value.trim() !== value || value.length > max || (!optional && value.length === 0)) {
    throw new Error("Invalid floor plan text.");
  }
  return value;
}

function number(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error("Invalid floor plan coordinate.");
  return value;
}

export function parsePlanGeometry(value: unknown, canvasWidth: number, canvasHeight: number): PlanGeometry {
  const row = object(value);
  const x = number(row.x, 0, canvasWidth);
  const y = number(row.y, 0, canvasHeight);
  const width = number(row.width, 0.001, canvasWidth);
  const height = number(row.height, 0.001, canvasHeight);
  if (x + width > canvasWidth + 0.001 || y + height > canvasHeight + 0.001) throw new Error("Floor plan geometry exceeds its canvas.");

  let points: PlanPoint[] | undefined;
  if (row.points !== undefined) {
    if (!Array.isArray(row.points) || row.points.length < 3 || row.points.length > 64) throw new Error("Invalid floor plan polygon.");
    points = row.points.map(point => {
      if (!Array.isArray(point) || point.length !== 2) throw new Error("Invalid floor plan polygon point.");
      return { x: number(point[0], 0, width), y: number(point[1], 0, height) };
    });
  }

  let labelPosition: PlanGeometry["labelPosition"];
  if (row.labelPosition !== undefined) {
    const label = object(row.labelPosition);
    labelPosition = { x: number(label.x, 0, 100), y: number(label.y, 0, 100) };
  }

  return { x, y, width, height, ...(points ? { points } : {}), ...(labelPosition ? { labelPosition } : {}) };
}

export function parseFloorPlan(value: unknown, expectedFloor?: Floor): FloorPlan {
  const row = object(value);
  const floor = number(row.floor, 1, 6) as Floor;
  if (expectedFloor !== undefined && floor !== expectedFloor) throw new Error("Floor plan floor mismatch.");
  const canvasWidth = number(row.canvasWidth, 1, 10000);
  const canvasHeight = number(row.canvasHeight, 1, 10000);
  if (!Array.isArray(row.features) || row.features.length > 500 || !Array.isArray(row.slots) || row.slots.length > 1000) {
    throw new Error("Invalid floor plan contents.");
  }
  const features = row.features.map(value => {
    const feature = object(value);
    return {
      code: boundedText(feature.code, 80)!,
      kind: boundedText(feature.kind, 40)!,
      label: boundedText(feature.label, 200)!,
      geometry: parsePlanGeometry(feature.geometry, canvasWidth, canvasHeight),
    };
  });
  const slots = row.slots.map((value): PlanSlot => {
    const slot = object(value);
    const area = slot.area === undefined ? undefined : number(slot.area, 0, 1000000);
    const measured = slot.dimensions == null ? null : object(slot.dimensions);
    const dimensions = measured ? {
      width: number(measured.width, Number.MIN_VALUE, Number.MAX_VALUE),
      depth: number(measured.depth, Number.MIN_VALUE, Number.MAX_VALUE),
    } : null;
    const status = slot.status;
    if (status !== undefined && status !== "Còn trống" && status !== "Trống" && status !== "Liên hệ" && status !== "Đã thuê" && status !== "Đang thuê") {
      throw new Error("Invalid floor plan slot status.");
    }
    return {
      id: boundedText(slot.id, 80)!,
      code: boundedText(slot.code, 80)!,
      geometry: parsePlanGeometry(slot.geometry, canvasWidth, canvasHeight),
      ...(area === undefined ? {} : { area }),
      dimensions,
      ...(status === undefined ? {} : { status }),
    };
  });

  const sourcePage = row.sourcePage === null ? null : number(row.sourcePage, 1, 10000);
  let orientation: PlanOrientation | null = null;
  if (row.orientation !== null) {
    const facts = object(row.orientation), sourceUrl = boundedText(facts.sourceUrl, 2048)!;
    let parsedUrl: URL;
    try { parsedUrl = new URL(sourceUrl); } catch { throw new Error("Invalid floor plan orientation source."); }
    if (parsedUrl.protocol !== "https:" || parsedUrl.username || parsedUrl.password) throw new Error("Invalid floor plan orientation source.");
    orientation = {
      front: boundedText(facts.front, 120)!,
      rear: boundedText(facts.rear, 120)!,
      lakeSide: boundedText(facts.lakeSide, 120)!,
      waterworksSide: boundedText(facts.waterworksSide, 120)!,
      sourceUrl,
    };
  }
  const sourceDocument = boundedText(row.sourceDocument, 240, true);
  if (sourceDocument !== null && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,239}$/.test(sourceDocument)) {
    throw new Error("Invalid floor plan source document.");
  }
  return {
    floor,
    versionId: boundedText(row.versionId, 80)!,
    coordinateSystem: boundedText(row.coordinateSystem, 120)!,
    canvasWidth,
    canvasHeight,
    sourceDocument,
    sourcePage,
    sourceSheet: boundedText(row.sourceSheet, 80, true),
    orientation,
    features,
    slots,
  };
}
