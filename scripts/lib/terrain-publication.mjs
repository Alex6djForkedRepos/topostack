import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

/** Validate the content-addressed offline manifest before accepting its records. */
export function validateTerrainRegistrySnapshot(catalog, manifestBytes) {
  const { releaseManifest, ...payload } = catalog;
  const digest = createHash("sha256").update(manifestBytes).digest("hex");
  if (catalog.registryVersion !== 1 || releaseManifest !== `terrain-releases/${digest}.json` ||
      !isDeepStrictEqual(payload, JSON.parse(manifestBytes.toString("utf8")))) {
    throw new Error("Terrain registry manifest mismatch.");
  }
}

import { validateTerrainArchiveBounds } from "../../packages/core/src/source-catalog.ts";

/** Run before any remote mutation. Legacy receipts remain usable only by pinned hash. */
export function validateTerrainPublication({ source, header, metadata, receipt, sha256, bytes, pin, legacy = false }) {
  validateTerrainArchiveBounds(header.bounds, source.bounds);
  if (header.tile_type !== "png" || header.maxzoom !== source.maxZoom ||
      !Number.isInteger(header.minzoom) || header.minzoom < 0 || header.minzoom > source.minZoom ||
      metadata.topostack_dataset !== source.id || metadata.topostack_encoding !== source.encoding ||
      metadata.topostack_vertical_datum !== source.verticalDatum) throw new Error("Terrain archive contract mismatch.");
  if (!receipt || receipt.dataset !== source.id || !/^[a-f0-9]{64}$/.test(receipt.sha256) ||
      receipt.sha256 !== sha256 || receipt.bytes !== bytes || !Number.isInteger(receipt.tiles) || receipt.tiles <= 0) {
    throw new Error("Missing or mismatched terrain build receipt.");
  }
  if (!Array.isArray(receipt.grids) || receipt.grids.length !== 1) throw new Error("Expected one bounded terrain snapshot.");
  validateTerrainArchiveBounds(receipt.grids[0].bounds, source.bounds);
  if (!pin || !Array.isArray(receipt.sources) || receipt.sources.length !== 1 ||
      Object.entries(pin).some(([key, value]) => receipt.sources[0][key] !== value) ||
      !["snapshotSha256", "samplesSha256"].every((key) => /^[a-f0-9]{64}$/.test(receipt.sources[0][key] ?? "")) ||
      metadata.topostack_source_item !== pin.item || metadata.topostack_source_etag !== pin.etag ||
      pin.verticalDatum !== source.verticalDatum || pin.sourceResolutionM !== source.nativeResolutionM) {
    throw new Error("Terrain receipt does not match pinned inputs.");
  }
  if (receipt.schemaVersion === undefined && legacy) return;
  const coverage = receipt.coverage;
  if (receipt.schemaVersion !== 1 || receipt.encoding !== source.encoding || receipt.verticalDatum !== source.verticalDatum ||
      receipt.verticalUnits !== "metre" || !coverage || !Number.isInteger(coverage.validSamples) ||
      !Number.isInteger(coverage.totalSamples) || coverage.validSamples <= 0 || coverage.validSamples > coverage.totalSamples) {
    throw new Error("Terrain receipt requires measured coverage and normalization metadata.");
  }
}
