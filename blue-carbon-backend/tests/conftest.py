"""Test fixtures.

These create SYNTHETIC tiles and models inside a temp folder purely to exercise
the code paths. They are never shipped as project data and never touch your
real GMW tiles or trained models.
"""
import os
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import pytest
import rasterio
from rasterio.transform import from_origin
from sklearn.ensemble import RandomForestRegressor

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

FEATURES = ["latitude", "longitude", "B1", "B2", "B3", "B4", "B5", "B6", "B7",
            "B8", "B8A", "B9", "B11", "B12", "VV", "VH"]


def _write_tile(path: Path, west: float, north: float, size: int = 400):
    data = np.zeros((size, size), dtype="uint8")
    data[100:200, 50:150] = 1  # 10,000 mangrove pixels
    transform = from_origin(west, north, 1.0 / size, 1.0 / size)
    with rasterio.open(path, "w", driver="GTiff", height=size, width=size, count=1,
                       dtype="uint8", crs="EPSG:4326", transform=transform, nodata=0) as dst:
        dst.write(data, 1)


@pytest.fixture(scope="session")
def client(tmp_path_factory):
    root = tmp_path_factory.mktemp("bc")
    gmw, models = root / "gmw", root / "models"
    gmw.mkdir(); models.mkdir()
    _write_tile(gmw / "GMW_TEST_A.tif", 100.0, 6.0)
    _write_tile(gmw / "GMW_TEST_B.tif", 101.0, 6.0)

    rng = np.random.default_rng(0)
    X = pd.DataFrame(rng.normal(size=(60, 16)), columns=FEATURES)
    for name, y in (("vegetation_rf.joblib", X["B4"] * 3 + 10), ("total_carbon_rf.joblib", X["B4"] * 9 + 100)):
        rf = RandomForestRegressor(n_estimators=10, random_state=0).fit(X, y)
        joblib.dump(rf, models / name)

    os.environ["GMW_DIR"] = str(gmw)
    os.environ["MODELS_DIR"] = str(models)
    os.environ["CACHE_DIR"] = str(root / "cache")

    from config import get_settings
    get_settings.cache_clear()
    import gis, model_service
    gis.reset_caches()
    model_service.get_registry(force_reload=True)

    from fastapi.testclient import TestClient
    from main import app
    return TestClient(app)


@pytest.fixture()
def valid_payload():
    return {f: 0.1 for f in FEATURES} | {"latitude": 6.5, "longitude": 100.5}
