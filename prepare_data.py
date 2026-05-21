import json
from pathlib import Path


SOURCE = Path("/Users/adrian/Downloads/Qatar_google_maps_places_sample_1000.jsonl")
OUT = Path(__file__).with_name("places_data.js")
JSON_OUT = Path(__file__).with_name("places_compact.json")


def extract_component(record, component_type):
    for component in record.get("address_components") or []:
        if component_type in (component.get("types") or []):
            return component.get("longText")
    return ""


def compact_record(record):
    coords = record.get("coordinates") or {}
    return {
        "id": record.get("place_id"),
        "googlePlaceId": record.get("google_place_id"),
        "name": record.get("name"),
        "address": record.get("formatted_address"),
        "lat": coords.get("latitude"),
        "lng": coords.get("longitude"),
        "types": record.get("types") or [],
        "rating": record.get("rating"),
        "ratingsTotal": record.get("user_ratings_total"),
        "popularity": record.get("popularity_score"),
        "municipality": extract_component(record, "administrative_area_level_1"),
        "zone": extract_component(record, "administrative_area_level_2"),
        "locality": extract_component(record, "locality"),
        "phone": record.get("international_phone_number") or record.get("phone_number"),
        "website": record.get("website"),
        "mapsUrl": record.get("google_maps_url"),
    }


def main():
    if not SOURCE.exists() and OUT.exists() and JSON_OUT.exists():
        print(f"Source file not found: {SOURCE}")
        print("Using committed places_data.js and places_compact.json instead.")
        return

    records = []
    with SOURCE.open(encoding="utf-8") as f:
        for line in f:
            if line.strip():
                records.append(compact_record(json.loads(line)))

    payload = "window.PLACES = " + json.dumps(records, ensure_ascii=False, indent=2) + ";\n"
    OUT.write_text(payload, encoding="utf-8")
    JSON_OUT.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(records)} records to {OUT}")
    print(f"Wrote {len(records)} records to {JSON_OUT}")


if __name__ == "__main__":
    main()
