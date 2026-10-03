"""GIS endpoints backed by the real GMW GeoTIFF tiles.

GET /api/gis/tiles                    -> index of all tiles (id + bounds)
GET /api/gis/tile/{tile_id}           -> metadata read from the GeoTIFF header
GET /api/gis/tile/{tile_id}/stats     -> mangrove pixel statistics (full-resolution pass, cached)
GET /api/gis/tile/{tile_id}/preview   -> PNG preview of the real raster

GMW is a binary mangrove EXTENT product (1 = mangrove). It contains no carbon,
biomass or spectral information.
"""

from __future__ import annotations

import io
import json
import logging
import math
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
import rasterio.windows
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from PIL import Image

from config import get_settings

log = logging.getLogger("bluecarbon.gis")
router = APIRouter(prefix="/api/gis", tags=["GIS"])

_index_lock = threading.Lock()
_compute_lock = threading.Lock()
_index: dict[str, dict[str, Any]] | None = None
_preview_cache: dict[str, tuple[bytes, dict[str, Any]]] = {}
_PREVIEW_CACHE_MAX = 64

# Mangrove colour for the preview (Sea Green from the project palette).
_MANGROVE_RGB = (22, 166, 161)


# ----------------------------------------------------------------------------
# tile discovery / index
# ----------------------------------------------------------------------------

def _tile_files() -> list[Path]:
    root = get_settings().gmw_dir
    if not root.is_dir():
        return []
    files = [p for p in root.rglob("*") if p.suffix.lower() in {".tif", ".tiff"}]
    return sorted(files)


def count_tiles() -> int | None:
    """Fast tile count (no raster opening). None if the data folder is missing."""
    if not get_settings().gmw_dir.is_dir():
        return None
    return len(_tile_files())


def _read_header(path: Path) -> dict[str, Any]:
    with rasterio.open(path) as src:
        b = src.bounds
        return {
            "tile_id": path.stem,
            "file": str(path),
            "crs": src.crs.to_string() if src.crs else None,
            "width": src.width,
            "height": src.height,
            "resolution": [abs(src.res[0]), abs(src.res[1])],
            "nodata": src.nodata,
            "dtype": src.dtypes[0],
            "bounds": {
                "west": b.left,
                "south": b.bottom,
                "east": b.right,
                "north": b.top,
            },
            "center_latitude": (b.bottom + b.top) / 2,
            "center_longitude": (b.left + b.right) / 2,
        }


def _signature(files: list[Path]) -> str:
    newest = max((p.stat().st_mtime for p in files), default=0)
    return f"{len(files)}:{int(newest)}"


def _load_index() -> dict[str, dict[str, Any]]:
    global _index
    with _index_lock:
        if _index is not None:
            return _index

        files = _tile_files()
        if not files:
            _index = {}
            return _index

        settings = get_settings()
        cache_file = settings.cache_dir / "tile_index.json"
        sig = _signature(files)

        if cache_file.is_file():
            try:
                cached = json.loads(cache_file.read_text())
                if cached.get("signature") == sig and Path(next(iter(cached["tiles"].values()))["file"]).exists():
                    _index = cached["tiles"]
                    log.info("Loaded tile index from cache (%d tiles)", len(_index))
                    return _index
            except Exception:  # noqa: BLE001 - rebuild if cache is bad
                log.warning("Tile index cache unreadable, rebuilding")

        log.info("Building tile index for %d tiles ...", len(files))
        tiles: dict[str, dict[str, Any]] = {}
        failures = 0
        with ThreadPoolExecutor(max_workers=8) as pool:
            for path, result in zip(files, pool.map(_safe_header, files)):
                if result is None:
                    failures += 1
                    continue
                tiles[result["tile_id"]] = result
        if failures:
            log.warning("%d tile(s) could not be read and were skipped", failures)

        try:
            settings.cache_dir.mkdir(parents=True, exist_ok=True)
            cache_file.write_text(json.dumps({"signature": sig, "tiles": tiles}))
        except OSError:
            log.warning("Could not write tile index cache")

        _index = tiles
        return _index


def _safe_header(path: Path) -> dict[str, Any] | None:
    try:
        return _read_header(path)
    except Exception:  # noqa: BLE001
        log.exception("Cannot read %s", path)
        return None


def reset_caches() -> None:
    """Used by tests and the verify script."""
    global _index
    with _index_lock:
        _index = None
    _preview_cache.clear()


def _get_tile(tile_id: str) -> dict[str, Any]:
    index = _load_index()
    if not index:
        raise HTTPException(
            status_code=503,
            detail=f"No GMW tiles found in '{get_settings().gmw_dir}'. "
            "Set GMW_DIR or place the .tif files there and restart the backend.",
        )
    tile = index.get(tile_id)
    if tile is None:
        raise HTTPException(status_code=404, detail=f"Tile '{tile_id}' not found")
    return tile


def _public(tile: dict[str, Any]) -> dict[str, Any]:
    """Tile metadata without server file-system paths."""
    return {k: v for k, v in tile.items() if k != "file"}


# ----------------------------------------------------------------------------
# preview + statistics (single full-resolution pass, cached)
# ----------------------------------------------------------------------------

