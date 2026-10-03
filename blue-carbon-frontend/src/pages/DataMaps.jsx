import { useEffect, useState } from "react";

import GisMap from "../components/GisMap";
import { ErrorBox, Loading, Notice, PageTitle } from "../components/common";
import { useApi } from "../hooks/useApi";
import {
  getTile,
  getTilePreviewUrl,
  getTileStats,
  getTiles,
} from "../api";

const fmt = (n, d = 6) => (typeof n === "number" ? n.toFixed(d) : "—");

/**
 * Loads metadata, statistics and the raster preview for one tile.
 * Each result is stored together with the tile id it belongs to, so
 * "loading" is derived (no result for the current tile yet) and stale
 * responses from a previously selected tile are never shown.
 */
function useTileDetails(tileId) {
  const [metaRes, setMetaRes] = useState(null);
  const [statsRes, setStatsRes] = useState(null);
  const [previewRes, setPreviewRes] = useState(null);

  useEffect(() => {
    if (!tileId) return undefined;

    const controller = new AbortController();
    const { signal } = controller;
    let objectUrl = null;
    let active = true;

    const ok = (setter, key) => (value) => {
      if (active) setter({ id: tileId, [key]: value, error: "" });
    };
    const fail = (setter) => (e) => {
      if (active && e.name !== "AbortError") {
        setter({ id: tileId, error: e.message });
      }
    };

    getTile(tileId, signal).then(ok(setMetaRes, "data")).catch(fail(setMetaRes));
    getTileStats(tileId, signal)
      .then(ok(setStatsRes, "data"))
      .catch(fail(setStatsRes));

    getTilePreviewUrl(tileId, signal)
      .then((url) => {
        if (!active) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setPreviewRes({ id: tileId, url, error: "" });
      })
      .catch(fail(setPreviewRes));

    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [tileId]);

  const view = (res, key) => {
    const current = tileId && res?.id === tileId ? res : null;
    return {
      [key]: current?.[key] ?? null,
      error: current?.error ?? "",
      loading: Boolean(tileId) && !current,
    };
  };

  return {
    meta: view(metaRes, "data"),
    stats: view(statsRes, "data"),
    preview: view(previewRes, "url"),
  };
}

export default function DataMaps({ summary, onUseLocation }) {
  const fetchTiles = useApi(getTiles);
  const [selectedId, setSelectedId] = useState(null);
  const { meta, stats, preview } = useTileDetails(selectedId);

  const tilesData = fetchTiles.data;
  const tile = meta.data;

  const handleUse = () => {
    if (!tile) return;
    onUseLocation({
      tileId: tile.tile_id,
      latitude: Number(tile.center_latitude.toFixed(6)),
      longitude: Number(tile.center_longitude.toFixed(6)),
      stamp: Date.now(),
    });
  };

  return (
    <>
      <PageTitle
        eyebrow="GEOSPATIAL INTELLIGENCE"
        title="Data & Maps"
        description="Browse the real Global Mangrove Watch tiles, inspect a raster preview and send a tile location to Carbon Prediction."
      />

      <div className="data-summary">
        <div>
          <span>GMW TILES LOADED</span>
          <strong>
            {fetchTiles.loading
              ? "..."
              : tilesData?.count?.toLocaleString() ?? "—"}
          </strong>
        </div>
        <div>
          <span>SPATIAL SAMPLES</span>
          <strong>{summary?.spatial_samples?.toLocaleString() ?? "—"}</strong>
        </div>
        <div>
          <span>CARBON OBSERVATIONS</span>
          <strong>{summary?.carbon_dataset?.toLocaleString() ?? "—"}</strong>
        </div>
      </div>

      <div className="gis-layout">
        {/* ---------------- MAP ---------------- */}
        <div className="panel gis-map-panel">
          <div className="map-toolbar">
            <div>
              <h2>Global Mangrove Watch tiles</h2>
              <p>
                {selectedId
                  ? `Selected: ${selectedId}`
                  : "Click a tile boundary to select it"}
              </p>
            </div>
            {selectedId && (
              <button
                type="button"
                className="clear-btn"
                onClick={() => setSelectedId(null)}
              >
                Clear selection
              </button>
            )}
          </div>

          <div className="gis-map-wrap">
            {fetchTiles.loading && <Loading label="Loading GMW tiles..." />}

            {fetchTiles.error && (
              <ErrorBox
                message={fetchTiles.error}
                onRetry={fetchTiles.retry}
              />
            )}

            {tilesData && (
              <GisMap
                tiles={tilesData.tiles}
                extent={tilesData.extent}
                selectedId={selectedId}
                previewUrl={preview.url}
                onSelect={setSelectedId}
              />
            )}

            {selectedId && preview.loading && (
              <div className="map-badge">Loading raster preview...</div>
            )}
          </div>

          <div className="map-legend-row">
            <span>
              <i className="swatch swatch-tile"></i> GMW tile boundary
            </span>
            <span>
              <i className="swatch swatch-selected"></i> Selected tile
            </span>
            <span>
              <i className="swatch swatch-mangrove"></i> Mangrove (raster value 1)
            </span>
          </div>
        </div>

        {/* ---------------- DETAILS ---------------- */}
        <aside className="panel tile-panel">
          <div className="tile-panel-head">
            <h2>Tile information</h2>
            <p>Read from the real GeoTIFF header</p>
          </div>

          {!selectedId && (
            <div className="tile-empty">
              <div>⌁</div>
              Select a tile on the map to see its raster preview and metadata.
            </div>
          )}

          {selectedId && meta.loading && <Loading label="Reading tile..." />}
          {meta.error && <ErrorBox message={meta.error} />}

          {tile && (
            <dl className="tile-details">
              <Row label="Tile ID" value={tile.tile_id} />
              <Row label="CRS" value={tile.crs} />
              <Row
                label="Raster size"
                value={`${tile.width.toLocaleString()} × ${tile.height.toLocaleString()} px`}
              />
              <Row
                label="Resolution"
                value={`${tile.resolution[0]} × ${tile.resolution[1]}°`}
              />
              <Row
                label="NoData"
                value={tile.nodata === null ? "none" : String(tile.nodata)}
              />
              <Row
                label="Bounds"
                value={`W ${fmt(tile.bounds.west, 4)}  E ${fmt(tile.bounds.east, 4)}\nS ${fmt(tile.bounds.south, 4)}  N ${fmt(tile.bounds.north, 4)}`}
                multiline
              />
              <Row label="Center latitude" value={fmt(tile.center_latitude)} />
              <Row label="Center longitude" value={fmt(tile.center_longitude)} />
            </dl>
          )}

          {selectedId && (
            <div className="tile-stats">
              <h3>Mangrove coverage (this tile)</h3>
              {stats.loading && <Loading label="Scanning raster..." />}
              {stats.error && <ErrorBox message={stats.error} />}
              {stats.data && (
                <>
                  <div className="coverage-bar" aria-hidden="true">
                    <div
                      style={{
                        width: `${Math.min(100, Math.max(0.5, stats.data.mangrove_cover_pct))}%`,
                      }}
                    ></div>
                  </div>
                  <dl className="tile-details">
                    <Row
                      label="Mangrove pixels"
                      value={stats.data.mangrove_pixels.toLocaleString()}
                    />
                    <Row
                      label="Coverage"
                      value={`${stats.data.mangrove_cover_pct}%`}
                    />
                    <Row
                      label="Approx. area"
                      value={`${stats.data.mangrove_area_ha_approx.toLocaleString()} ha`}
                    />
                  </dl>
                </>
              )}
            </div>
          )}

          {preview.error && <ErrorBox message={preview.error} />}

          <button
            type="button"
            className="primary-btn full use-location-btn"
            disabled={!tile}
            onClick={handleUse}
          >
            Use Location for Prediction →
          </button>

          <Notice>
            GMW shows where mangroves occur. It is binary extent data and does
            not contain carbon, biomass or satellite spectral values.
          </Notice>
        </aside>
      </div>
    </>
  );
}

function Row({ label, value, multiline }) {
  return (
    <div className="tile-row">
      <dt>{label}</dt>
      <dd className={multiline ? "pre" : ""}>{value}</dd>
    </div>
  );
}
