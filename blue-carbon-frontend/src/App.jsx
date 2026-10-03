import { Suspense, lazy, useMemo, useState } from "react";

import { ErrorBox, Loading } from "./components/common";
import { useApi } from "./hooks/useApi";
import {
  getFeatures,
  getModelPerformance,
  getStatus,
  getSummary,
} from "./api";
import { buildStages } from "./mrvStages";

import About from "./pages/About";

// Leaflet is only needed on the map page, so load it on demand.
const DataMaps = lazy(() => import("./pages/DataMaps"));
import Overview from "./pages/Overview";
import Performance from "./pages/Performance";
import Prediction from "./pages/Prediction";
import Reports from "./pages/Reports";

const NAV = [
  ["Overview", "⌂"],
  ["Data & Maps", "⌁"],
  ["Carbon Prediction", "◈"],
  ["Model Performance", "◫"],
  ["MRV Reports", "▤"],
  ["About System", "ⓘ"],
];

export default function App() {
  const [activePage, setActivePage] = useState("Overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [quickJump, setQuickJump] = useState("");

  // Shared state passed between pages
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [lastPrediction, setLastPrediction] = useState(null);

  // Backend data - each request has its own loading / error state
  const summaryApi = useApi(getSummary);
  const performanceApi = useApi(getModelPerformance);
  const featuresApi = useApi(getFeatures);
  const statusApi = useApi(getStatus);

  const apis = [summaryApi, performanceApi, featuresApi, statusApi];
  const anyLoading = apis.some((a) => a.loading);
  const firstError = apis.find((a) => a.error)?.error ?? "";

  const retryAll = () => {
    apis.forEach((a) => a.error && a.retry());
  };

  const featureImportance = useMemo(
    () =>
      (featuresApi.data ?? []).map((item) => ({
        name: item.feature,
        value: item.importance,
      })),
    [featuresApi.data]
  );

  const stages = useMemo(
    () =>
      buildStages({
        summary: summaryApi.data,
        status: statusApi.data,
        performance: performanceApi.data,
        selectedLocation,
        lastPrediction,
      }),
    [
      summaryApi.data,
      statusApi.data,
      performanceApi.data,
      selectedLocation,
      lastPrediction,
    ]
  );

  const navigate = (page) => {
    setActivePage(page);
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Called by the GIS page: store the tile centre and open Carbon Prediction.
  const handleUseLocation = (location) => {
    setSelectedLocation(location);
    navigate("Carbon Prediction");
  };

  const handleQuickJump = (event) => {
    event.preventDefault();
    const q = quickJump.trim().toLowerCase();
    const match = NAV.find(([label]) => label.toLowerCase().includes(q));
    if (q && match) {
      navigate(match[0]);
      setQuickJump("");
    }
  };

  const systemText = firstError
    ? "Backend Offline"
    : anyLoading
      ? "Connecting..."
      : statusApi.data?.models?.ready
        ? "ML Pipeline Ready"
        : "Backend Online · models missing";

  return (
    <div className="app">
      {mobileOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        ></div>
      )}

      <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">
            <span>🌊</span>
          </div>
          <div>
            <strong>BLUECARBON</strong>
            <small>INTELLIGENCE & MRV</small>
          </div>
        </div>

        <div className="nav-label">PLATFORM</div>

        {NAV.map(([label, icon]) => (
          <button
            type="button"
            key={label}
            className={`nav-item ${activePage === label ? "active" : ""}`}
            onClick={() => navigate(label)}
          >
            <span className="nav-icon">{icon}</span>
            <span>{label}</span>
          </button>
        ))}

        <div className="sidebar-bottom">
          <div className="system-card">
            <div
              className={`online-dot ${firstError ? "offline" : ""}`}
            ></div>
            <div>
              <small>SYSTEM STATUS</small>
              <strong>{systemText}</strong>
            </div>
          </div>

          <div className="project-tag">
            <span>FINAL YEAR PROJECT</span>
            <b>2026–27</b>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button
            type="button"
            className="mobile-menu"
            aria-label="Toggle navigation"
            onClick={() => setMobileOpen((open) => !open)}
          >
            ☰
          </button>

          <div className="breadcrumb">
            <span>BLUECARBON AI</span>
            <b>/</b>
            <strong>{activePage}</strong>
          </div>

          <div className="top-actions">
            <form className="search" onSubmit={handleQuickJump}>
              <span>⌕</span>
              <input
                placeholder="Jump to page..."
                aria-label="Jump to page"
                value={quickJump}
                onChange={(e) => setQuickJump(e.target.value)}
              />
            </form>

            <div className="status-pill">
              <span></span>
              GMW + CARBON
            </div>
          </div>
        </header>

        {firstError && (
          <div className="api-banner">
            <ErrorBox message={firstError} onRetry={retryAll} />
          </div>
        )}

        <div className="content">
          {activePage === "Overview" && (
            <Overview
              navigate={navigate}
              summary={summaryApi.data}
              modelPerformance={performanceApi.data}
              featureImportance={featureImportance}
              apiLoading={summaryApi.loading}
              stages={stages}
            />
          )}

          {activePage === "Data & Maps" && (
            <Suspense fallback={<Loading label="Loading map..." />}>
              <DataMaps
                summary={summaryApi.data}
                onUseLocation={handleUseLocation}
              />
            </Suspense>
          )}

          {activePage === "Carbon Prediction" && (
            <Prediction
              key={selectedLocation?.stamp ?? "no-location"}
              selectedLocation={selectedLocation}
              status={statusApi.data}
              onResult={setLastPrediction}
            />
          )}

          {activePage === "Model Performance" && (
            <Performance api={performanceApi} />
          )}

          {activePage === "MRV Reports" && (
            <Reports
              summary={summaryApi.data}
              status={statusApi.data}
              performance={performanceApi.data}
              selectedLocation={selectedLocation}
              lastPrediction={lastPrediction}
              navigate={navigate}
            />
          )}

          {activePage === "About System" && <About />}
        </div>
      </main>
    </div>
  );
}
