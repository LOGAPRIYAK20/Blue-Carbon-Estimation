import { PageTitle } from "../components/common";


export default function About() {

  const steps = [

    [
      "01",
      "GMW Raster Data",
      "Global Mangrove Watch GeoTIFF tiles",
    ],

    [
      "02",
      "Preprocessing",
      "Inspection, cleaning and standardization",
    ],

    [
      "03",
      "Spatial Features",
      "Neighbourhood-based feature generation",
    ],

    [
      "04",
      "ML Models",
      "SVM, Random Forest and XGBoost",
    ],

    [
      "05",
      "Evaluation",
      "Validation and model comparison",
    ],

    [
      "06",
      "MRV Dashboard",
      "Visualization and reporting layer",
    ],

  ];


  return (

    <>

      <PageTitle
        eyebrow="SYSTEM ARCHITECTURE"
        title="About the System"
        description="How the Blue Carbon Intelligence workflow transforms geospatial data into an MRV-ready research prototype."
      />


      <div className="architecture">

        {steps.map(
          ([num, title, text], index) => (

            <div
              className="architecture-step"
              key={num}
            >

              <div className="step-number">
                {num}
              </div>

              <div>

                <h3>
                  {title}
                </h3>

                <p>
                  {text}
                </p>

              </div>


              {index !== steps.length - 1 && (

                <span className="step-arrow">
                  →
                </span>

              )}

            </div>

          )
        )}

      </div>


      <div className="technology-grid">

        {[
          ["Python", "ML & data processing"],
          ["Rasterio", "Geospatial raster handling"],
          ["Scikit-learn", "Classical ML"],
          ["XGBoost", "Boosted-tree modelling"],
          ["React", "Dashboard interface"],
          ["FastAPI", "Backend integration"],
          ["GMW", "Mangrove extent data"],
          ["Geospatial AI", "Spatial intelligence"],
        ].map(
          ([title, text]) => (

            <div
              className="technology-card"
              key={title}
            >

              <div className="tech-icon">
                ◆
              </div>

              <h3>
                {title}
              </h3>

              <p>
                {text}
              </p>

            </div>

          )
        )}

      </div>


      <div className="limitation-panel">

        <div className="limitation-icon">
          ⓘ
        </div>

        <div>

          <h3>
            Scientific Scope
          </h3>

          <p>
            GMW represents mangrove extent and does not
            directly provide biomass, soil carbon, spectral
            bands or field-measured carbon stock. Direct
            carbon quantification therefore requires
            additional carbon-related observations.
          </p>

        </div>

      </div>

    </>

  );
}


