# Real-Time Blue Carbon Intelligence & MRV System

```
blue-carbon-backend/   FastAPI (GIS + prediction + metrics)
blue-carbon-frontend/  React + Vite + Leaflet dashboard
```

## 1. Put YOUR real assets in place (required)

The uploaded zips contained no model files and no GMW tiles, so the backend reads them from these folders:

| What | Folder (default) | Notes |
|---|---|---|
| GMW GeoTIFF tiles (1,647) | `backend/data/gmw/` | any sub-folders; `*.tif` / `*.tiff` |
| Trained models | `backend/models/` | `.joblib` / `.pkl`; file name must contain `veg` (vegetation) or `total` (total carbon). Algorithm is detected from the estimator class (RF / XGBoost / SVM) |

Export examples (from your notebook):
```python
import joblib
joblib.dump(rf_veg,  "models/vegetation_rf.joblib")
joblib.dump(xgb_tot, "models/total_carbon_xgb.joblib")
# optional: models/vegetation_xgb.joblib, total_carbon_svm.joblib ... (SVM must be a Pipeline incl. its scaler)
```
Different locations: set `GMW_DIR` and `MODELS_DIR` environment variables.
If a model file is missing, the API answers HTTP 503 with a clear message - it never returns dummy numbers.

## 2. Run the backend (Windows)
```bat
cd blue-carbon-backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python scripts\verify_setup.py
uvicorn main:app --reload --port 8000
```
Open http://127.0.0.1:8000/docs. First tile request builds a cached index (`data/cache/tile_index.json`).

## 3. Run the frontend
```bat
cd blue-carbon-frontend
npm install
npm run dev
```
Open http://localhost:5173. Optional `.env`: `VITE_API_URL=http://127.0.0.1:8000`.

## 4. Tests
```bat
cd blue-carbon-backend
pytest
```
Tests use small synthetic tiles/models created in a temp folder; they never touch your data.

## 5. End-to-end checklist
1. `verify_setup.py` prints SETUP OK (1647 tiles, vegetation + total models).
2. Overview: GMW tiles = 1,647, samples 27,817, observations 300, R² 0.1824 / 0.2507; sidebar says "ML Pipeline Ready".
3. Data & Maps: tiles drawn; hover shows tile id; click -> amber highlight, map zooms, raster preview (teal) appears.
4. Tile panel: ID, CRS EPSG:4326, 10,000 x 10,000, 0.0001 x 0.0001, NoData, bounds, centre lat/lon, mangrove pixels/coverage.
5. "Use Location for Prediction" is disabled before selection; after click, Carbon Prediction opens with lat/lon filled and a tile banner.
6. Click Run with empty fields -> per-field "Required" errors, no request sent.
7. Fill B1-B12, VV, VH -> result card with value, model, target, coordinates, model file.
8. Switch target (vegetation/total) and algorithm; results change with the model.
9. Stop the backend -> red banner "Cannot reach the backend..." with Retry; pages do not crash. Restart -> Retry works.
10. Model Performance: RF/SVM/XGBoost cards, R² charts, tables for both targets; best model badged.
11. MRV Reports: click each of the 6 stages; statuses follow live state; download .md/.json report.
12. Resize < 900 px: sidebar opens via ☰ with backdrop; map, form and tables remain usable.

## 6. Scientific limits (shown in the UI too)
300 observations, shuffled K-fold CV: not evidence of geographic generalisation. GMW = mangrove extent, not carbon. Satellite features are user-supplied, never generated. No real-time acquisition, blockchain or global MRV.
