"""Check that your real GMW tiles and trained models are in place.

Run from the backend folder:   python scripts/verify_setup.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import gis
import model_service as ms
from config import FEATURES, get_settings

s = get_settings()
ok = True
print(f"GMW folder    : {s.gmw_dir}")
n = gis.count_tiles()
if not n:
    ok = False
    print("  [FAIL] no .tif tiles found - copy your GMW tiles here (or set GMW_DIR)")
else:
    idx = gis._load_index()
    print(f"  [ OK ] {n} tiles found, {len(idx)} readable (expected 1647 for the full dataset)")

print(f"Models folder : {s.models_dir}")
info = ms.describe_models()
for m in info["loaded"]:
    print(f"  [ OK ] {m['target']:<13} {m['label']:<14} <- {m['file']} ({m['estimator_class']}, {m['n_features']} features)")
for sk in info["skipped"]:
    print(f"  [SKIP] {sk['file']}: {sk['reason']}")
for t in ms.TARGETS:
    if not ms.available_for(t):
        ok = False
        print(f"  [FAIL] no trained model for '{t}'")
for m in ms.get_registry().models.values():
    if set(m.features) != set(FEATURES):
        print(f"  [WARN] {m.path.name} expects features {m.features}, which differ from the project list")

print("\nSETUP OK" if ok else "\nSETUP INCOMPLETE - see messages above")
sys.exit(0 if ok else 1)
