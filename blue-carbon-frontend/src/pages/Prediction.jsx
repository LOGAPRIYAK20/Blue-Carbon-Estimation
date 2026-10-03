import { useEffect, useRef, useState } from "react";

import { ErrorBox, Notice, PageTitle } from "../components/common";
import { predict } from "../api";

const FEATURES = [
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
];

const GROUPS = [
  ["Location", ["latitude", "longitude"]],
  [
    "Optical bands (B1–B12)",
    ["B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B8A", "B9", "B11", "B12"],
  ],
  ["Radar backscatter", ["VV", "VH"]],
];

const TARGETS = {
  vegetation: "Vegetation carbon (cagb + cbgb)",
  total_carbon: "Total carbon stock",
};

const ALGO_LABELS = {
  random_forest: "Random Forest",
  xgboost: "XGBoost",
  svm: "SVM",
};

/** Validate raw string inputs. Returns { values, errors }. Never fills blanks with 0. */
function validate(raw) {
  const errors = {};
  const values = {};

  FEATURES.forEach((name) => {
    const text = (raw[name] ?? "").trim();

    if (text === "") {
      errors[name] = "Required";
      return;
    }

    const num = Number(text);

    if (!Number.isFinite(num)) {
      errors[name] = "Enter a valid number";
      return;
    }

    if (name === "latitude" && (num < -90 || num > 90)) {
      errors[name] = "Must be between −90 and 90";
      return;
    }

    if (name === "longitude" && (num < -180 || num > 180)) {
      errors[name] = "Must be between −180 and 180";
      return;
    }

    values[name] = num;
  });

  return { values, errors };
}

