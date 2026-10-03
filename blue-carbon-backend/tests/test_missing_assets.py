"""With no models/tiles the API must say so clearly - never fake results."""
import importlib
import os
import subprocess
import sys
import textwrap
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]


def test_no_assets_gives_503_not_fake_data(tmp_path):
    code = textwrap.dedent(f"""
        import os, sys
        os.environ["GMW_DIR"] = r"{tmp_path/'none'}"
        os.environ["MODELS_DIR"] = r"{tmp_path/'none2'}"
        sys.path.insert(0, r"{BACKEND}")
        from fastapi.testclient import TestClient
        from main import app
        c = TestClient(app)
        assert c.get("/api/summary").json()["gmw_tiles"] is None
        assert c.get("/api/gis/tiles").status_code == 503
        body = {{k: 1.0 for k in "B1 B2 B3 B4 B5 B6 B7 B8 B8A B9 B11 B12 VV VH".split()}}
        body.update(latitude=1.0, longitude=1.0)
        r = c.post("/api/predict/vegetation", json=body)
        assert r.status_code == 503, r.text
        assert c.get("/api/status").json()["models"]["ready"] is False
        print("OK")
    """)
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
    assert "OK" in out.stdout, out.stderr
