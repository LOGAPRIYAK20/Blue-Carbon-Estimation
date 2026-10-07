"""Blue Carbon Intelligence API  (FastAPI)

Real-Time Blue Carbon Intelligence and MRV System - college PBL prototype.

Run:  uvicorn main:app --reload --port 8000
Docs: http://127.0.0.1:8000/docs
"""

from __future__ import annotations

import json
import logging
from enum import Enum
from functools import lru_cache
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

import gis
import model_service as ms
from config import FEATURES, get_settings

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s: %(message)s")

app = FastAPI(
    title="Blue Carbon Intelligence API",
    description="Backend API for the Real-Time Blue Carbon Intelligence and MRV System",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://blue-carbon-estimation.vercel.app",
        "https://blue-carbon-mrv.klogapriyakumaran20.workers.dev",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(gis.router)


# ----------------------------------------------------------------------------
# metrics file (validation results + dataset facts recorded from the notebooks)
# ----------------------------------------------------------------------------

@lru_cache(maxsize=1)
def _metrics() -> dict[str, Any]:
    path = get_settings().metrics_path
    if not path.is_file():
        raise HTTPException(status_code=503, detail=f"Metrics file not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def _best(kind: str) -> dict[str, Any]:
    m = _metrics()
    wanted = m["best_models"][kind]
    for row in m["performance"][kind]:
        if row["model"] == wanted:
            return row
    raise HTTPException(status_code=500, detail=f"Best model '{wanted}' missing in metrics")


# ----------------------------------------------------------------------------
# basic endpoints
# ----------------------------------------------------------------------------

@app.get("/")
def root() -> dict[str, str]:
    return {"message": "Blue Carbon Intelligence API is running", "status": "success"}


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "healthy", "service": "Blue Carbon ML Backend"}


@app.get("/api/status")
def status() -> dict[str, Any]:
    """What is actually available on this machine (tiles, models)."""
    settings = get_settings()
    tiles = gis.count_tiles()
    models = ms.describe_models()
    return {
        "gmw": {
            "directory": str(settings.gmw_dir),
            "available": bool(tiles),
            "tile_count": tiles,
        },
        "models": {
            **models,
            "vegetation": ms.available_for("vegetation"),
            "total_carbon": ms.available_for("total_carbon"),
            "ready": bool(ms.available_for("vegetation")) and bool(ms.available_for("total_carbon")),
        },
        "features": FEATURES,
    }


@app.get("/api/summary")
def summary() -> dict[str, Any]:
    m = _metrics()
    d = m["dataset"]
    veg, total = _best("vegetation"), _best("total_carbon")
    return {
        "gmw_tiles": gis.count_tiles(),  # counted from the real tile folder; null if missing
        "spatial_samples": d["spatial_samples"],
        "carbon_dataset": d["carbon_observations"],
        "gmw_version": d["gmw_version"],
        "gmw_info": {
            "crs": d["gmw_crs"],
            "raster_size": d["gmw_raster_size"],
            "resolution": d["gmw_resolution"],
            "class": d["gmw_class"],
        },
        "vegetation_model": veg,
        "total_carbon_model": total,
        "validation_note": m["validation_note"],
    }


@app.get("/api/model-performance")
def model_performance() -> dict[str, Any]:
    m = _metrics()
    return {
        "vegetation": m["performance"]["vegetation"],
        "total_carbon": m["performance"]["total_carbon"],
        "best_models": m["best_models"],
        "validation_note": m["validation_note"],
    }


@app.get("/api/features")
def features() -> list[dict[str, Any]]:
    return _metrics()["feature_importance"]["values"]


# ----------------------------------------------------------------------------
# prediction
# ----------------------------------------------------------------------------

class Algorithm(str, Enum):
    random_forest = "random_forest"
    xgboost = "xgboost"
    svm = "svm"


def _f(**kw: Any) -> Any:
    return Field(..., allow_inf_nan=False, **kw)


class PredictionInput(BaseModel):
    """All 16 features are required - missing values are rejected, never zero-filled."""

    model_config = ConfigDict(extra="forbid")

    latitude: float = _f(ge=-90, le=90)
    longitude: float = _f(ge=-180, le=180)
    B1: float = _f()
    B2: float = _f()
    B3: float = _f()
    B4: float = _f()
    B5: float = _f()
    B6: float = _f()
    B7: float = _f()
    B8: float = _f()
    B8A: float = _f()
    B9: float = _f()
    B11: float = _f()
    B12: float = _f()
    VV: float = _f()
    VH: float = _f()


TARGET_INFO = {
    "vegetation": {
        "title": "Vegetation carbon",
        "definition": "cagb + cbgb (above- plus below-ground vegetation carbon)",
    },
    "total_carbon": {
        "title": "Total carbon stock",
        "definition": "total_carbon_stock",
    },
}


def _run_prediction(target: str, payload: PredictionInput, algorithm: Algorithm | None) -> dict[str, Any]:
    preferred = _metrics()["best_models"][target]
    try:
        model = ms.pick_model(target, algorithm.value if algorithm else None, preferred)
        value = ms.predict(model, payload.model_dump())
    except ms.ModelUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return {
        "target": target,
        "target_title": TARGET_INFO[target]["title"],
        "target_definition": TARGET_INFO[target]["definition"],
        "prediction": value,
        "model": model.label,
        "model_file": model.path.name,
        "estimator_class": model.estimator_class,
        "units_note": "Same units as the training target column in the carbon dataset.",
        "coordinates": {"latitude": payload.latitude, "longitude": payload.longitude},
        "inputs": payload.model_dump(),
        "disclaimer": _metrics()["validation_note"],
    }


@app.post("/api/predict/vegetation")
def predict_vegetation(payload: PredictionInput, algorithm: Algorithm | None = None) -> dict[str, Any]:
    return _run_prediction("vegetation", payload, algorithm)


@app.post("/api/predict/total-carbon")
def predict_total_carbon(payload: PredictionInput, algorithm: Algorithm | None = None) -> dict[str, Any]:
    return _run_prediction("total_carbon", payload, algorithm)

