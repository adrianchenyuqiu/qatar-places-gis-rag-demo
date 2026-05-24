const places = (window.PLACES || []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
const demoConfig = window.QATAR_DEMO_CONFIG || {};

const els = {
  stats: document.querySelector("#stats"),
  nlQuestion: document.querySelector("#nlQuestion"),
  nearestSource: document.querySelector("#nearestSource"),
  nearestType: document.querySelector("#nearestType"),
  nearestLimit: document.querySelector("#nearestLimit"),
  withinTarget: document.querySelector("#withinTarget"),
  withinReference: document.querySelector("#withinReference"),
  withinKm: document.querySelector("#withinKm"),
  categoryType: document.querySelector("#categoryType"),
  categorySort: document.querySelector("#categorySort"),
  municipalityFilter: document.querySelector("#municipalityFilter"),
  answerTitle: document.querySelector("#answerTitle"),
  answerText: document.querySelector("#answerText"),
  traceList: document.querySelector("#traceList"),
  resultHead: document.querySelector("#resultHead"),
  resultBody: document.querySelector("#resultBody"),
  placeNames: document.querySelector("#placeNames"),
  map: document.querySelector("#map"),
};

const mapState = {
  map: null,
  layer: null,
};

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function hasType(place, type) {
  return (place.types || []).includes(type);
}

function kmBetween(a, b) {
  const radiusKm = 6371.0088;
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.sqrt(h));
}

function findPlaceByName(name) {
  const normalized = (name || "").trim().toLowerCase();
  return (
    places.find((p) => p.name.toLowerCase() === normalized) ||
    places.find((p) => p.name.toLowerCase().includes(normalized))
  );
}

