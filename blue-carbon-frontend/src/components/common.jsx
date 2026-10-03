
export function StatCard({
  icon,
  number,
  label,
  sub,
}) {

  return (

    <div className="stat-card">

      <div className="stat-top">

        <div className="stat-icon">
          {icon}
        </div>

        <span className="stat-arrow">
          ↗
        </span>

      </div>


      <strong>
        {number}
      </strong>


      <h3>
        {label}
      </h3>


      <p>
        {sub}
      </p>

    </div>

  );
}



export function PanelHeader({
  title,
  subtitle,
  action,
}) {

  return (

    <div className="panel-header">

      <div>

        <h2>
          {title}
        </h2>

        <p>
          {subtitle}
        </p>

      </div>


      <span className="panel-action">
        {action}
      </span>

    </div>

  );
}



export function PageTitle({
  eyebrow,
  title,
  description,
}) {

  return (

    <section className="page-title">

      <div className="eyebrow">

        <span></span>

        {eyebrow}

      </div>


      <h1>
        {title}
      </h1>


      <p>
        {description}
      </p>

    </section>

  );
}



// ==================================================
// LOADING / ERROR / NOTICE
// ==================================================

export function Loading({ label = "Loading..." }) {
  return (
    <div className="state-box state-loading" role="status">
      <span className="spinner" aria-hidden="true"></span>
      {label}
    </div>
  );
}

export function ErrorBox({ message, onRetry }) {
  return (
    <div className="state-box state-error" role="alert">
      <span>⚠ {message}</span>
      {onRetry && (
        <button type="button" className="retry-btn" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Notice({ tone = "info", children }) {
  return <div className={`notice notice-${tone}`}>{children}</div>;
}
