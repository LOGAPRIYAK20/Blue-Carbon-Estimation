import {
  Bar,
  BarChart,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import { Notice, PanelHeader, StatCard } from "../components/common";

function WorkflowMini({ stages, navigate }) {
  return (
    <ol className="workflow-mini">
      {stages.map((s, i) => (
        <li key={s.id}>
          <button
            type="button"
            className={`wm-item status-${s.status}`}
            onClick={() => navigate("MRV Reports")}
          >
            <span className="wm-num">
              {s.status === "complete" ? "✓" : String(i + 1).padStart(2, "0")}
            </span>
            <span className="wm-text">
              <strong>{s.title}</strong>
              <small>{s.short}</small>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}


export default function Overview({
  navigate,
  summary,
  modelPerformance,
  featureImportance,
  apiLoading,
  stages,
}) {

  // Backend vegetation models

  const vegetationModels =
    modelPerformance?.vegetation?.map(
      (model) => ({
        name: model.model,
        r2: model.r2,
        rmse: model.rmse,
        mae: model.mae,
      })
    ) || [];


  // Chart data

  const chartData =
    vegetationModels.map((model) => ({

      name:
        model.name === "Random Forest"
          ? "RF"
          : model.name === "XGBoost"
          ? "XGB"
          : "SVM",

      value: model.r2,

    }));


  return (

    <>

      {/* ==========================================
          HERO
          ========================================== */}

      <section className="hero">

        <div className="hero-content">

          <div className="eyebrow">

            <span></span>

            GEOSPATIAL AI PLATFORM

          </div>


          <h1>
            Blue Carbon
            <br />
            <em>Intelligence.</em>
          </h1>


          <p>
            Geospatial machine learning for mangrove
            monitoring, carbon estimation and MRV support.
          </p>


          <div className="hero-buttons">

            <button
              className="primary-btn"
              onClick={() =>
                navigate("Data & Maps")
              }
            >
              Explore Data <span>→</span>
            </button>


            <button
              className="secondary-btn"
              onClick={() =>
                navigate("Carbon Prediction")
              }
            >
              Run Prediction
            </button>

          </div>


          <div className="hero-note">

            <span>✦</span>

            Built with Global Mangrove Watch spatial data

          </div>

        </div>


        <div className="hero-visual">

          <div className="orbit orbit-one"></div>

          <div className="orbit orbit-two"></div>


          <div className="earth">

            <div className="earth-glow"></div>

            <div className="land land-one"></div>

            <div className="land land-two"></div>

            <div className="land land-three"></div>

          </div>


          <div className="satellite-card">

            <span>◉</span>

            <div>

              <small>
                EARTH OBSERVATION
              </small>

              <strong>
                SPATIAL INTELLIGENCE
              </strong>

            </div>

          </div>

        </div>

      </section>


      {/* ==========================================
          STAT CARDS
          ========================================== */}

      <section className="stats-grid">

        <StatCard
          icon="▦"
          number={
            apiLoading
              ? "..."
              : summary?.gmw_tiles?.toLocaleString() || "—"
          }
          label="GMW Tiles"
          sub="Processed raster tiles"
        />


        <StatCard
          icon="⌁"
          number={
            apiLoading
              ? "..."
              : summary?.spatial_samples?.toLocaleString() || "—"
          }
          label="Spatial Samples"
          sub="Learning samples generated"
        />


        <StatCard
          icon="◎"
          number={
            apiLoading
              ? "..."
              : summary?.carbon_dataset?.toLocaleString() || "—"
          }
          label="Carbon Observations"
          sub="Carbon dataset records"
        />


        <StatCard
          icon="R²"
          number={
            apiLoading
              ? "..."
              : summary?.vegetation_model?.r2?.toFixed(4) || "—"
          }
          label="Vegetation Carbon"
          sub="RF validation R²"
        />


        <StatCard
          icon="R²"
          number={
            apiLoading
              ? "..."
              : summary?.total_carbon_model?.r2?.toFixed(4) || "—"
          }
          label="Total Carbon"
          sub="XGBoost validation R²"
        />

      </section>


      {/* ==========================================
          MAP + MODEL CHART
          ========================================== */}

      <section className="dashboard-grid">

        {/* DATA COVERAGE (real values from the backend) */}

        <div className="panel map-panel coverage-panel">

          <PanelHeader
            title="Mangrove Data Coverage"
            subtitle="Global Mangrove Watch • loaded from the backend"
            action="LIVE"
          />

          <div className="coverage-body">

            <div className="coverage-big">
              <strong>
                {apiLoading
                  ? "..."
                  : summary?.gmw_tiles?.toLocaleString() ?? "—"}
              </strong>
              <span>GMW tiles available to the backend</span>
            </div>

            <dl className="tile-details">
              <div className="tile-row">
                <dt>Dataset</dt>
                <dd>GMW {summary?.gmw_version ?? "—"}</dd>
              </div>
              <div className="tile-row">
                <dt>Class</dt>
                <dd>{summary?.gmw_info?.class ?? "—"}</dd>
              </div>
              <div className="tile-row">
                <dt>CRS</dt>
                <dd>{summary?.gmw_info?.crs ?? "—"}</dd>
              </div>
              <div className="tile-row">
                <dt>Raster size</dt>
                <dd>{summary?.gmw_info?.raster_size ?? "—"} px</dd>
              </div>
              <div className="tile-row">
                <dt>Resolution</dt>
                <dd>{summary?.gmw_info?.resolution ?? "—"}</dd>
              </div>
            </dl>

            {summary && summary.gmw_tiles === null && (
              <Notice tone="warn">
                The backend could not find the GMW tile folder. See the
                backend README to place the tiles.
              </Notice>
            )}

            <button
              type="button"
              className="primary-btn full"
              onClick={() => navigate("Data & Maps")}
            >
              Open interactive map →
            </button>

          </div>

        </div>


        {/* MODEL CHART */}

        <div className="panel chart-panel">

          <PanelHeader
            title="Vegetation Carbon Models"
            subtitle="Validation R² comparison"
            action="DETAILS"
          />


          <div className="chart-container">

            <ResponsiveContainer
              width="100%"
              height="100%"
            >

              <BarChart
                data={chartData}
              >

                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                />

                <XAxis dataKey="name" />

                <YAxis
                  domain={[-0.15, 0.25]}
                />

                <Tooltip />

                <Bar
                  dataKey="value"
                  radius={[
                    7,
                    7,
                    0,
                    0,
                  ]}
                />

              </BarChart>

            </ResponsiveContainer>

          </div>


          <div className="model-mini-list">

            {vegetationModels.map(
              (model) => (

                <div
                  className="mini-model"
                  key={model.name}
                >

                  <span>
                    {model.name}
                  </span>

                  <strong>
                    {model.r2.toFixed(4)}
                  </strong>

                </div>

              )
            )}

          </div>

        </div>

      </section>


      {/* ==========================================
          FEATURE IMPORTANCE + WORKFLOW
          ========================================== */}

      <section className="dashboard-grid lower">

        <div className="panel">

          <PanelHeader
            title="Feature Importance"
            subtitle="Vegetation carbon Random Forest"
            action="16 FEATURES"
          />


          <div className="importance-list">

            {featureImportance.map(
              (item) => (

                <div
                  className="importance-row"
                  key={item.name}
                >

                  <div className="importance-name">
                    {item.name}
                  </div>


                  <div className="importance-track">

                    <div
                      className="importance-fill"
                      style={{
                        width: `${Math.min(
                          item.value * 100 * 3.5,
                          100
                        )}%`,
                      }}
                    ></div>

                  </div>


                  <div className="importance-value">
                    {item.value.toFixed(3)}
                  </div>

                </div>

              )
            )}

          </div>


          <div className="info-note">

            <span>ⓘ</span>

            Feature importance shows model reliance
            on predictors; it does not establish causation.

          </div>

        </div>


        <div className="panel workflow-panel">

          <PanelHeader
            title="MRV Workflow"
            subtitle="Live status of each stage"
            action="PIPELINE"
          />


          <WorkflowMini stages={stages} navigate={navigate} />


          <button
            className="outline-full"
            onClick={() =>
              navigate("MRV Reports")
            }
          >
            Open MRV Workspace →
          </button>

        </div>

      </section>


      <footer>

        <span>
          BLUECARBON AI
        </span>

        <span>
          Environmental Intelligence • Academic Prototype
        </span>

        <span>
          2026–27
        </span>

      </footer>

    </>

  );
}


