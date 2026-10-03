"""Central configuration for the Blue Carbon backend.

Everything can be overridden with environment variables so the same code
runs on your laptop, in tests, and on a demo machine.

    GMW_DIR        folder containing the GMW *.tif tiles (searched recursively)
    MODELS_DIR     folder containing trained model files (.joblib / .pkl)
    METRICS_PATH   JSON file with validation metrics + dataset facts
    CORS_ORIGINS   comma separated list of allowed frontend origins
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

# Model input order used during training (as supplied in the project brief).
FEATURES: list[str] = [
    "latitude",
    "longitude",
    "B1",
    "B2",
    "B3",
    "B4",
    "B5",
    "B6",
    "B7",
    "B8",
    "B8A",
    "B9",
    "B11",
    "B12",
    "VV",
    "VH",
]


def _origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS")
    if raw:
        return [o.strip() for o in raw.split(",") if o.strip()]
    return [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ]


@dataclass(frozen=True)
class Settings:
    gmw_dir: Path = field(
        default_factory=lambda: Path(os.getenv("GMW_DIR", BASE_DIR / "data" / "gmw"))
    )
    models_dir: Path = field(
        default_factory=lambda: Path(os.getenv("MODELS_DIR", BASE_DIR / "models"))
    )
    metrics_path: Path = field(
        default_factory=lambda: Path(
            os.getenv("METRICS_PATH", BASE_DIR / "data" / "metrics.json")
        )
    )
    cache_dir: Path = field(
        default_factory=lambda: Path(os.getenv("CACHE_DIR", BASE_DIR / "data" / "cache"))
    )
    cors_origins: list[str] = field(default_factory=_origins)
    preview_pixels: int = int(os.getenv("PREVIEW_PIXELS", "512"))


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
