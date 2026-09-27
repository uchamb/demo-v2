# demo-v2 — VR Vake

[Open the live demo](https://uchamb.github.io/demo-v2/)

Explore VR Vake Sky Tower in its mapped neighborhood, move through sections and floors, inspect furnished apartments, and switch between day, sunset and night.

## Run locally

Use Node.js 20 or newer.

```sh
npm ci
npm run dev
```

Open http://localhost:5179/demo-v2/. The development server is also accessible to devices on the same network.

## Build and preview

```sh
npm run build
npm run preview
```

Open http://localhost:5183/demo-v2/. The `dist` directory is a complete static website. JavaScript, fonts, geometry and reference images are bundled locally; no backend or runtime API key is required. Use an HTTP server, not a `file://` URL.

The Vite base path is `/demo-v2/` for GitHub Pages. For a different hosting path, set `base` in `vite.config.js` accordingly.

## Validate

With the production preview running:

```sh
npm test
```

Browser checks use Playwright and local Google Chrome. Set `CHROME_PATH` to use a different Chromium executable. Set `SITE_URL` to test a different demo URL without a trailing slash. Screenshots and results are written to the ignored `artifacts` directory.

## Publish

GitHub Pages uses the GitHub Actions workflow in `.github/workflows/pages.yml`. Pull requests targeting `development` verify the production build. Merging into `development` builds and publishes the website automatically.

## Sources

Project reference images retain their original attribution and rights. See [sources and modeling notes](public/SOURCES.md). The neighborhood data is © OpenStreetMap contributors and distributed under ODbL. Font and Three.js license notices are retained in `public/licenses/` and `src/fonts/`.
