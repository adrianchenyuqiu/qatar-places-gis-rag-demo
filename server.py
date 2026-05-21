import json
import math
import os
import re
import urllib.error
import urllib.request
from difflib import get_close_matches
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SOURCE = Path("/Users/adrian/Downloads/Qatar_google_maps_places_sample_1000.jsonl")
COMPACT_DATA = ROOT / "places_compact.json"
APP_VERSION = "2026-05-21-fanar-resilient-v2"

TYPE_ALIASES = {
    "hospitals": "hospital",
    "clinics": "doctor",
    "schools": "school",
    "parks": "park",
    "restaurant": "restaurant",
    "restaurants": "restaurant",
    "resturant": "restaurant",
    "resturants": "restaurant",
    "restaraunt": "restaurant",
    "restaraunts": "restaurant",
    "food": "restaurant",
    "malls": "shopping_mall",
    "shopping_malls": "shopping_mall",
    "shopping malls": "shopping_mall",
    "attractions": "tourist_attraction",
    "tourist attractions": "tourist_attraction",
    "tourist_attractions": "tourist_attraction",
    "hotels": "lodging",
    "hotel": "lodging",
}



def load_local_env():
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


load_local_env()


def extract_component(record, component_type):
    for component in record.get("address_components") or []:
        if component_type in (component.get("types") or []):
            return component.get("longText") or ""
    return ""


def compact_record(record):
    coords = record.get("coordinates") or {}
    return {
        "id": record.get("place_id"),
        "name": record.get("name") or "",
        "address": record.get("formatted_address") or "",
        "lat": coords.get("latitude"),
        "lng": coords.get("longitude"),
        "types": record.get("types") or [],
        "rating": record.get("rating"),
        "ratingsTotal": record.get("user_ratings_total"),
        "popularity": record.get("popularity_score"),
        "municipality": extract_component(record, "administrative_area_level_1"),
        "zone": extract_component(record, "administrative_area_level_2"),
        "locality": extract_component(record, "locality"),
        "mapsUrl": record.get("google_maps_url"),
    }


def load_places():
    if COMPACT_DATA.exists():
        return json.loads(COMPACT_DATA.read_text(encoding="utf-8"))

    records = []
    with SOURCE.open(encoding="utf-8") as f:
        for line in f:
            if line.strip():
                item = compact_record(json.loads(line))
                if isinstance(item["lat"], (int, float)) and isinstance(item["lng"], (int, float)):
                    records.append(item)
    return records


PLACES = load_places()
PLACE_TYPES = sorted(
    {
        place_type
        for place in PLACES
        for place_type in place["types"]
        if place_type not in {"establishment", "point_of_interest"}
    }
)
MUNICIPALITIES = sorted({p["municipality"] for p in PLACES if p["municipality"]})


def km_between(a, b):
    radius_km = 6371.0088
    lat1 = math.radians(a["lat"])
    lat2 = math.radians(b["lat"])
    dlat = math.radians(b["lat"] - a["lat"])
    dlng = math.radians(b["lng"] - a["lng"])
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 2 * radius_km * math.asin(math.sqrt(h))


def has_type(place, place_type):
    return place_type in place["types"]


def normalize(text):
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def find_place(name):
    query = normalize(name)
    if not query:
        return None
    exact = [p for p in PLACES if normalize(p["name"]) == query]
    if exact:
        return exact[0]
    contains = [p for p in PLACES if query in normalize(p["name"])]
    if contains:
        return contains[0]
    reverse_contains = [p for p in PLACES if normalize(p["name"]) in query]
    return reverse_contains[0] if reverse_contains else None


def resolve_type(value):
    if not value:
        return None
    query = normalize(value).replace(" ", "_")
    query = TYPE_ALIASES.get(query, query)
    if query in PLACE_TYPES:
        return query
    for place_type in PLACE_TYPES:
        if query in place_type or place_type in query:
            return place_type
    return query


