# Deployment Guide

This folder is ready to deploy in two ways:

- as a static GitHub Pages website
- as a small Python web service for the AI natural-language backend

## Option 1: GitHub Pages Static Website

GitHub Pages can host the frontend files:

- `index.html`
- `styles.css`
- `app.js`
- `config.js`
- `places_data.js`

The browser-side GIS tools work on GitHub Pages because the POI data is already included in `places_data.js`.

Natural-language AI parsing does not run on GitHub Pages by itself because GitHub Pages cannot securely store `FANAR_API_KEY` or run `server.py`.

This repository includes `.github/workflows/pages.yml`. After pushing to GitHub, enable Pages with GitHub Actions as the source, then the workflow will publish the site.

## Option 2: Render Backend

The repository includes `render.yaml`, so Render can deploy the backend from the GitHub repo.

1. Go to Render and create a new **Blueprint** or **Web Service** from this repository.
2. If using Blueprint, Render will read `render.yaml`.
3. If using Web Service manually, use these settings:
   - Runtime: Python
   - Build command: `python prepare_data.py`
   - Start command: `python server.py`
4. Add environment variables:
   - `AI_PROVIDER`: `fanar`
   - `FANAR_API_KEY`: your Fanar API key
   - `FANAR_API_BASE_URL`: `https://api.fanar.qa/v1`
   - `FANAR_MODEL`: `Fanar`
   - `ALLOWED_ORIGIN`: `https://adrianchenyuqiu.github.io`
5. Deploy.

The app will use the platform-provided `PORT` automatically.

This frontend is already configured to call:

```text
https://qatar-places-gis-rag-demo-api.onrender.com
```

If Render gives the service a different URL, copy the Render service URL and update `config.js`:

```js
window.QATAR_DEMO_CONFIG = {
  API_BASE_URL: "https://your-render-service.onrender.com",
};
```

Then push that `config.js` change to GitHub so the GitHub Pages frontend can call the backend.

You can test the backend health endpoint after deployment:

```text
https://qatar-places-gis-rag-demo-api.onrender.com/api/health
```

## What Gets Deployed

- `index.html`, `styles.css`, and `app.js`: frontend UI
- `places_data.js`: browser-side demo data
- `places_compact.json`: backend-side POI data
- `server.py`: API backend for natural-language parsing and GIS verification

## Security

Do not commit `.env`.

The `.gitignore` file excludes `.env`, so the API key should be configured only in the deployment platform's environment variables.
