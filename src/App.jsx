import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Circle, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

const DEFAULT_CENTER = [13.7563, 100.5018];

const COLAB_NOTEBOOK_URL = "https://colab.research.google.com/drive/1DUnQDASFlP2aQ_uugP9AC0HETku7akdX?usp=sharing";

const LOCATION_ALIASES = {
  กรุงเทพมหานคร: ["Bangkok", "Krung Thep", "Bangkok Metropolis", "BKK"],
  กทม: ["Bangkok", "Krung Thep", "Bangkok Metropolis", "BKK"],
  นนทบุรี: ["Nonthaburi"],
  ปทุมธานี: ["Pathum Thani"],
  สมุทรปราการ: ["Samut Prakan", "Samutprakarn"],
};

function fmt(value) {
  if (value === null || value === undefined || value === "") return "Unknown";
  return value;
}

function aliasesFor(value) {
  const clean = String(fmt(value)).trim();
  return LOCATION_ALIASES[clean] || [];
}

function englishLabel(value) {
  const aliases = aliasesFor(value);
  return aliases.length ? aliases[0] : "";
}

function bilingualLabel(value) {
  const clean = fmt(value);
  const english = englishLabel(clean);

  if (!english) return clean;
  return `${english} (${clean})`;
}

function searchableText(value) {
  const clean = fmt(value);
  return [clean, ...aliasesFor(clean)].join(" ");
}

function scoreLabel(score) {
  if (score >= 80) return "Lower recorded risk";
  if (score >= 55) return "Moderate recorded risk";
  if (score >= 30) return "Elevated recorded risk";
  return "High recorded risk";
}

function markerStyle(severity, isHotspot) {
  if (severity >= 8) {
    return {
      color: "#19120e",
      fillColor: "#ff4d24",
      fillOpacity: isHotspot ? 0.95 : 0.78,
      weight: isHotspot ? 2 : 1,
    };
  }

  if (severity >= 4) {
    return {
      color: "#19120e",
      fillColor: "#ffbf5f",
      fillOpacity: isHotspot ? 0.9 : 0.7,
      weight: isHotspot ? 2 : 1,
    };
  }

  return {
    color: "#19120e",
    fillColor: "#a9d9d0",
    fillOpacity: isHotspot ? 0.85 : 0.58,
    weight: isHotspot ? 2 : 1,
  };
}

