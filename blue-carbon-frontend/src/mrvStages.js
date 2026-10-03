// Builds the six MRV workflow stages from what the running system actually
// reports (backend status, selected tile, last prediction). Nothing here is
// hard-coded as "done" - each status is derived from live state.

export function buildStages({
  summary,
  status,
  performance,
  selectedLocation,
  lastPrediction,
}) {
  const tiles = status?.gmw?.tile_count ?? summary?.gmw_tiles ?? null;
  const modelsReady = Boolean(status?.models?.ready);
  const hasMetrics = Boolean(performance?.vegetation?.length);

  return [
    {
      id: "collect",
      title: "Data Collection",
      short: "GMW tiles + carbon dataset",
      status: tiles ? "complete" : "blocked",
      detail: tiles
        ? `${tiles.toLocaleString()} real GMW GeoTIFF tiles are available to the backend, together with a carbon dataset of ${summary?.carbon_dataset ?? "—"} observations and ${summary?.spatial_samples?.toLocaleString() ?? "—"} spatial samples used for modelling.`
        : "No GMW tiles were found by the backend. Place the .tif files in the GMW folder and restart FastAPI.",
      action: null,
    },
    {
      id: "extent",
      title: "Mangrove Extent Detection",
      short: "Select tile · raster preview",
      status: !tiles ? "blocked" : selectedLocation ? "complete" : "ready",
      detail: selectedLocation
        ? `Tile ${selectedLocation.tileId} was inspected (binary mangrove extent, value 1 = mangrove). Its centre ${selectedLocation.latitude}, ${selectedLocation.longitude} is the location for prediction. GMW gives extent only - not carbon.`
        : "Open Data & Maps, click a GMW tile and review its raster preview and coverage statistics.",
      action: { label: "Open Data & Maps", page: "Data & Maps" },
    },
    {
      id: "features",
      title: "Feature Preparation",
      short: "16 model inputs",
      status: lastPrediction ? "complete" : selectedLocation ? "ready" : "pending",
      detail:
        "The models need 16 inputs: latitude, longitude, Sentinel-2 bands B1–B12 (incl. B8A) and Sentinel-1 VV/VH. Location comes from the selected GMW tile; spectral and radar values must be entered by the user from their own satellite data - they are never invented.",
      action: { label: "Open Carbon Prediction", page: "Carbon Prediction" },
    },
    {
      id: "predict",
      title: "Carbon Prediction",
      short: "Trained model via FastAPI",
      status: !modelsReady ? "blocked" : lastPrediction ? "complete" : "ready",
      detail: !modelsReady
        ? "Trained model files were not found by the backend. Put the exported .joblib files in the models folder and restart FastAPI."
        : lastPrediction
          ? `Last result: ${lastPrediction.prediction.toFixed(4)} (${lastPrediction.target_title}) from ${lastPrediction.model}.`
          : `Models loaded: ${(status.models.loaded || []).map((m) => `${m.label} (${m.target})`).join(", ")}. Run a prediction to produce a result.`,
      action: { label: "Run prediction", page: "Carbon Prediction" },
    },
    {
      id: "validate",
      title: "Model Validation",
      short: "R² · RMSE · MAE",
      status: hasMetrics ? "complete" : "blocked",
      detail: hasMetrics
        ? `Vegetation best: ${summary?.vegetation_model?.model} (R² ${summary?.vegetation_model?.r2?.toFixed(4)}). Total carbon best: ${summary?.total_carbon_model?.model} (R² ${summary?.total_carbon_model?.r2?.toFixed(4)}). ${performance?.validation_note ?? ""}`
        : "Validation metrics are not available from the backend.",
      action: { label: "View metrics", page: "Model Performance" },
    },
    {
      id: "report",
      title: "MRV Reporting",
      short: "Downloadable report",
      status: hasMetrics ? "ready" : "blocked",
      detail:
        "Generate a Markdown or JSON report containing dataset facts, validation metrics, limitations and - if you ran one - the latest prediction with its inputs.",
      action: null,
    },
  ];
}

export function buildReportMarkdown({
  summary,
  performance,
  selectedLocation,
  lastPrediction,
  stages,
}) {
  const row = (m) =>
    `| ${m.model} | ${m.r2.toFixed(4)} | ${m.rmse.toFixed(4)} | ${m.mae.toFixed(4)} |`;
  const table = (rows) =>
    [
      "| Model | R² | RMSE | MAE |",
      "|---|---|---|---|",
      ...(rows || []).map(row),
    ].join("\n");

  const lines = [
    "# Blue Carbon Intelligence & MRV - Project Report",
    "",
    `Generated: ${new Date().toLocaleString()}`,
    "",
    "## 1. Data",
    `- GMW tiles available: ${summary?.gmw_tiles ?? "not available"}`,
    `- GMW version: ${summary?.gmw_version ?? "—"}`,
    `- GMW format: ${summary?.gmw_info?.class ?? "—"}, ${summary?.gmw_info?.crs ?? "—"}, ${summary?.gmw_info?.raster_size ?? "—"} px, ${summary?.gmw_info?.resolution ?? "—"}`,
    `- Spatial samples: ${summary?.spatial_samples ?? "—"}`,
    `- Carbon observations: ${summary?.carbon_dataset ?? "—"}`,
    "",
    "## 2. Selected location",
    selectedLocation
      ? `- Tile: ${selectedLocation.tileId}\n- Latitude: ${selectedLocation.latitude}\n- Longitude: ${selectedLocation.longitude}`
      : "- No GMW tile was selected in this session.",
    "",
    "## 3. Latest prediction",
    lastPrediction
      ? [
          `- Target: ${lastPrediction.target_title} (${lastPrediction.target_definition})`,
          `- Model: ${lastPrediction.model} (${lastPrediction.model_file})`,
          `- Predicted value: ${lastPrediction.prediction.toFixed(4)}`,
          `- ${lastPrediction.units_note}`,
          "",
          "Inputs:",
          "",
          "| Feature | Value |",
          "|---|---|",
          ...Object.entries(lastPrediction.inputs).map(([k, v]) => `| ${k} | ${v} |`),
        ].join("\n")
      : "- No prediction was run in this session.",
    "",
    "## 4. Model validation - Vegetation carbon",
    table(performance?.vegetation),
    "",
    "## 5. Model validation - Total carbon",
    table(performance?.total_carbon),
    "",
    "## 6. Workflow status",
    ...stages.map((s) => `- ${s.title}: ${s.status}`),
    "",
    "## 7. Limitations",
    `- ${performance?.validation_note ?? ""}`,
    "- GMW is mangrove extent data; it does not measure carbon, biomass or spectral reflectance.",
    "- Satellite feature values (B1–B12, VV, VH) are supplied by the user; this system does not acquire satellite imagery in real time.",
    "- Predictions are research-prototype estimates, not verified carbon credits.",
    "",
  ];

  return lines.join("\n");
}