def infer_type_from_text(text):
    query = normalize(text)
    underscored = query.replace(" ", "_")
    for alias, place_type in TYPE_ALIASES.items():
        alias_text = alias.replace("_", " ")
        if re.search(rf"\b{re.escape(alias_text)}\b", query) or re.search(rf"\b{re.escape(alias)}\b", underscored):
            return place_type

    candidates = {}
    for place_type in PLACE_TYPES:
        readable = place_type.replace("_", " ")
        candidates[place_type] = place_type
        candidates[readable] = place_type
        candidates[f"{readable}s"] = place_type

    for label, place_type in candidates.items():
        if re.search(rf"\b{re.escape(label)}\b", query):
            return place_type

    stop_words = {
        "what", "which", "where", "nearest", "closest", "near", "to", "from", "within",
        "the", "a", "an", "is", "are", "of", "in", "around", "nearby", "best", "top",
        "popular", "rated", "rating", "villaggio", "mall",
    }
    tokens = [token for token in re.findall(r"[a-z_]{4,}", query) if token not in stop_words]
    labels = list(candidates.keys()) + list(TYPE_ALIASES.keys())
    for token in tokens:
        matches = get_close_matches(token, labels, n=1, cutoff=0.78)
        if matches:
            return TYPE_ALIASES.get(matches[0], candidates.get(matches[0]))
    return None


def find_place_in_text(text):
    query = normalize(text)
    for place in sorted(PLACES, key=lambda p: len(p["name"] or ""), reverse=True):
        if normalize(place["name"]) and normalize(place["name"]) in query:
            return place["name"]
    return None


def resolve_municipality(value):
    if not value:
        return None
    query = normalize(value)
    if query in {"all", "all municipalities", "qatar"}:
        return None
    if query == "doha":
        query = "doha municipality"
    for municipality in MUNICIPALITIES:
        if normalize(municipality) == query or query in normalize(municipality):
            return municipality
    return value


def format_km(km):
    return f"{round(km * 1000)} m" if km < 1 else f"{km:.2f} km"


def link(place):
    url = place.get("mapsUrl") or f"https://maps.google.com/?q={place['lat']},{place['lng']}"
    return f'<a href="{url}" target="_blank" rel="noreferrer">{place["name"]}</a><br><small>{place["address"]}</small>'


def safe_number(value, digits=1):
    return f"{value:.{digits}f}" if isinstance(value, (int, float)) else "N/A"


def parse_json_content(content):
    if isinstance(content, list):
        content = "".join(part.get("text", "") if isinstance(part, dict) else str(part) for part in content)
    content = (content or "").strip()
    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?\s*", "", content)
        content = re.sub(r"\s*```$", "", content).strip()
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", content or "", re.DOTALL)
        if match:
            return json.loads(match.group(0))
        raise


def response_message_content(payload):
    choices = payload.get("choices") or []
    if not choices:
        raise ValueError(f"LLM response has no choices: {payload}")
    message = choices[0].get("message") or {}
    if "content" in message:
        return message["content"]
    if "text" in choices[0]:
        return choices[0]["text"]
    raise ValueError(f"LLM response has no message content: {payload}")


def chat_completion_url(provider):
    if provider == "fanar":
        explicit_url = os.getenv("FANAR_API_URL")
        if explicit_url:
            return explicit_url
        base_url = os.getenv("FANAR_API_BASE_URL", "https://api.fanar.qa/v1")
        return f"{base_url.rstrip('/')}/chat/completions"
    return "https://api.openai.com/v1/chat/completions"


def llm_settings():
    provider = os.getenv("AI_PROVIDER", "fanar").strip().lower()
    if provider == "fanar":
        return {
            "provider": "fanar",
            "api_key": os.getenv("FANAR_API_KEY"),
            "model": os.getenv("FANAR_MODEL", "Fanar"),
            "url": chat_completion_url("fanar"),
        }
    return {
        "provider": "openai",
        "api_key": os.getenv("OPENAI_API_KEY"),
        "model": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        "url": chat_completion_url("openai"),
    }


