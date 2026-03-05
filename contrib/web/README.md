# Neovim Web (WASM) MVP

This directory contains the browser demo frontend for the `ENABLE_WEB` build.

## What this includes

- A web build target: `nvim_web_bundle`
- A browser worker runtime (`nvim.worker.js`) that starts Neovim in `--embed --headless`
- A simple canvas linegrid UI (`index.html` + `app.js`)
- Virtual filesystem support with persistence through `IDBFS`

## Build

From the repository root:

```bash
make web
```

The bundle is emitted to:

```text
build-web/web/dist/
```

## Run locally

```bash
cd build-web/web/dist
python3 -m http.server 8080
```

Then open:

```text
http://127.0.0.1:8080
```

## Notes and limitations

- This is an MVP browser target focused on core editing and UI attach.
- External process and PTY behavior are not supported in web builds.
- The UI is intentionally minimal and only handles core linegrid events.
- Runtime assets are copied from `runtime/`; persistence is scoped to `/home/web_user`.
