import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const TILE_STYLE = {
  color: "#0b5d7a",
  weight: 0.6,
  fillColor: "#16a6a1",
  fillOpacity: 0.12,
};

const SELECTED_STYLE = {
  color: "#f5b301",
  weight: 3,
  fillColor: "#f5b301",
  fillOpacity: 0.08,
};

const toLeafletBounds = ([west, south, east, north]) => [
  [south, west],
  [north, east],
];

/**
 * Leaflet map showing every GMW tile boundary.
 *
 * Props
 *  - tiles:        [{ tile_id, bounds: [w, s, e, n] }]
 *  - extent:       [w, s, e, n] of all tiles
 *  - selectedId:   currently selected tile id (or null)
 *  - previewUrl:   object URL of the raster preview PNG for the selected tile
 *  - onSelect(id): called when the user clicks a tile
 */
export default function GisMap({
  tiles,
  extent,
  selectedId,
  previewUrl,
  onSelect,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef(new Map());
  const overlayRef = useRef(null);
  const onSelectRef = useRef(onSelect);

  // Always call the latest onSelect without rebuilding the map.
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // ---- create map + tile rectangles (once per tile list) ----
  useEffect(() => {
    const map = L.map(containerRef.current, {
      preferCanvas: true,
      worldCopyJump: true,
      minZoom: 2,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);

    const renderer = L.canvas({ padding: 0.5 });
    const layers = layersRef.current;

    tiles.forEach((tile) => {
      const rect = L.rectangle(toLeafletBounds(tile.bounds), {
        ...TILE_STYLE,
        renderer,
      });

      rect.bindTooltip(tile.tile_id, { sticky: true });
      rect.on("click", () => onSelectRef.current(tile.tile_id));
      rect.addTo(map);
      layers.set(tile.tile_id, rect);
    });

    if (extent) {
      map.fitBounds(toLeafletBounds(extent), { padding: [20, 20] });
    } else {
      map.setView([10, 100], 3);
    }

    mapRef.current = map;

    // Keep the map correct when the layout changes (sidebar, rotate phone).
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      map.remove();
      layers.clear();
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, [tiles, extent]);

  // ---- highlight selected tile ----
  useEffect(() => {
    const map = mapRef.current;
    const layers = layersRef.current;
    if (!map) return;

    layers.forEach((rect, id) => {
      const isSelected = id === selectedId;
      rect.setStyle(isSelected ? SELECTED_STYLE : TILE_STYLE);
      if (isSelected) rect.bringToFront();
    });

    const selected = layers.get(selectedId);
    if (selected) {
      map.flyToBounds(selected.getBounds(), {
        padding: [30, 30],
        maxZoom: 9,
        duration: 0.8,
      });
    }
  }, [selectedId, tiles, extent]);

  // ---- raster preview overlay ----
  useEffect(() => {
    const map = mapRef.current;
    const rect = layersRef.current.get(selectedId);
    if (!map) return;

    if (overlayRef.current) {
      map.removeLayer(overlayRef.current);
      overlayRef.current = null;
    }

    if (previewUrl && rect) {
      overlayRef.current = L.imageOverlay(previewUrl, rect.getBounds(), {
        opacity: 0.9,
        interactive: false,
      }).addTo(map);
    }
  }, [previewUrl, selectedId, tiles, extent]);

  return (
    <div
      ref={containerRef}
      className="gis-map"
      role="application"
      aria-label="Map of Global Mangrove Watch tiles"
    />
  );
}