function formatKm(km) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(2)} km`;
}

function safeNumber(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : "N/A";
}

function apiUrl(path) {
  const base = (demoConfig.API_BASE_URL || "").replace(/\/$/, "");
  return base ? `${base}${path}` : path;
}

function isStaticPagesMode() {
  const host = window.location.hostname;
  const localHosts = new Set(["", "localhost", "127.0.0.1", "::1"]);
  return !demoConfig.API_BASE_URL && !localHosts.has(host);
}

function initMap() {
  if (!window.L || !els.map || mapState.map) return;
  mapState.map = L.map(els.map, { scrollWheelZoom: true }).setView([25.2854, 51.531], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(mapState.map);
  mapState.layer = L.layerGroup().addTo(mapState.map);
}

function clearMap() {
  initMap();
  mapState.layer?.clearLayers();
}

function markerStyle(kind) {
  const styles = {
    source: { color: "#155766", fillColor: "#1f7a8c", radius: 8, weight: 2 },
    verified: { color: "#12643e", fillColor: "#1b7f4f", radius: 8, weight: 2 },
    candidate: { color: "#626f7f", fillColor: "#7b8794", radius: 6, weight: 1 },
    reference: { color: "#7a4b00", fillColor: "#c47f12", radius: 6, weight: 1 },
  };
  return { ...styles[kind], fillOpacity: 0.9 };
}

function popupFor(place, label, extra = "") {
  return `<div class="map-popup"><strong>${label}: ${place.name}</strong><small>${place.address || ""}</small>${extra ? `<br><small>${extra}</small>` : ""}</div>`;
}

function addPlaceMarker(place, kind, label, extra = "") {
  if (!mapState.layer || !Number.isFinite(place?.lat) || !Number.isFinite(place?.lng)) return null;
  return L.circleMarker([place.lat, place.lng], markerStyle(kind))
    .bindPopup(popupFor(place, label, extra))
    .addTo(mapState.layer);
}

function fitMapToPlaces(items) {
  const coordinates = items
    .filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng))
    .map((p) => [p.lat, p.lng]);
  if (!mapState.map || coordinates.length === 0) return;
  if (coordinates.length === 1) {
    mapState.map.setView(coordinates[0], 15);
    return;
  }
  mapState.map.fitBounds(L.latLngBounds(coordinates), { padding: [42, 42], maxZoom: 15 });
}

function renderNearestMap(source, candidates) {
  clearMap();
  if (!source || !candidates.length || !window.L) return;
  addPlaceMarker(source, "source", "Source");
  candidates.forEach((candidate, index) => {
    addPlaceMarker(
      candidate,
      index === 0 ? "verified" : "candidate",
      index === 0 ? "Nearest verified" : `Candidate ${index + 1}`,
      `Distance: ${formatKm(candidate.distanceKm)}`
    );
  });
  const nearest = candidates[0];
  L.polyline(
    [
      [source.lat, source.lng],
      [nearest.lat, nearest.lng],
    ],
    { color: "#1f7a8c", weight: 4, opacity: 0.8, dashArray: "8 8" }
  )
    .bindPopup(`GIS distance: ${formatKm(nearest.distanceKm)}`)
    .addTo(mapState.layer);
  fitMapToPlaces([source, ...candidates]);
}

function renderWithinMap(matches) {
  clearMap();
  if (!matches.length || !window.L) return;
  matches.slice(0, 12).forEach((item, index) => {
    addPlaceMarker(item.target, index === 0 ? "verified" : "candidate", `Target ${index + 1}`, `Distance: ${formatKm(item.distanceKm)}`);
    addPlaceMarker(item.nearest, "reference", "Nearest reference");
    L.polyline(
      [
        [item.target.lat, item.target.lng],
        [item.nearest.lat, item.nearest.lng],
      ],
      { color: "#1f7a8c", weight: index === 0 ? 4 : 2, opacity: index === 0 ? 0.8 : 0.35 }
    ).addTo(mapState.layer);
  });
  fitMapToPlaces(matches.flatMap((item) => [item.target, item.nearest]));
}

function renderCategoryMap(results) {
  clearMap();
  if (!results.length || !window.L) return;
  results.slice(0, 20).forEach((place, index) => {
    addPlaceMarker(
      place,
      index === 0 ? "verified" : "candidate",
      `Rank ${index + 1}`,
      `Rating: ${safeNumber(place.rating)} | Popularity: ${safeNumber(place.popularity, 0)}`
    );
  });
  fitMapToPlaces(results);
}

function decodeHtml(htmlText) {
  const textArea = document.createElement("textarea");
  textArea.innerHTML = htmlText || "";
  return textArea.value;
}

function placeFromHtml(htmlText) {
  const linkMatch = htmlText?.match(/<a [^>]*>(.*?)<\/a>/i);
  if (linkMatch) {
    return findPlaceByName(decodeHtml(linkMatch[1].replace(/<[^>]+>/g, "")).trim());
  }
  return findPlaceByName(decodeHtml(htmlText || "").replace(/<[^>]+>/g, " ").trim());
}

function renderBackendMap(payload) {
  const rows = payload.rows || [];
  const intent = payload.intent || {};
  if (intent.intent === "nearest_search") {
    const source = findPlaceByName(intent.source_place);
    const candidates = rows
      .map((row) => placeFromHtml(row[1]))
      .filter(Boolean)
      .map((place) => ({ ...place, distanceKm: source ? kmBetween(source, place) : 0 }));
    renderNearestMap(source, candidates);
    return;
  }
  if (intent.intent === "within_distance") {
    const matches = rows
      .map((row) => {
        const target = placeFromHtml(row[1]);
        const nearest = placeFromHtml(row[2]);
        return target && nearest ? { target, nearest, distanceKm: kmBetween(target, nearest) } : null;
      })
      .filter(Boolean);
    renderWithinMap(matches);
    return;
  }
  renderCategoryMap(rows.map((row) => placeFromHtml(row[0])).filter(Boolean));
}

function setTrace(items) {
  els.traceList.innerHTML = items.map((item) => `<li>${item}</li>`).join("");
}

function setAnswer(title, text) {
  els.answerTitle.textContent = title;
  els.answerText.textContent = text;
}

function setTable(headers, rows) {
  els.resultHead.innerHTML = `<tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>`;
  els.resultBody.innerHTML = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
    .join("");
}

function placeLink(place) {
  const maps = place.mapsUrl || `https://maps.google.com/?q=${place.lat},${place.lng}`;
  return `<a href="${maps}" target="_blank" rel="noreferrer">${place.name}</a><br><small>${place.address || ""}</small>`;
}

