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

Natural-language AI parsing does not run on GitHub Pages by itself because GitHub Pages cannot securely store `OPENAI_API_KEY` or run `server.py`.

This repository includes `.github/workflows/pages.yml`. After pushing to GitHub, enable Pages with GitHub Actions as the source, then the workflow will publish the site.

## Option 2: Render Backend

1. Push this folder to a GitHub repository.
2. Create a new **Web Service** on Render.
3. Select the repository.
4. Use these settings:
   - Runtime: Python
   - Build command: `python prepare_data.py`
   - Start command: `python server.py`
5. Add environment variables:
   - `OPENAI_API_KEY`: your OpenAI API key
   - `OPENAI_MODEL`: `gpt-4o-mini`
6. Deploy.

The app will use the platform-provided `PORT` automatically.

After Render deploys, copy the Render service URL and update `config.js`:

```js
window.QATAR_DEMO_CONFIG = {
  API_BASE_URL: "https://your-render-service.onrender.com",
};
```

Then push that `config.js` change to GitHub so the GitHub Pages frontend can call the backend.

## What Gets Deployed

- `index.html`, `styles.css`, and `app.js`: frontend UI
- `places_data.js`: browser-side demo data
- `places_compact.json`: backend-side POI data
- `server.py`: API backend for natural-language parsing and GIS verification

## Security

Do not commit `.env`.

The `.gitignore` file excludes `.env`, so the API key should be configured only in the deployment platform's environment variables.
