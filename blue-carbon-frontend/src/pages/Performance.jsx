import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  ErrorBox,
  Loading,
  Notice,
  PageTitle,
  PanelHeader,
} from "../components/common";

const SYMBOL = { "Random Forest": "RF", SVM: "SV", XGBoost: "XG" };
const COLOR = { "Random Forest": "#16a6a1", SVM: "#0b5d7a", XGBoost: "#39b98a" };

function ModelCard({ model, best }) {
  return (
    <div className={`model-card ${best ? "model-card-best" : ""}`}>
      <div className="model-card-top">
        <span className="model-symbol">{SYMBOL[model.model] ?? "ML"}</span>
        <span className="model-name">{model.model}</span>
        {best && <span className="best-tag">BEST</span>}
      </div>

      <div className="model-r2">
        <span>R²</span>
        <strong>{model.r2.toFixed(4)}</strong>
      </div>

      <div className="model-metrics">
        <div>
          <span>RMSE</span>
          <strong>{model.rmse.toFixed(4)}</strong>
        </div>
        <div>
          <span>MAE</span>
          <strong>{model.mae.toFixed(4)}</strong>
        </div>
      </div>
    </div>
  );
}

function ModelTable({ models, best }) {
  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>MODEL</th>
            <th>R²</th>
            <th>RMSE</th>
            <th>MAE</th>
          </tr>
        </thead>
        <tbody>
          {models.map((m) => (
            <tr key={m.model} className={m.model === best ? "row-best" : ""}>
              <td>{m.model}</td>
              <td>{m.r2.toFixed(4)}</td>
              <td>{m.rmse.toFixed(4)}</td>
              <td>{m.mae.toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function R2Chart({ models }) {
  const data = models.map((m) => ({ name: m.model, r2: m.r2 }));

  return (
    <div className="chart-container perf-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip formatter={(v) => v.toFixed(4)} />
          <ReferenceLine y={0} stroke="#102a38" />
          <Bar dataKey="r2" name="R²" radius={[7, 7, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.name} fill={COLOR[d.name] ?? "#0b5d7a"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Section({ number, title, models, best }) {
  return (
    <>
      <div className="section-title">
        <span>{number}</span>
        <h2>{title}</h2>
      </div>

      <div className="performance-grid">
        {models.map((m) => (
          <ModelCard key={m.model} model={m} best={m.model === best} />
        ))}
      </div>

      <div className="perf-two-col">
        <div className="panel">
          <PanelHeader
            title={`${title} — R² comparison`}
            subtitle="Negative R² = worse than predicting the mean"
            action="R²"
          />
          <R2Chart models={models} />
        </div>

        <div className="panel table-panel">
          <PanelHeader
            title={`${title} — metrics`}
            subtitle="Cross-validation results"
            action="R² / RMSE / MAE"
          />
          <ModelTable models={models} best={best} />
        </div>
      </div>
    </>
  );
}

export default function Performance({ api }) {
  const { data, loading, error, retry } = api;

  return (
    <>
      <PageTitle
        eyebrow="MODEL EVALUATION"
        title="Model Performance"
        description="Validation metrics for Random Forest, SVM and XGBoost on both carbon targets, served live by the backend."
      />

      {loading && <Loading label="Loading model performance..." />}
      {error && <ErrorBox message={error} onRetry={retry} />}

      {data && (
        <>
          <Section
            number="01"
            title="Vegetation Carbon"
            models={data.vegetation}
            best={data.best_models?.vegetation}
          />
          <Section
            number="02"
            title="Total Carbon"
            models={data.total_carbon}
            best={data.best_models?.total_carbon}
          />

          <Notice tone="warn">
            <b>Interpret with care.</b> {data.validation_note} R² values below
            0.3 indicate weak predictive skill; these models are a research
            prototype, not an operational carbon-accounting tool.
          </Notice>
        </>
      )}
    </>
  );
}