function populateControls() {
  const allTypes = uniqueSorted(places.flatMap((p) => p.types || []));
  const usefulTypes = allTypes.filter((t) => !["establishment", "point_of_interest"].includes(t));
  const municipalities = ["All municipalities", ...uniqueSorted(places.map((p) => p.municipality))];

  for (const select of [els.nearestType, els.withinTarget, els.withinReference, els.categoryType]) {
    select.innerHTML = usefulTypes.map((type) => `<option value="${type}">${type}</option>`).join("");
  }

  els.nearestType.value = "hospital";
  els.withinTarget.value = "school";
  els.withinReference.value = "hospital";
  els.categoryType.value = "tourist_attraction";
  els.municipalityFilter.innerHTML = municipalities
    .map((m) => `<option value="${m}">${m}</option>`)
    .join("");

  els.placeNames.innerHTML = places
    .map((p) => `<option value="${p.name.replaceAll('"', "&quot;")}"></option>`)
    .join("");
}

function renderStats() {
  const withRating = places.filter((p) => Number.isFinite(p.rating)).length;
  const allTypes = uniqueSorted(places.flatMap((p) => p.types || []));
  const withImages = places.filter((p) => p.id).length;
  els.stats.innerHTML = [
    ["1,000", "place records"],
    [allTypes.length, "place types"],
    [withRating, "with ratings"],
    [withImages, "with coordinates"],
  ]
    .map(([value, label]) => `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`)
    .join("");
}