def llm_json(messages):
    settings = llm_settings()
    api_key = settings["api_key"]
    if not api_key:
        key_name = "FANAR_API_KEY" if settings["provider"] == "fanar" else "OPENAI_API_KEY"
        raise RuntimeError(f"{key_name} is not set. Add it to your local .env or deployment environment.")

    body = {
        "model": settings["model"],
        "messages": messages,
        "temperature": 0,
    }
    use_json_mode = settings["provider"] != "fanar"
    attempts = [dict(body, response_format={"type": "json_object"}), body] if use_json_mode else [body]
    last_error = None
    for payload_body in attempts:
        data = json.dumps(payload_body).encode("utf-8")
        request = urllib.request.Request(
            settings["url"],
            data=data,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                payload = json.loads(response.read().decode("utf-8"))
                content = response_message_content(payload)
                return parse_json_content(content)
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            last_error = detail
            if "response_format" not in detail and "json_object" not in detail:
                break
        except (json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
            last_error = str(exc)
            continue

    raise RuntimeError(f"{settings['provider'].title()} API error: {last_error}")


def rule_based_intent(question):
    query = normalize(question)
    limit_match = re.search(r"\btop\s+(\d+)|\b(\d+)\s+results?\b", query)
    limit = int(next(group for group in limit_match.groups() if group)) if limit_match else None

    if "nearest" in query or "closest" in query:
        source_place = find_place_in_text(question)
        target_text = query.split(" to ", 1)[0] if " to " in query else query.split(" near ", 1)[0]
        target_type = infer_type_from_text(target_text)
        return {
            "intent": "nearest_search",
            "source_place": source_place or "Villaggio Mall",
            "target_type": target_type or "hospital",
            "limit": limit or 5,
        }

    distance_match = re.search(r"within\s+([0-9]+(?:\.[0-9]+)?)\s*(?:km|kilometer|kilometers)", query)
    if "within" in query and distance_match:
        target_text = query.split("within", 1)[0]
        reference_text = query.split(" of ", 1)[1] if " of " in query else query.split(" from ", 1)[1] if " from " in query else ""
        target_type = infer_type_from_text(target_text)
        reference_type = infer_type_from_text(reference_text)
        return {
            "intent": "within_distance",
            "target_type": target_type or "school",
            "reference_type": reference_type or "hospital",
            "distance_km": float(distance_match.group(1)),
        }

    target_type = infer_type_from_text(query)
    if target_type:
        sort_by = "rating" if "rating" in query or "rated" in query else "popularity"
        return {
            "intent": "category_search",
            "target_type": target_type,
            "sort_by": sort_by,
            "limit": limit or 10,
        }

    return {"intent": "unsupported", "reason": "This question is outside the current POI point-data demo."}


def grounded_intent(question, intent):
    if not isinstance(intent, dict):
        return rule_based_intent(question)
    grounded = dict(intent)
    query = normalize(question)
    if grounded.get("intent") == "nearest_search":
        target_text = query.split(" to ", 1)[0] if " to " in query else query.split(" near ", 1)[0]
        grounded_type = infer_type_from_text(target_text)
        grounded_source = find_place_in_text(question)
        if grounded_type:
            grounded["target_type"] = grounded_type
        if grounded_source:
            grounded["source_place"] = grounded_source
    elif grounded.get("intent") == "within_distance":
        target_text = query.split("within", 1)[0]
        reference_text = query.split(" of ", 1)[1] if " of " in query else query.split(" from ", 1)[1] if " from " in query else ""
        grounded_target = infer_type_from_text(target_text)
        grounded_reference = infer_type_from_text(reference_text)
        if grounded_target:
            grounded["target_type"] = grounded_target
        if grounded_reference:
            grounded["reference_type"] = grounded_reference
    elif grounded.get("intent") == "category_search":
        grounded_type = infer_type_from_text(query)
        if grounded_type:
            grounded["target_type"] = grounded_type
    return grounded


def parse_intent(question):
    type_examples = ", ".join(PLACE_TYPES[:120])
    municipality_examples = ", ".join(MUNICIPALITIES[:40])
    try:
        intent = llm_json(
            [
                {
                    "role": "system",
                    "content": (
                        "You convert a user's map question into exactly one valid JSON object. "
                        "Do not include markdown, explanations, or code fences. "
                        "The JSON object is for a local Qatar POI dataset. "
                        "Supported intents: nearest_search, within_distance, category_search, unsupported. "
                        "Use only these JSON keys when relevant: intent, source_place, target_type, reference_type, "
                        "distance_km, municipality, sort_by, limit, reason. "
                        "Valid sort_by values: popularity, rating, ratingsTotal. "
                        "For nearest_search, include source_place and target_type. "
                        "For within_distance, include target_type, reference_type, and distance_km. "
                        "For category_search, include target_type and optional municipality/sort_by/limit. "
                        "If the question requires roads, routes, polygons, live traffic, reviews, or flood zones, use unsupported. "
                        f"Common place types include: {type_examples}. "
                        f"Municipalities include: {municipality_examples}."
                    ),
                },
                {"role": "user", "content": question},
            ]
        )
        return grounded_intent(question, intent)
    except Exception:
        return rule_based_intent(question)


def generate_answer(question, title, trace, rows):
    compact_rows = rows[:8]
    try:
        payload = llm_json(
            [
                {
                    "role": "system",
                    "content": (
                        "Write a concise answer for a GIS-verified map QA demo. "
                        "Return JSON with key 'answer'. Mention that the result is based on the Qatar POI dataset "
                        "and verified with coordinate-based GIS distance calculation when distance is involved."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "question": question,
                            "title": title,
                            "trace": trace,
                            "rows": compact_rows,
                        },
                        ensure_ascii=False,
                    ),
                },
            ]
        )
        answer = payload.get("answer") if isinstance(payload, dict) else None
        if isinstance(answer, str):
            return answer
        if isinstance(answer, dict):
            for key in ("answer", "result", "text", "message"):
                if isinstance(answer.get(key), str):
                    return answer[key]
            return json.dumps(answer, ensure_ascii=False)
        return title
    except Exception:
        return title


def execute_nearest(intent):
    source = find_place(intent.get("source_place"))
    target_type = resolve_type(intent.get("target_type"))
    limit = max(1, min(20, int(intent.get("limit") or 5)))
    if not source:
        raise ValueError("Source place was not found in the dataset.")
    candidates = [
        {**p, "distanceKm": km_between(source, p)}
        for p in PLACES
        if p["id"] != source["id"] and has_type(p, target_type)
    ]
    candidates.sort(key=lambda p: p["distanceKm"])
    shown = candidates[:limit]
    title = f"Nearest {target_type.replace('_', ' ')} to {source['name']}"
    trace = [
        f"AI parsed intent: <strong>nearest_search</strong>.",
        f"Matched source place: <strong>{source['name']}</strong>.",
        f"Retrieved candidate places by type: <strong>{target_type}</strong> ({len(candidates)} candidates).",
        "Calculated coordinate distance from the source place to every candidate.",
        "Sorted by distance and returned verified nearest results.",
    ]
    headers = ["Verified", "Place", "Distance", "Rating", "Popularity"]
    rows = [
        [
            '<span class="badge">GIS checked</span>',
            link(p),
            format_km(p["distanceKm"]),
            safe_number(p.get("rating")),
            safe_number(p.get("popularity"), 0),
        ]
        for p in shown
    ]
    answer = f"The nearest result is {shown[0]['name']} at {format_km(shown[0]['distanceKm'])}." if shown else "No matching places were found."
    return title, answer, trace, headers, rows


def execute_within(intent):
    target_type = resolve_type(intent.get("target_type"))
    reference_type = resolve_type(intent.get("reference_type"))
    max_km = float(intent.get("distance_km") or 1)
    municipality = resolve_municipality(intent.get("municipality"))

    targets = [p for p in PLACES if has_type(p, target_type)]
    references = [p for p in PLACES if has_type(p, reference_type)]
    if municipality:
        targets = [p for p in targets if p.get("municipality") == municipality]
        references = [p for p in references if p.get("municipality") == municipality]

    matches = []
    for target in targets:
        nearest = sorted(
            ((km_between(target, ref), ref) for ref in references if ref["id"] != target["id"]),
            key=lambda item: item[0],
        )
        if nearest and nearest[0][0] <= max_km:
            matches.append((nearest[0][0], target, nearest[0][1]))
    matches.sort(key=lambda item: item[0])
    shown = matches[:25]

    title = f"{len(matches)} {target_type.replace('_', ' ')} places within {max_km:g} km"
    trace = [
        f"AI parsed intent: <strong>within_distance</strong>.",
        f"Retrieved targets: <strong>{target_type}</strong> ({len(targets)} places).",
        f"Retrieved references: <strong>{reference_type}</strong> ({len(references)} places).",
        f"Applied distance threshold: <strong>{max_km:g} km</strong>.",
        "Calculated nearest reference distance for each target and kept verified matches.",
    ]
    if municipality:
        trace.insert(2, f"Applied municipality filter: <strong>{municipality}</strong>.")
    headers = ["Verified", "Target place", "Nearest reference", "Distance", "Rating"]
    rows = [
        [
            f'<span class="badge">within {max_km:g} km</span>',
            link(target),
            link(ref),
            format_km(distance),
            safe_number(target.get("rating")),
        ]
        for distance, target, ref in shown
    ]
    answer = f"I found {len(matches)} verified matches within {max_km:g} km."
    return title, answer, trace, headers, rows


def execute_category(intent):
    target_type = resolve_type(intent.get("target_type"))
    municipality = resolve_municipality(intent.get("municipality"))
    sort_by = intent.get("sort_by") or "popularity"
    if sort_by not in {"popularity", "rating", "ratingsTotal"}:
        sort_by = "popularity"
    limit = max(1, min(30, int(intent.get("limit") or 10)))

    results = [p for p in PLACES if has_type(p, target_type)]
    if municipality:
        results = [p for p in results if p.get("municipality") == municipality]
    results.sort(key=lambda p: p.get(sort_by) if isinstance(p.get(sort_by), (int, float)) else -1, reverse=True)
    shown = results[:limit]

    title = f"Top {target_type.replace('_', ' ')} results"
    trace = [
        f"AI parsed intent: <strong>category_search</strong>.",
        f"Retrieved places by type: <strong>{target_type}</strong> ({len(results)} matches after filters).",
        f"Sorted by: <strong>{sort_by}</strong>.",
        "Returned ranked POI records from the Qatar places dataset.",
    ]
    if municipality:
        trace.insert(2, f"Applied municipality filter: <strong>{municipality}</strong>.")
    headers = ["Place", "Municipality", "Rating", "Ratings", "Popularity"]
    rows = [
        [link(p), p.get("municipality") or "N/A", safe_number(p.get("rating")), p.get("ratingsTotal") or "N/A", safe_number(p.get("popularity"), 0)]
        for p in shown
    ]
    answer = f"I found {len(results)} matching places and returned the top {len(shown)}."
    return title, answer, trace, headers, rows


def handle_question(question):
    intent = parse_intent(question)
    if intent.get("intent") == "nearest_search":
        title, answer, trace, headers, rows = execute_nearest(intent)
    elif intent.get("intent") == "within_distance":
        title, answer, trace, headers, rows = execute_within(intent)
    elif intent.get("intent") == "category_search":
        title, answer, trace, headers, rows = execute_category(intent)
    else:
        reason = intent.get("reason") or "This question is outside the current POI point-data demo."
        title = "Question not supported by this dataset"
        answer = f"I cannot fully verify this question with the current dataset. {reason}"
        trace = [
            "AI parsed the question as unsupported.",
            "The current dataset contains POI points, but not roads, routes, polygons, reviews, live traffic, or flood-risk layers.",
        ]
        headers, rows = [], []
    answer = generate_answer(question, title, trace, rows) if rows else answer
    return {"title": title, "answer": answer, "trace": trace, "headers": headers, "rows": rows, "intent": intent}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", os.getenv("ALLOWED_ORIGIN", "*"))
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if self.path == "/api/health":
            payload = {
                "ok": True,
                "version": APP_VERSION,
                "provider": os.getenv("AI_PROVIDER", "fanar"),
                "model": os.getenv("FANAR_MODEL", os.getenv("OPENAI_MODEL", "Fanar")),
                "fanar_key_configured": bool(os.getenv("FANAR_API_KEY")),
            }
            encoded = json.dumps(payload).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)
            return
        super().do_GET()

    def do_POST(self):
        if self.path != "/api/ask":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length).decode("utf-8")
            question = (json.loads(body).get("question") or "").strip()
            if not question:
                raise ValueError("Question is empty.")
            payload = handle_question(question)
            self.send_response(200)
        except Exception as exc:
            payload = {"error": str(exc)}
            self.send_response(400)

        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


def main():
    port = int(os.getenv("PORT", "8766"))
    host = os.getenv("HOST", "0.0.0.0")
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"Serving AI demo on http://localhost:{port}")
    print("The AI API key is read from environment variables and is not stored in project files.")
    server.serve_forever()


if __name__ == "__main__":
    main()