export default function App() {
  const [geojson, setGeojson] = useState(null);
  const [hotspots, setHotspots] = useState([]);
  const [scores, setScores] = useState([]);
  const [meta, setMeta] = useState(null);
  const [search, setSearch] = useState("");
  const [scoreSearch, setScoreSearch] = useState("");
  const [hotspotsOnly, setHotspotsOnly] = useState(false);
  const [minimumSeverity, setMinimumSeverity] = useState(0);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        const [accidentRes, hotspotRes, scoreRes, metaRes] = await Promise.all([
          fetch("/accidents.geojson"),
          fetch("/hotspots.json"),
          fetch("/safety_scores.json"),
          fetch("/meta.json"),
        ]);

        if (!accidentRes.ok) {
          throw new Error("Missing processed data. Run the Python script first.");
        }

        setGeojson(await accidentRes.json());
        setHotspots(hotspotRes.ok ? await hotspotRes.json() : []);
        setScores(scoreRes.ok ? await scoreRes.json() : []);
        setMeta(metaRes.ok ? await metaRes.json() : null);
      } catch (error) {
        setLoadError(error.message);
      }
    }

    loadData();
  }, []);

  const features = geojson?.features || [];

  const mapCenter = useMemo(() => {
    if (!features.length) return DEFAULT_CENTER;

    const sample = features.slice(0, 100);

    const lat =
      sample.reduce((sum, feature) => sum + feature.geometry.coordinates[1], 0) /
      sample.length;

    const lon =
      sample.reduce((sum, feature) => sum + feature.geometry.coordinates[0], 0) /
      sample.length;

    return [lat, lon];
  }, [features]);

  const filteredFeatures = useMemo(() => {
    const q = search.trim().toLowerCase();

    return features
      .filter((feature) => {
        const p = feature.properties;

        const text = [
          searchableText(p.road),
          searchableText(p.province),
          searchableText(p.district),
          searchableText(p.cause),
          searchableText(p.weather),
        ]
          .join(" ")
          .toLowerCase();

        const matchesSearch = q ? text.includes(q) : true;
        const matchesHotspot = hotspotsOnly ? p.is_hotspot : true;
        const matchesSeverity = Number(p.severity || 0) >= Number(minimumSeverity);

        return matchesSearch && matchesHotspot && matchesSeverity;
      })
      .slice(0, 2500);
  }, [features, search, hotspotsOnly, minimumSeverity]);

  const scoreResult = useMemo(() => {
    const q = scoreSearch.trim().toLowerCase();

    if (!q) return null;

    return scores.find((item) => {
      const text = searchableText(item.area_name).toLowerCase();
      return text.includes(q);
    });
  }, [scores, scoreSearch]);

  function handleUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const uploaded = JSON.parse(reader.result);

        if (uploaded.type !== "FeatureCollection" || !uploaded.features) {
          alert("Please upload a valid GeoJSON FeatureCollection.");
          return;
        }

        setGeojson(uploaded);
        setHotspots([]);
        setScores([]);
        setMeta({
          project: "Uploaded dataset",
          records_after_cleaning: uploaded.features.length,
          cluster_method: "Uploaded GeoJSON preview",
        });
      } catch {
        alert("That file could not be read. Upload a GeoJSON file.");
      }
    };

    reader.readAsText(file);
  }

  const totalAccidents = features.length;
  const hotspotCount = hotspots.length;
  const severeCount = features.filter(
    (feature) => Number(feature.properties.severity || 0) >= 8
  ).length;

  const topHotspot = hotspots[0];

  return (
    <main className="siteShell">
      <div className="noiseLayer" />

      <nav className="topNav">
        <div className="brandCluster">
          <div className="brandGlyph">bk</div>

          <div>
            <strong>Krung Thep Blackspots</strong>
            <span>Road accident intelligence</span>
          </div>
        </div>

        <div className="navLinks">
          <a href="#map">Map</a>
          <a href="#scores">Scores</a>
          <a href="/krungthep_blackspots_cleaned.csv" download>
            Data
          </a>
          <a href={COLAB_NOTEBOOK_URL} target="_blank" rel="noreferrer">
            Colab
          </a>
        </div>
      </nav>

      <section className="heroScene">
        <div className="heroCopy">
          <p className="eyebrow">Thailand Road Accident Hotspot Mapper</p>

          <h1>
            Road risk,
            <span> mapped by blackspots.</span>
          </h1>

          <p className="heroText">
            A public-safety dashboard that cleans Thai accident records, plots crash
            locations, detects dangerous clusters, and translates raw road data into a
            commute safety score.
          </p>

          <div className="heroButtons">
            <a className="button primary" href="/accidents.geojson" download>
              Download GeoJSON
            </a>

            <a className="button secondary" href="/krungthep_blackspots_cleaned.csv" download>
              Download cleaned CSV
            </a>

            <a
              className="button notebook"
              href={COLAB_NOTEBOOK_URL}
              target="_blank"
              rel="noreferrer"
            >
              View Colab pipeline
            </a>

            <label className="button ghost">
              Upload GeoJSON
              <input type="file" accept=".json,.geojson" onChange={handleUpload} />
            </label>
          </div>

          <div className="dataLedger">
            <div>
              <span>Method</span>
              <strong>DBSCAN</strong>
            </div>

            <div>
              <span>Distance</span>
              <strong>Haversine</strong>
            </div>

            <div>
              <span>Search</span>
              <strong>Thai + English</strong>
            </div>
          </div>
        </div>

        <div className="heroArtwork" aria-label="Minimal accident hotspot board">
          <div className="riskBoard">
            <div className="boardTop">
              <span />
              <span />
              <span />
            </div>

            <div className="roadNetwork">
              <div className="roadLine roadA" />
              <div className="roadLine roadB" />
              <div className="roadLine roadC" />

              
            </div>

            <div className="riskReadout">
              <div>
                <span>Mapped records</span>
                <strong>{totalAccidents.toLocaleString()}</strong>
              </div>

              <div>
                <span>Highest cluster</span>
                <strong>{topHotspot ? `#${topHotspot.rank}` : "..."}</strong>
              </div>

              <div>
                <span>Detected hotspots</span>
                <strong>{hotspotCount.toLocaleString()}</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      {loadError && (
        <section className="errorBox">
          <strong>Data not loaded yet.</strong>
          <p>{loadError}</p>
          <p>
            Run <code>python scripts/clean_accidents.py</code>, then refresh the page.
          </p>
        </section>
      )}

      <section className="metricsStrip">
        <article>
          <span>Mapped records</span>
          <strong>{totalAccidents.toLocaleString()}</strong>
        </article>

        <article>
          <span>DBSCAN hotspots</span>
          <strong>{hotspotCount.toLocaleString()}</strong>
        </article>

        <article>
          <span>High-severity cases</span>
          <strong>{severeCount.toLocaleString()}</strong>
        </article>

        <article>
          <span>Model status</span>
          <strong>{meta ? "Active" : "Waiting"}</strong>
        </article>
      </section>

      <section className="controlStudio">
        <div className="controlBlock wide">
          <label>Search road, province, cause, or weather</label>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Try: Bangkok, Nonthaburi, Pathum Thani, ฝน"
          />
        </div>

        <div className="controlBlock">
          <label>Minimum severity</label>
          <input
            type="range"
            min="0"
            max="15"
            value={minimumSeverity}
            onChange={(event) => setMinimumSeverity(event.target.value)}
          />
          <b>{minimumSeverity}</b>
        </div>

        <label className="toggleBlock">
          <input
            type="checkbox"
            checked={hotspotsOnly}
            onChange={(event) => setHotspotsOnly(event.target.checked)}
          />
          <span>Hotspot points only</span>
        </label>
      </section>

      <section className="dashboardGrid" id="map">
        <div className="mapFrame">
          <div className="frameHeader">
            <div>
              <span className="miniLabel">Interactive accident layer</span>
              <h2>Bangkok metro risk field</h2>
            </div>

            <div className="frameDots">
              <span />
              <span />
              <span />
            </div>
          </div>

          <MapContainer center={mapCenter} zoom={10} scrollWheelZoom className="mapCanvas">
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {hotspots.slice(0, 30).map((hotspot) => (
              <Circle
                key={`hotspot-${hotspot.cluster}`}
                center={[hotspot.center_lat, hotspot.center_lon]}
                radius={hotspot.radius_meters}
                pathOptions={{
                  color: "#ff4d24",
                  weight: 2,
                  fillColor: "#ff4d24",
                  fillOpacity: 0.12,
                }}
              >
                <Popup>
                  <strong>Hotspot #{hotspot.rank}</strong>
                  <br />
                  Accidents: {hotspot.accidents}
                  <br />
                  Risk index: {hotspot.risk_index}
                  <br />
                  Main road: {fmt(hotspot.top_road)}
                  <br />
                  Common cause: {fmt(hotspot.top_cause)}
                </Popup>
              </Circle>
            ))}

            {filteredFeatures.map((feature) => {
              const p = feature.properties;
              const [lon, lat] = feature.geometry.coordinates;
              const severity = Number(p.severity || 0);

              return (
                <CircleMarker
                  key={`${p.id}-${lat}-${lon}`}
                  center={[lat, lon]}
                  radius={p.is_hotspot ? 6.5 : 4.2}
                  pathOptions={markerStyle(severity, p.is_hotspot)}
                >
                  <Popup>
                    <strong>{fmt(p.road)}</strong>
                    <br />
                    Province: {bilingualLabel(p.province)}
                    <br />
                    District/Road area: {bilingualLabel(p.district)}
                    <br />
                    Date: {fmt(p.date)} at {fmt(p.time)}
                    <br />
                    Cause: {fmt(p.cause)}
                    <br />
                    Weather: {fmt(p.weather)}
                    <br />
                    Deaths: {p.deaths}
                    <br />
                    Injuries: {p.total_injuries}
                    <br />
                    Severity score: {p.severity}
                    <br />
                    Cluster: {p.cluster === -1 ? "Noise / isolated" : p.cluster}
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>

          <div className="mapCaption">
            Showing {filteredFeatures.length.toLocaleString()} visible points. Search works
            with Thai and English province names.
          </div>
        </div>

        <aside className="sideDeck" id="scores">
          <section className="scorePanel">
            <p className="miniLabel">Commute safety score</p>
            <h2>Search a road, district, or province.</h2>

            <input
              value={scoreSearch}
              onChange={(event) => setScoreSearch(event.target.value)}
              placeholder="Try: Bangkok or a road name from the map"
            />

            {scoreResult ? (
              <div className="scoreCard">
                <span>{bilingualLabel(scoreResult.area_name)}</span>
                <strong>{scoreResult.safety_score}</strong>
                <p>{scoreLabel(Number(scoreResult.safety_score))}</p>
                <small>
                  {scoreResult.accidents} accidents · risk index{" "}
                  {Number(scoreResult.risk_index).toFixed(1)}
                </small>
              </div>
            ) : (
              <div className="emptyScore">
                <span>00</span>
                <p>No road selected yet.</p>
              </div>
            )}
          </section>

          <section className="hotspotPanel">
            <div className="panelTitle">
              <p className="miniLabel">Blackspot ranking</p>
              <h2>Highest-risk clusters</h2>
            </div>

            <div className="hotspotList">
              {hotspots.slice(0, 6).map((hotspot) => (
                <article className="hotspotItem" key={hotspot.cluster}>
                  <div>
                    <span>#{hotspot.rank}</span>
                    <strong>{hotspot.top_road}</strong>
                    <p>{hotspot.top_cause}</p>
                  </div>

                  <b>{hotspot.risk_index}</b>
                </article>
              ))}
            </div>
          </section>

          <section className="methodPanel">
            <p className="miniLabel">Model card</p>

            <ul>
              <li>Google Colab data science notebook</li>
              <li>Python cleaning pipeline</li>
              <li>Thai + English location search</li>
              <li>Severity-weighted risk index</li>
              <li>DBSCAN hotspot clustering</li>
              <li>React Leaflet map interface</li>
              <li>Static deployment through Vercel</li>
            </ul>

            {meta && (
              <p className="metaText">
                {meta.records_after_cleaning} cleaned records · {meta.cluster_method}
              </p>
            )}
          </section>
        </aside>
      </section>
    </main>
  );
}