function runNearest() {
  const source = findPlaceByName(els.nearestSource.value || "Villaggio Mall");
  const targetType = els.nearestType.value;
  const limit = Math.max(1, Math.min(20, Number(els.nearestLimit.value) || 5));

  if (!source) {
    setAnswer("Source place not found", "Try a place name from the dataset, such as Villaggio Mall or Souq Waqif.");
    setTrace(["No source place matched the query."]);
    setTable([], []);
    clearMap();
    return;
  }

  const candidates = places
    .filter((p) => p.id !== source.id && hasType(p, targetType))
    .map((p) => ({ ...p, distanceKm: kmBetween(source, p) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);

  setAnswer(
    `Nearest ${targetType.replaceAll("_", " ")} to ${source.name}`,
    `The nearest result is ${candidates[0]?.name || "not available"}, verified by calculating coordinate distance from ${source.name}.`
  );
  setTrace([
    `Retrieved source place: <strong>${source.name}</strong>.`,
    `Filtered candidate places by type: <strong>${targetType}</strong> (${candidates.length} shown).`,
    "Calculated haversine distance from the source coordinate to every candidate coordinate.",
    "Sorted candidates by distance and returned the nearest verified results.",
  ]);
  setTable(
    ["Verified", "Place", "Distance", "Rating", "Popularity"],
    candidates.map((p) => [
      `<span class="badge">GIS checked</span>`,
      placeLink(p),
      formatKm(p.distanceKm),
      safeNumber(p.rating),
      safeNumber(p.popularity, 0),
    ])
  );
  renderNearestMap(source, candidates);
}

function runWithin() {
  const targetType = els.withinTarget.value;
  const referenceType = els.withinReference.value;
  const maxKm = Math.max(0.1, Number(els.withinKm.value) || 1);
  const targets = places.filter((p) => hasType(p, targetType));
  const references = places.filter((p) => hasType(p, referenceType));

  const matches = targets
    .map((target) => {
      const nearest = references
        .filter((ref) => ref.id !== target.id)
        .map((ref) => ({ ref, distanceKm: kmBetween(target, ref) }))
        .sort((a, b) => a.distanceKm - b.distanceKm)[0];
      return nearest ? { target, nearest: nearest.ref, distanceKm: nearest.distanceKm } : null;
    })
    .filter(Boolean)
    .filter((item) => item.distanceKm <= maxKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 25);

  setAnswer(
    `${matches.length} ${targetType.replaceAll("_", " ")} places verified within ${maxKm} km`,
    `The system retrieved ${targets.length} target places and ${references.length} reference places, then verified which targets are within the distance threshold.`
  );
  setTrace([
    `Retrieved targets by type: <strong>${targetType}</strong> (${targets.length} places).`,
    `Retrieved references by type: <strong>${referenceType}</strong> (${references.length} places).`,
    `Calculated the nearest reference distance for each target using coordinates.`,
    `Kept only targets with verified distance ≤ <strong>${maxKm} km</strong>.`,
  ]);
  setTable(
    ["Verified", "Target place", "Nearest reference", "Distance", "Rating"],
    matches.map((item) => [
      `<span class="badge">within ${maxKm} km</span>`,
      placeLink(item.target),
      placeLink(item.nearest),
      formatKm(item.distanceKm),
      safeNumber(item.target.rating),
    ])
  );
  renderWithinMap(matches);
}

function runCategory() {
  const type = els.categoryType.value;
  const sortBy = els.categorySort.value;
  const municipality = els.municipalityFilter.value;
  let results = places.filter((p) => hasType(p, type));

  if (municipality !== "All municipalities") {
    results = results.filter((p) => p.municipality === municipality);
  }

  results = results
    .sort((a, b) => (Number(b[sortBy]) || -1) - (Number(a[sortBy]) || -1))
    .slice(0, 20);

  setAnswer(
    `Top ${type.replaceAll("_", " ")} results`,
    `Retrieved ${results.length} places sorted by ${sortBy}. This is structured retrieval rather than distance verification.`
  );
  setTrace([
    `Filtered places by type: <strong>${type}</strong>.`,
    municipality === "All municipalities"
      ? "No municipality filter applied."
      : `Filtered municipality: <strong>${municipality}</strong>.`,
    `Sorted matching places by <strong>${sortBy}</strong>.`,
    "Returned ranked POI records with evidence fields from the dataset.",
  ]);
  setTable(
    ["Place", "Municipality", "Rating", "Ratings", "Popularity"],
    results.map((p) => [
      placeLink(p),
      p.municipality || "N/A",
      safeNumber(p.rating),
      p.ratingsTotal ?? "N/A",
      safeNumber(p.popularity, 0),
    ])
  );
  renderCategoryMap(results);
}

function applyExample(name) {
  if (name === "nearest") {
    els.nearestSource.value = "Villaggio Mall";
    els.nearestType.value = "hospital";
    els.nearestLimit.value = 5;
    runNearest();
  }
  if (name === "within") {
    els.withinTarget.value = "school";
    els.withinReference.value = "hospital";
    els.withinKm.value = 1;
    runWithin();
  }
  if (name === "popular") {
    els.categoryType.value = "tourist_attraction";
    els.categorySort.value = "popularity";
    els.municipalityFilter.value = "All municipalities";
    runCategory();
  }
  if (name === "municipality") {
    els.categoryType.value = "hospital";
    els.categorySort.value = "popularity";
    els.municipalityFilter.value = "Doha Municipality";
    runCategory();
  }
}

async function runNaturalLanguage() {
  const question = (els.nlQuestion.value || "").trim();
  if (!question) {
    setAnswer("Please enter a question", "Try: What is the nearest hospital to Villaggio Mall?");
    setTrace(["No natural-language question was entered."]);
    setTable([], []);
    clearMap();
    return;
  }

  if (isStaticPagesMode()) {
    setAnswer(
      "AI backend not connected on GitHub Pages",
      "The static website can run the GIS search tools in the browser. Natural-language AI parsing needs the Python backend deployed separately, then its URL should be added in config.js."
    );
    setTrace([
      "GitHub Pages is serving the frontend only.",
      "The OpenAI API key is not exposed in public files.",
      "Deploy server.py to a backend host such as Render, then set API_BASE_URL in config.js.",
    ]);
    setTable([], []);
    clearMap();
    return;
  }

  setAnswer("Thinking...", "The AI parser is converting your question into a structured GIS query.");
  setTrace(["Sending question to the local backend.", "Waiting for intent parsing and GIS verification."]);
  setTable([], []);
  clearMap();

  try {
    const response = await fetch(apiUrl("/api/ask"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const payload = await response.json();
    if (!response.ok || payload.error) {
      throw new Error(payload.error || "Request failed");
    }

    setAnswer(payload.title, payload.answer);
    setTrace(payload.trace || []);
    setTable(payload.headers || [], payload.rows || []);
    renderBackendMap(payload);
  } catch (error) {
    setAnswer("AI query failed", error.message);
    setTrace([
      "The browser reached the demo, but the AI backend could not complete the request.",
      "Check that server.py is running and the AI provider environment variables are set.",
    ]);
    setTable([], []);
    clearMap();
  }
}

document.querySelector("#runNaturalLanguage").addEventListener("click", runNaturalLanguage);
document.querySelector("#runNearest").addEventListener("click", runNearest);
document.querySelector("#runWithin").addEventListener("click", runWithin);
document.querySelector("#runCategory").addEventListener("click", runCategory);
document.querySelectorAll("[data-example]").forEach((button) => {
  button.addEventListener("click", () => applyExample(button.dataset.example));
});

populateControls();
renderStats();
initMap();
applyExample("nearest");