def _compute_preview(tile: dict[str, Any]) -> tuple[bytes, dict[str, Any]]:
    target_px = get_settings().preview_pixels
    width, height = tile["width"], tile["height"]
    factor = max(1, math.ceil(max(width, height) / target_px))
    out_w, out_h = math.ceil(width / factor), math.ceil(height / factor)

    fraction = np.zeros((out_h, out_w), dtype=np.float32)
    mangrove_px = 0
    valid_px = 0
    nodata = tile["nodata"]
    strip = factor * 64

    with rasterio.open(tile["file"]) as src:
        for row in range(0, height, strip):
            rows = min(strip, height - row)
            data = src.read(1, window=rasterio.windows.Window(0, row, width, rows))

            is_mangrove = data == 1
            is_valid = np.ones(data.shape, dtype=bool) if nodata is None else data != nodata
            mangrove_px += int(is_mangrove.sum())
            valid_px += int(is_valid.sum())

            pad_r = (-rows) % factor
            pad_c = (-width) % factor
            if pad_r or pad_c:
                is_mangrove = np.pad(is_mangrove, ((0, pad_r), (0, pad_c)))
            blocks = is_mangrove.reshape(
                is_mangrove.shape[0] // factor, factor, is_mangrove.shape[1] // factor, factor
            )
            frac = blocks.mean(axis=(1, 3), dtype=np.float32)
            r0 = row // factor
            fraction[r0 : r0 + frac.shape[0], :] = frac[:, :out_w]

    # RGBA: teal where any mangrove exists, opacity grows with local coverage.
    alpha = np.where(fraction > 0, 110 + (fraction * 145), 0).astype(np.uint8)
    rgba = np.zeros((out_h, out_w, 4), dtype=np.uint8)
    rgba[..., 0], rgba[..., 1], rgba[..., 2] = _MANGROVE_RGB
    rgba[..., 3] = alpha

    buf = io.BytesIO()
    Image.fromarray(rgba, "RGBA").save(buf, format="PNG", optimize=True)

    stats = {
        "tile_id": tile["tile_id"],
        "mangrove_pixels": mangrove_px,
        "valid_pixels": valid_px,
        "total_pixels": width * height,
        "mangrove_cover_pct": round(100 * mangrove_px / valid_px, 4) if valid_px else 0.0,
        "mangrove_area_ha_approx": _approx_area_ha(tile, mangrove_px),
        "preview_size": [out_w, out_h],
        "downsample_factor": factor,
        "note": "Computed from the real raster (pixel value 1 = mangrove). Area is approximate "
        "(spherical pixel size at the tile centre).",
    }
    return buf.getvalue(), stats


def _approx_area_ha(tile: dict[str, Any], pixels: int) -> float:
    res_x, res_y = tile["resolution"]
    lat = math.radians(tile["center_latitude"])
    metres_per_deg_lat = 111_320.0
    px_area_m2 = (res_y * metres_per_deg_lat) * (res_x * metres_per_deg_lat * math.cos(lat))
    return round(pixels * px_area_m2 / 10_000, 2)


def _preview_for(tile: dict[str, Any]) -> tuple[bytes, dict[str, Any]]:
    key = tile["tile_id"]
    if key in _preview_cache:
        return _preview_cache[key]
    with _compute_lock:  # avoid duplicate heavy passes when preview + stats arrive together
        if key in _preview_cache:
            return _preview_cache[key]
        try:
            result = _compute_preview(tile)
        except Exception as exc:  # noqa: BLE001
            log.exception("Preview failed for %s", key)
            raise HTTPException(status_code=500, detail=f"Could not read raster: {exc}") from exc
        if len(_preview_cache) >= _PREVIEW_CACHE_MAX:
            _preview_cache.pop(next(iter(_preview_cache)))
        _preview_cache[key] = result
        return result


# ----------------------------------------------------------------------------
# routes
# ----------------------------------------------------------------------------

@router.get("/tiles")
def list_tiles() -> dict[str, Any]:
    index = _load_index()
    if not index:
        raise HTTPException(
            status_code=503,
            detail=f"No GMW tiles found in '{get_settings().gmw_dir}'. "
            "Set GMW_DIR or place the .tif files there and restart the backend.",
        )
    tiles = [
        {
            "tile_id": t["tile_id"],
            "bounds": [t["bounds"]["west"], t["bounds"]["south"], t["bounds"]["east"], t["bounds"]["north"]],
        }
        for t in index.values()
    ]
    west = min(t["bounds"][0] for t in tiles)
    south = min(t["bounds"][1] for t in tiles)
    east = max(t["bounds"][2] for t in tiles)
    north = max(t["bounds"][3] for t in tiles)
    return {
        "count": len(tiles),
        "extent": [west, south, east, north],
        "bounds_format": "[west, south, east, north] in EPSG:4326",
        "tiles": tiles,
    }


@router.get("/tile/{tile_id}")
def tile_metadata(tile_id: str) -> dict[str, Any]:
    return _public(_get_tile(tile_id))


@router.get("/tile/{tile_id}/stats")
def tile_stats(tile_id: str) -> dict[str, Any]:
    _, stats = _preview_for(_get_tile(tile_id))
    return stats


@router.get("/tile/{tile_id}/preview")
def tile_preview(tile_id: str) -> Response:
    png, _ = _preview_for(_get_tile(tile_id))
    return Response(
        content=png,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=3600"},
    )
