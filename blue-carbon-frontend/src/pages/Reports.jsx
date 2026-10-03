import { useMemo, useState } from "react";

import { Notice, PageTitle, PanelHeader } from "../components/common";
import { buildReportMarkdown, buildStages } from "../mrvStages";

const STATUS_LABEL = {
  complete: "Complete",
  ready: "Ready",
  pending: "Waiting for input",
  blocked: "Not available",
};

function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function Reports({
  summary,
  status,
  performance,
  selectedLocation,
  lastPrediction,
  navigate,
}) {
  const [activeId, setActiveId] = useState("collect");

  const stages = useMemo(
    () =>
      buildStages({
        summary,
        status,
        performance,
        selectedLocation,
        lastPrediction,
      }),
    [summary, status, performance, selectedLocation, lastPrediction]
  );

  const active = stages.find((s) => s.id === activeId) ?? stages[0];
  const done = stages.filter((s) => s.status === "complete").length;

  const ctx = { summary, performance, selectedLocation, lastPrediction, stages };
  const stamp = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageTitle
        eyebrow="MONITORING • REPORTING • VERIFICATION"
        title="MRV Workspace"
        description="The implemented pipeline from GMW extent data to a report-ready prediction. Each stage reflects the live state of this system."
      />

      <div className="panel mrv-flow-panel">
        <PanelHeader
          title="MRV Workflow"
          subtitle={`${done} of ${stages.length} stages complete`}
          action="CLICK A STAGE"
        />

        <ol className="mrv-flow">
          {stages.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                className={`mrv-step status-${s.status} ${s.id === active.id ? "active" : ""}`}
                onClick={() => setActiveId(s.id)}
                aria-pressed={s.id === active.id}
              >
                <span className="mrv-step-num">
                  {s.status === "complete" ? "✓" : String(i + 1).padStart(2, "0")}
                </span>
                <strong>{s.title}</strong>
                <small>{s.short}</small>
                <em>{STATUS_LABEL[s.status]}</em>
              </button>
              {i < stages.length - 1 && <span className="mrv-link" aria-hidden="true">→</span>}
            </li>
          ))}
        </ol>

        <div className={`mrv-detail status-${active.status}`}>
          <div>
            <span className="eyebrow">STAGE DETAIL</span>
            <h3>{active.title}</h3>
            <p>{active.detail}</p>
          </div>

          {active.action && (
            <button
              type="button"
              className="primary-btn"
              onClick={() => navigate(active.action.page)}
            >
              {active.action.label} →
            </button>
          )}
        </div>
      </div>

      <div className="panel report-builder">
        <div>
          <span className="eyebrow">REPORT GENERATOR</span>
          <h2>Generate an MRV Project Report</h2>
          <p>
            Built from live backend data: dataset facts, validation metrics,
            limitations and your latest prediction
            {lastPrediction ? "." : " (none run yet - the report will say so)."}
          </p>
        </div>

        <div className="report-actions">
          <button
            type="button"
            className="primary-btn"
            disabled={!performance}
            onClick={() =>
              download(
                `blue-carbon-mrv-report-${stamp}.md`,
                buildReportMarkdown(ctx),
                "text/markdown"
              )
            }
          >
            Download report (.md)
          </button>
          <button
            type="button"
            className="secondary-btn dark"
            disabled={!performance}
            onClick={() =>
              download(
                `blue-carbon-mrv-data-${stamp}.json`,
                JSON.stringify(
                  {
                    generated: new Date().toISOString(),
                    summary,
                    performance,
                    selectedLocation,
                    lastPrediction,
                    stages: stages.map(({ id, title, status: st }) => ({ id, title, status: st })),
                  },
                  null,
                  2
                ),
                "application/json"
              )
            }
          >
            Download data (.json)
          </button>
        </div>
      </div>

      <Notice tone="warn">
        <b>Scope of this prototype.</b> It combines real GMW mangrove extent
        tiles with machine-learning models trained on 300 carbon observations.
        It does not acquire satellite imagery in real time, does not use
        blockchain, and does not provide verified or global carbon accounting.
      </Notice>
    </>
  );
}
