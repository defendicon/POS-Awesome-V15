# Electron Packaging Audit

## Scope

This audit covers the root `package.json` Electron Builder configuration for the desktop shell. It does not change packaging behavior.

Current build entry points:

- Main process: `electron/main.js`
- Preload: `electron/preload.js`
- Local renderer fallbacks: `electron/renderer/setup.html`, `electron/renderer/offline.html`
- Build scripts: `yarn electron:build`, `yarn electron:build:win`, `yarn electron:smoke`

## Current Build Configuration

The root `package.json` uses Electron Builder with:

```json
"build": {
  "appId": "com.posawesome.desktop",
  "productName": "POS Awesome Desktop",
  "asar": true,
  "directories": {
    "output": "dist-electron"
  },
  "files": [
    "electron/**/*",
    "package.json",
    "yarn.lock",
    "node_modules/**/*"
  ]
}
```

The risky entry is `node_modules/**/*`.

## Runtime Files Required

The desktop shell currently loads the POS web app from a configured ERPNext / POS Awesome server URL. It does not package the frontend Vite application as the primary runtime UI.

Required runtime files are:

- `package.json`, for the Electron main entry and app metadata.
- `electron/main.js`, for app lifecycle, server URL normalization, menu setup, connectivity probing, and window loading.
- `electron/preload.js`, for the safe `contextBridge` API exposed to local fallback pages.
- `electron/renderer/setup.html`, shown when no server URL is configured.
- `electron/renderer/offline.html`, shown when the configured server cannot be reached.
- `electron-store` and its production transitive dependencies, because `electron/main.js` dynamically imports it to persist the configured server URL.
- Electron Builder generated metadata and Electron runtime files.

The desktop shell does not appear to require the root frontend dependency tree at runtime:

- Vue, Vuetify, Pinia, Dexie, Vite, and related frontend packages are used to build and run the web POS application, not by the Electron main/preload shell.
- Electron Builder itself, Electron CLI, ESLint, TypeScript, semantic-release, and test/build tooling are build-time dependencies and should not be shipped inside the app archive.

## Risks Of Bundling Full node_modules

Including `node_modules/**/*` can:

- Increase installer and unpacked app size substantially.
- Ship dev-only tools, test fixtures, source maps, CLIs, and package scripts that are not needed at runtime.
- Expand the attack surface if an unexpected runtime path can reach bundled tooling or package files.
- Increase vulnerability scanner noise by including packages that cannot execute in production.
- Slow Windows packaging, signing, upload, installation, and antivirus scanning.
- Make artifact contents harder to review because unrelated frontend and build packages are mixed with the Electron runtime shell.

## Safer Include Strategy

Recommended direction: build a staged Electron package directory and run Electron Builder from that directory.

The staged directory should contain only:

- `package.json` with:
  - `main: "electron/main.js"`
  - production dependency on `electron-store`
  - app metadata needed by Electron Builder
- `electron/**/*`
- a production-only `node_modules` installed for that staged manifest
- generated Electron Builder metadata

This avoids maintaining a fragile manual allowlist for `electron-store` transitive dependencies such as `conf`, `ajv`, `atomically`, `dot-prop`, `env-paths`, `semver`, and their nested packages.

An implementation PR can use one of these patterns:

1. Add a packaging script that creates `dist-electron-app/`, copies `electron/**/*`, writes a minimal package manifest, installs production dependencies there, and runs Electron Builder against that staged app.
2. Add an `electron/package.json` or equivalent app-dir manifest with only Electron runtime dependencies, then configure the build command to package that app directory.

In either approach, remove the broad `node_modules/**/*` include from the final Electron Builder `files` list after the staged runtime dependency install is proven.

Suggested final `files` shape for the app payload:

```json
"files": [
  "electron/**/*",
  "package.json"
]
```

The production dependency tree should come from the staged package manifest instead of from a broad root-level include.

## Follow-Up Implementation PR

Recommended next PR: create a dedicated Electron packaging stage.

Proposed changes:

- Add a script such as `scripts/prepare_electron_package.mjs`.
- Create or refresh a ignored staging directory, for example `dist-electron-app/`.
- Copy `electron/**/*` into the staging directory.
- Write a minimal staging `package.json` that includes only Electron runtime metadata and `electron-store`.
- Install production dependencies in the staging directory.
- Run `electron-builder --projectDir dist-electron-app --win`.
- Update root `package.json` scripts so `electron:build:win` uses the staging flow.
- Keep the existing artifact name, app ID, protocol registration, and NSIS target unchanged.

This is safer than directly editing `build.files` in place because it proves the runtime dependency set before removing the broad include.

## Windows Build Test Plan

Run on Windows:

```powershell
yarn build
yarn verify:build
yarn electron:smoke
yarn electron:build:win
yarn electron:smoke --require-artifact
```

Manual verification:

- Install the generated `POSAwesome-Setup-${version}.exe`.
- Launch the app with no saved server URL and confirm `setup.html` opens.
- Enter a valid ERPNext / POS Awesome server URL and confirm it normalizes to `/app/posapp`.
- Relaunch and confirm the saved server URL is remembered.
- Disconnect or use an unreachable server and confirm `offline.html` opens.
- Use `Change server`, `Retry connection`, and `Clear saved URL`.
- Confirm the `posawesome://` protocol registration still exists after install.
- Confirm the installed app archive does not contain full root `node_modules`, frontend dev tooling, test fixtures, or Electron Builder packages.

Artifact inspection:

- Compare installer size before and after.
- Inspect `resources/app.asar` or the unpacked app payload.
- Confirm only Electron shell files and production runtime dependencies are present.
- Confirm `electron-store` can read and write the saved server URL after installation.
