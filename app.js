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
    return;
  }

  setAnswer("Thinking...", "The AI parser is converting your question into a structured GIS query.");
  setTrace(["Sending question to the local backend.", "Waiting for intent parsing and GIS verification."]);
  setTable([], []);

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
  } catch (error) {
    setAnswer("AI query failed", error.message);
    setTrace([
      "The browser reached the demo, but the AI backend could not complete the request.",
      "Check that server.py is running and the AI provider environment variables are set.",
    ]);
    setTable([], []);
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
applyExample("nearest");
