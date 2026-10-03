"""Loads the trained models from disk and serves predictions.

Design rules
------------
* Only REAL trained model files are used. If a file is missing the API says so
  (HTTP 503) - it never falls back to dummy or random numbers.
* Target is inferred from the file name:  *veg*   -> vegetation carbon
                                          *total* -> total carbon
* Algorithm is inferred from the loaded estimator class (Random Forest,
  XGBoost, SVM) so file names do not have to follow a strict convention.
* Accepted file contents: a fitted estimator / sklearn Pipeline, or a dict
  {"model": estimator, "features": [...ordered feature names...]}.

NOTE: joblib/pickle files can execute code when loaded. Only load model files
that you trained yourself.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from config import FEATURES, get_settings

log = logging.getLogger("bluecarbon.models")

TARGETS = ("vegetation", "total_carbon")
MODEL_SUFFIXES = {".joblib", ".pkl", ".pickle"}

ALGO_LABELS = {
    "random_forest": "Random Forest",
    "xgboost": "XGBoost",
    "svm": "SVM",
}


class ModelUnavailable(RuntimeError):
    """Raised when a requested trained model is not loaded."""


@dataclass
class LoadedModel:
    target: str
    algo: str
    label: str
    estimator: Any
    features: list[str]
    path: Path
    estimator_class: str


@dataclass
class Registry:
    models: dict[tuple[str, str], LoadedModel] = field(default_factory=dict)
    skipped: list[dict[str, str]] = field(default_factory=list)
    loaded_from: str = ""


_lock = threading.Lock()
_registry: Registry | None = None


# ----------------------------------------------------------------------------
# helpers
# ----------------------------------------------------------------------------

def _final_estimator(obj: Any) -> Any:
    """Unwrap sklearn Pipelines / GridSearch objects to the real estimator."""
    if hasattr(obj, "best_estimator_"):
        obj = obj.best_estimator_
    if hasattr(obj, "steps") and obj.steps:
        obj = obj.steps[-1][1]
    return obj


def _detect_algo(estimator: Any, filename: str) -> str | None:
    cls = type(_final_estimator(estimator)).__name__.lower()
    name = filename.lower()
    if "randomforest" in cls or "random_forest" in name or "_rf" in name or name.startswith("rf"):
        return "random_forest"
    if "xgb" in cls or "xgb" in name or "xgboost" in name:
        return "xgboost"
    if "svr" in cls or "svm" in cls or "svm" in name or "svr" in name:
        return "svm"
    return None


def _detect_target(filename: str) -> str | None:
    name = filename.lower()
    if "veg" in name:
        return "vegetation"
    if "total" in name:
        return "total_carbon"
    return None


def _feature_order(payload_features: list[str] | None, estimator: Any) -> list[str]:
    if payload_features:
        return list(payload_features)
    for candidate in (estimator, _final_estimator(estimator)):
        names = getattr(candidate, "feature_names_in_", None)
        if names is not None:
            return [str(n) for n in names]
    return list(FEATURES)


def _load_file(path: Path) -> tuple[Any, list[str] | None]:
    obj = joblib.load(path)
    if isinstance(obj, dict):
        model = obj.get("model") or obj.get("estimator") or obj.get("pipeline")
        if model is None:
            raise ValueError("dict model file has no 'model' key")
        return model, obj.get("features") or obj.get("feature_names")
    return obj, None


def _build_registry() -> Registry:
    settings = get_settings()
    reg = Registry(loaded_from=str(settings.models_dir))

    if not settings.models_dir.is_dir():
        log.warning("Models directory not found: %s", settings.models_dir)
        return reg

    for path in sorted(settings.models_dir.iterdir()):
        if path.suffix.lower() not in MODEL_SUFFIXES:
            continue

        target = _detect_target(path.name)
        if target is None:
            reg.skipped.append(
                {"file": path.name, "reason": "file name must contain 'veg' or 'total'"}
            )
            continue

        try:
            estimator, payload_features = _load_file(path)
            algo = _detect_algo(estimator, path.name)
            if algo is None:
                reg.skipped.append(
                    {"file": path.name, "reason": "could not identify algorithm (RF / XGBoost / SVM)"}
                )
                continue
            if not hasattr(estimator, "predict"):
                reg.skipped.append({"file": path.name, "reason": "object has no predict()"})
                continue

            reg.models[(target, algo)] = LoadedModel(
                target=target,
                algo=algo,
                label=ALGO_LABELS[algo],
                estimator=estimator,
                features=_feature_order(payload_features, estimator),
                path=path,
                estimator_class=type(_final_estimator(estimator)).__name__,
            )
            log.info("Loaded %s / %s from %s", target, algo, path.name)
        except Exception as exc:  # noqa: BLE001 - report any load failure
            log.exception("Failed to load %s", path)
            reg.skipped.append({"file": path.name, "reason": f"load failed: {exc}"})

    return reg


def get_registry(force_reload: bool = False) -> Registry:
    global _registry
    with _lock:
        if _registry is None or force_reload:
            _registry = _build_registry()
        return _registry


# ----------------------------------------------------------------------------
# public API
# ----------------------------------------------------------------------------

def describe_models() -> dict[str, Any]:
    reg = get_registry()
    return {
        "models_dir": reg.loaded_from,
        "loaded": [
            {
                "target": m.target,
                "algorithm": m.algo,
                "label": m.label,
                "file": m.path.name,
                "estimator_class": m.estimator_class,
                "n_features": len(m.features),
            }
            for m in reg.models.values()
        ],
        "skipped": reg.skipped,
    }


def available_for(target: str) -> list[str]:
    reg = get_registry()
    return [algo for (t, algo) in reg.models if t == target]


def pick_model(target: str, algo: str | None, preferred_label: str | None) -> LoadedModel:
    reg = get_registry()
    if target not in TARGETS:
        raise ModelUnavailable(f"Unknown target '{target}'")

    if algo:
        key = (target, algo)
        if key not in reg.models:
            have = ", ".join(available_for(target)) or "none"
            raise ModelUnavailable(
                f"Trained {ALGO_LABELS.get(algo, algo)} model for '{target}' is not loaded "
                f"(available: {have})."
            )
        return reg.models[key]

    candidates = [m for (t, _), m in reg.models.items() if t == target]
    if not candidates:
        raise ModelUnavailable(
            f"No trained model file for '{target}' found in {reg.loaded_from}. "
            f"Copy your exported .joblib file there (name must contain "
            f"'{'veg' if target == 'vegetation' else 'total'}') and restart the backend."
        )
    if preferred_label:
        for m in candidates:
            if m.label == preferred_label:
                return m
    return candidates[0]


def predict(model: LoadedModel, values: dict[str, float]) -> float:
    missing = [f for f in model.features if f not in values]
    if missing:
        raise ValueError(f"Missing features for model: {', '.join(missing)}")

    frame = pd.DataFrame([[values[f] for f in model.features]], columns=model.features)
    output = np.asarray(model.estimator.predict(frame)).ravel()
    result = float(output[0])
    if not np.isfinite(result):
        raise ValueError("Model returned a non-finite value for these inputs")
    return result
