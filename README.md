# Qatar Places GIS-Verified RAG Demo

This is a small local demo for **GIS-Verified RAG for Reliable Map-Based Question Answering**.

The demo uses `/Users/adrian/Downloads/Qatar_google_maps_places_sample_1000.jsonl` as a Qatar POI knowledge base. It supports:

- nearest-place search
- within-distance verification
- category and popularity search
- municipality filtering

## Run the Static Demo

```bash
cd /Users/adrian/Desktop/QCRI/qatar_places_demo
/Users/adrian/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 prepare_data.py
/Users/adrian/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m http.server 8765
```

Then open:

```text
http://localhost:8765
```

## Run the AI Natural-Language Demo

Do not hard-code your API key into the source files. Either set it as a local environment variable:

```bash
cd /Users/adrian/Desktop/QCRI/qatar_places_demo
export OPENAI_API_KEY="YOUR_KEY_HERE"
/Users/adrian/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 prepare_data.py
/Users/adrian/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 server.py
```

Or create a local `.env` file in this folder:

```bash
cd /Users/adrian/Desktop/QCRI/qatar_places_demo
cp .env.example .env
```

Then edit `.env` and replace `your_openai_api_key_here` with your key. The `.env` file is ignored by git.

Then open:

```text
http://localhost:8766
```

## Deploy

See `DEPLOYMENT.md` for deployment instructions.

There are two deployment modes:

- GitHub Pages: publishes the static website. The built-in GIS tools work in the browser.
- Python backend hosting: enables the natural-language AI parser. Set `OPENAI_API_KEY` in the deployment platform's environment variables instead of committing it to the project.

For GitHub Pages, keep `config.js` with an empty `API_BASE_URL`. After deploying `server.py` on a backend host, set `API_BASE_URL` to that backend URL.

## Research Connection

The demo shows the project idea:

1. Retrieve relevant places from a geospatial knowledge base.
2. Use coordinates to calculate spatial relationships.
3. Verify the result with GIS-style distance logic.
4. Generate a readable answer with evidence and a verification trace.
