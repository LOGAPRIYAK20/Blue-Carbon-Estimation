import pytest


def test_summary_counts_tiles_from_disk(client):
    r = client.get("/api/summary")
    assert r.status_code == 200
    body = r.json()
    assert body["gmw_tiles"] == 2            # counted from the folder, not hardcoded
    assert body["carbon_dataset"] == 300
    assert body["spatial_samples"] == 27817
    assert body["vegetation_model"]["model"] == "Random Forest"
    assert body["total_carbon_model"]["model"] == "XGBoost"


def test_model_performance_and_features(client):
    perf = client.get("/api/model-performance").json()
    assert len(perf["vegetation"]) == 3 and len(perf["total_carbon"]) == 3
    assert {"r2", "rmse", "mae", "model"} <= perf["vegetation"][0].keys()
    feats = client.get("/api/features").json()
    assert len(feats) == 16


def test_status_reports_models(client):
    s = client.get("/api/status").json()
    assert s["gmw"]["available"] and s["gmw"]["tile_count"] == 2
    assert s["models"]["vegetation"] == ["random_forest"]
    assert s["models"]["ready"] is True


def test_tiles_index(client):
    r = client.get("/api/gis/tiles").json()
    assert r["count"] == 2
    assert r["tiles"][0]["bounds"] == pytest.approx([100.0, 5.0, 101.0, 6.0])
    assert r["extent"] == pytest.approx([100.0, 5.0, 102.0, 6.0])


def test_tile_metadata(client):
    t = client.get("/api/gis/tile/GMW_TEST_A").json()
    assert t["crs"] == "EPSG:4326"
    assert (t["width"], t["height"]) == (400, 400)
    assert t["nodata"] == 0
    assert t["center_latitude"] == pytest.approx(5.5)
    assert t["center_longitude"] == pytest.approx(100.5)
    assert "file" not in t                    # no server paths leaked


def test_tile_not_found_and_path_traversal(client):
    assert client.get("/api/gis/tile/nope").status_code == 404
    assert client.get("/api/gis/tile/..%2F..%2Fetc%2Fpasswd/preview").status_code in (404, 422)


def test_tile_stats_exact(client):
    s = client.get("/api/gis/tile/GMW_TEST_A/stats").json()
    assert s["mangrove_pixels"] == 10000
    assert s["total_pixels"] == 160000


def test_tile_preview_png(client):
    r = client.get("/api/gis/tile/GMW_TEST_A/preview")
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"
    assert r.content[:8] == b"\x89PNG\r\n\x1a\n"


@pytest.mark.parametrize("path", ["/api/predict/vegetation", "/api/predict/total-carbon"])
def test_predict_ok(client, valid_payload, path):
    r = client.post(path, json=valid_payload)
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body["prediction"], float)
    assert body["coordinates"] == {"latitude": 6.5, "longitude": 100.5}
    assert body["estimator_class"] == "RandomForestRegressor"


def test_prediction_comes_from_the_model_not_constants(client, valid_payload):
    a = client.post("/api/predict/vegetation", json=valid_payload).json()["prediction"]
    valid_payload["B4"] = 2.5
    b = client.post("/api/predict/vegetation", json=valid_payload).json()["prediction"]
    assert a != b


def test_missing_feature_rejected_not_zero_filled(client, valid_payload):
    del valid_payload["VH"]
    r = client.post("/api/predict/vegetation", json=valid_payload)
    assert r.status_code == 422


@pytest.mark.parametrize("field,value", [("latitude", 95), ("longitude", -200)])
def test_range_validation(client, valid_payload, field, value):
    valid_payload[field] = value
    assert client.post("/api/predict/total-carbon", json=valid_payload).status_code == 422


def test_unrequested_algorithm_unavailable_is_503(client, valid_payload):
    r = client.post("/api/predict/vegetation?algorithm=svm", json=valid_payload)
    assert r.status_code == 503
    assert "not loaded" in r.json()["detail"]
