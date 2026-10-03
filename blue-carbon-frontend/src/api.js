// Central API client. Every function throws an Error with a human-readable
// message so the UI can show a clear error state.

export const API_URL = (
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

async function request(path, options = {}) {
  let response;

  try {
    response = await fetch(`${API_URL}${path}`, options);
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error(
      `Cannot reach the backend at ${API_URL}. Start FastAPI with "uvicorn main:app --reload --port 8000".`
    );
  }

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response;
}

async function readError(response) {
  try {
    const body = await response.json();
    const detail = body.detail;

    // FastAPI validation errors arrive as a list of {loc, msg}
    if (Array.isArray(detail)) {
      return detail
        .map((d) => `${(d.loc || []).slice(1).join(".")}: ${d.msg}`)
        .join("; ");
    }

    if (typeof detail === "string") return detail;
  } catch {
    // body was not JSON
  }

  return `Request failed (HTTP ${response.status})`;
}

const json = async (path, options) => (await request(path, options)).json();

export const getSummary = (signal) => json("/api/summary", { signal });
export const getModelPerformance = (signal) =>
  json("/api/model-performance", { signal });
export const getFeatures = (signal) => json("/api/features", { signal });
export const getStatus = (signal) => json("/api/status", { signal });

// ---------- GIS ----------

export const getTiles = (signal) => json("/api/gis/tiles", { signal });
export const getTile = (id, signal) =>
  json(`/api/gis/tile/${encodeURIComponent(id)}`, { signal });
export const getTileStats = (id, signal) =>
  json(`/api/gis/tile/${encodeURIComponent(id)}/stats`, { signal });

/** Returns an object URL for the PNG preview (caller must revoke it). */
export async function getTilePreviewUrl(id, signal) {
  const response = await request(
    `/api/gis/tile/${encodeURIComponent(id)}/preview`,
    { signal }
  );
  return URL.createObjectURL(await response.blob());
}

// ---------- Prediction ----------

export function predict(target, values, algorithm, signal) {
  const path =
    target === "vegetation"
      ? "/api/predict/vegetation"
      : "/api/predict/total-carbon";
  const query = algorithm ? `?algorithm=${encodeURIComponent(algorithm)}` : "";

  return json(`${path}${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
    signal,
  });
}