export default function Prediction({ selectedLocation, status, onResult }) {
  const [raw, setRaw] = useState(() => ({
    latitude: selectedLocation ? String(selectedLocation.latitude) : "",
    longitude: selectedLocation ? String(selectedLocation.longitude) : "",
  }));
  const [target, setTarget] = useState("vegetation");
  const [algorithm, setAlgorithm] = useState("");
  const [errors, setErrors] = useState({});
  const [phase, setPhase] = useState("idle"); // idle | loading | success | error
  const [result, setResult] = useState(null);
  const [apiError, setApiError] = useState("");
  const abortRef = useRef(null);

  // Cancel an in-flight request if the page is left.
  useEffect(() => () => abortRef.current?.abort(), []);

  const available = status?.models?.[target] ?? [];

  const change = (name, value) => {
    setRaw((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
  };

  const changeTarget = (value) => {
    setTarget(value);
    setAlgorithm("");
  };

  const submit = async (event) => {
    event.preventDefault();

    const check = validate(raw);
    setErrors(check.errors);

    if (Object.keys(check.errors).length > 0) {
      setPhase("idle");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setPhase("loading");
    setApiError("");

    try {
      const response = await predict(
        target,
        check.values,
        algorithm,
        controller.signal
      );
      setResult(response);
      setPhase("success");
      onResult?.(response);
    } catch (error) {
      if (error.name === "AbortError") return;
      setApiError(error.message);
      setPhase("error");
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    setRaw({
      latitude: selectedLocation ? String(selectedLocation.latitude) : "",
      longitude: selectedLocation ? String(selectedLocation.longitude) : "",
    });
    setErrors({});
    setPhase("idle");
    setResult(null);
    setApiError("");
  };

  const filled = FEATURES.filter((f) => (raw[f] ?? "").trim() !== "").length;

  return (
    <>
      <PageTitle
        eyebrow="CARBON ESTIMATION"
        title="Carbon Prediction"
        description="Send location and satellite features to the trained machine-learning models running in FastAPI."
      />

      <div className="prediction-layout">
        <form className="panel prediction-form-panel" onSubmit={submit} noValidate>
          <div className="prediction-heading">
            <div className="prediction-icon">◈</div>
            <div>
              <h2>Prediction Inputs</h2>
              <p>
                {filled} of {FEATURES.length} features entered
              </p>
            </div>
          </div>

          {selectedLocation ? (
            <div className="location-banner">
              <strong>Location from GMW tile</strong>
              <span>{selectedLocation.tileId}</span>
              <small>
                {selectedLocation.latitude}, {selectedLocation.longitude}
              </small>
            </div>
          ) : (
            <Notice>
              No tile selected. Pick one in <b>Data & Maps</b> to fill the
              coordinates automatically, or type them in.
            </Notice>
          )}

          <div className="target-row">
            <label>
              <span>Carbon target</span>
              <select
                value={target}
                onChange={(e) => changeTarget(e.target.value)}
              >
                {Object.entries(TARGETS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Algorithm</span>
              <select
                value={algorithm}
                onChange={(e) => setAlgorithm(e.target.value)}
              >
                <option value="">Best validated (default)</option>
                {available.map((algo) => (
                  <option key={algo} value={algo}>
                    {ALGO_LABELS[algo] ?? algo}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {GROUPS.map(([title, names]) => (
            <fieldset className="feature-group" key={title}>
              <legend>{title}</legend>

              <div className="feature-grid">
                {names.map((name) => (
                  <label key={name} className={errors[name] ? "has-error" : ""}>
                    <span>{name}</span>
                    <input
                      type="number"
                      step="any"
                      inputMode="decimal"
                      placeholder="Enter value"
                      value={raw[name] ?? ""}
                      onChange={(e) => change(name, e.target.value)}
                      aria-invalid={Boolean(errors[name])}
                    />
                    {errors[name] && (
                      <small className="field-error">{errors[name]}</small>
                    )}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}

          <div className="form-actions">
            <button
              type="submit"
              className="primary-btn"
              disabled={phase === "loading"}
            >
              {phase === "loading" ? "Running model..." : "Run Carbon Prediction →"}
            </button>
            <button type="button" className="clear-btn" onClick={reset}>
              Reset
            </button>
          </div>

          <Notice>
            GMW provides location and mangrove extent only. It does{" "}
            <b>not</b> provide Sentinel-2 bands (B1–B12) or Sentinel-1 radar
            (VV, VH), so these values are never generated for you. Enter them
            from your own satellite data.
          </Notice>
        </form>

        <div className="prediction-result">
          <span className="result-label">PREDICTION RESULT</span>

          {phase === "idle" && (
            <>
              <div className="result-orb">◈</div>
              <h2>Awaiting input</h2>
              <p>
                Fill in all 16 features and run the model. The value shown here
                is returned by the trained model file on the backend.
              </p>
            </>
          )}

          {phase === "loading" && (
            <>
              <div className="result-orb spin">◈</div>
              <h2>Running model...</h2>
              <p>Sending features to FastAPI.</p>
            </>
          )}

          {phase === "error" && (
            <>
              <div className="result-orb result-orb-error">!</div>
              <h2>Prediction failed</h2>
              <ErrorBox message={apiError} />
            </>
          )}

          {phase === "success" && result && (
            <>
              <div className="result-orb">✓</div>
              <h2 className="result-value">{result.prediction.toFixed(4)}</h2>
              <p>{result.target_title}</p>

              <div className="result-details">
                <div>
                  <span>MODEL</span>
                  <strong>{result.model}</strong>
                </div>
                <div>
                  <span>TARGET</span>
                  <strong>{result.target_definition}</strong>
                </div>
                <div>
                  <span>COORDINATES</span>
                  <strong>
                    {result.coordinates.latitude}, {result.coordinates.longitude}
                  </strong>
                </div>
                <div>
                  <span>MODEL FILE</span>
                  <strong>{result.model_file}</strong>
                </div>
              </div>

              <small className="result-footnote">
                {result.units_note} {result.disclaimer}
              </small>
            </>
          )}
        </div>
      </div>
    </>
  );
}
