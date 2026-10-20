import test from "node:test";
import assert from "node:assert/strict";
import { mediaSelectionReason, toggleMediaSelection, validateMediaFiles } from "../src/features/admin/media-selection";
import type { MediaItem } from "../src/shared/admin/contracts";

const image: MediaItem = { id: "image-1", name: "Ảnh", kind: "Ảnh", scope: "Toàn dự án", size: "1 KB", hasUploadedFile: true, uploadState: "ready", mimeType: "image/png" };

test("library selection caps batches across pages, allows deselection at capacity and replaces a single logo", () => {
  let selection: MediaItem[] = [];
  for (let index = 1; index <= 5; index++) selection = toggleMediaSelection(selection, { ...image, id: `image-${index}` }, 4);
  assert.deepEqual(selection.map(item => item.id), ["image-1", "image-2", "image-3", "image-4"]);
  selection = toggleMediaSelection(selection, image, 4);
  selection = toggleMediaSelection(selection, { ...image, id: "image-5" }, 4);
  assert.deepEqual(selection.map(item => item.id), ["image-2", "image-3", "image-4", "image-5"]);
  assert.deepEqual(toggleMediaSelection([image], { ...image, id: "logo-2" }, 1).map(item => item.id), ["logo-2"]);
});

test("floor picker prevents protected and cross-floor moves without forbidding logo reuse", () => {
  const protectedImage = { ...image, protectedReason: "Logo đang sử dụng." };
  assert.equal(mediaSelectionReason(protectedImage, "Tầng 1"), protectedImage.protectedReason);
  assert.equal(mediaSelectionReason(protectedImage), undefined);
  assert.match(mediaSelectionReason({ ...image, scope: "Tầng 2" }, "Tầng 1")!, /Tầng 2/);
  assert.equal(mediaSelectionReason({ ...image, scope: "Tầng 1" }, "Tầng 1"), undefined);
  assert.equal(mediaSelectionReason({ ...image, scope: "Chưa xác nhận tầng" }, "Tầng 1"), undefined);
  assert.ok(mediaSelectionReason({ ...image, uploadState: "quarantine" }));
  assert.ok(mediaSelectionReason({ ...image, projectAsset: true }));
});

test("shared file feedback enforces counts, real signatures, raster dimensions and PDF intent", async () => {
  const bytes = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aIwAAAABJRU5ErkJggg==", "base64"));
  const file = new File([bytes], "image.png", { type: "image/png" });
  assert.equal(await validateMediaFiles([file], 1, false), "");
  assert.match(await validateMediaFiles(Array(5).fill(file), 4, false), /tối đa 4/);
  assert.match(await validateMediaFiles([file, file], 1, false), /tối đa 1/);
  assert.match(await validateMediaFiles([new File(["not png"], "fake.png", { type: "image/png" })], 4, false), /không khớp/);
  const bomb = bytes.slice(); new DataView(bomb.buffer).setUint32(16, 4097);
  assert.match(await validateMediaFiles([new File([bomb], "huge.png", { type: "image/png" })], 4, false), /4096/);
  const pdf = new File(["%PDF-1.7\n%%EOF"], "document.pdf", { type: "application/pdf" });
  assert.equal(await validateMediaFiles([pdf], 4, true), "");
  assert.match(await validateMediaFiles([pdf], 1, false), /chỉ nhận PNG/);
  assert.match(await validateMediaFiles([new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.pdf", { type: "application/pdf" })], 4, true), /10 MiB/);
});
