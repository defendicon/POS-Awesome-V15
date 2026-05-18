const DIST_BASE_URL = "/assets/posawesome/dist/js/";

// Every emitted entry is now content-hashed. The Page controller
// (posapp.js) and the Service Worker (sw.js) read the actual hashed
// filenames from version.json's `assets` map at runtime, so the
// browser cannot pin a stale cached `posawesome.js` across deploys.
export function getEntryFileName() {
	return "[name]-[hash].js";
}

function toPublicAssetUrl(fileName) {
	return `${DIST_BASE_URL}${String(fileName || "").replace(/^\/+/, "")}`;
}

function toVersionedPublicAssetUrl(fileName, version) {
	const url = toPublicAssetUrl(fileName);
	return version ? `${url}?v=${encodeURIComponent(version)}` : url;
}

function getChunkFileName(bundle, chunkName) {
	const match = Object.values(bundle || {}).find(
		(entry) => entry?.type === "chunk" && entry?.name === chunkName,
	);
	return match?.fileName || null;
}

function getCssAssetFileName(bundle) {
	// `cssCodeSplit: false` emits a single combined stylesheet (Vite
	// names it `style-<hash>.css` by default). Pick the largest CSS
	// asset to be robust to either naming scheme.
	const cssAssets = Object.values(bundle || {}).filter(
		(entry) =>
			entry?.type === "asset" &&
			typeof entry?.fileName === "string" &&
			entry.fileName.endsWith(".css"),
	);
	if (!cssAssets.length) return null;
	cssAssets.sort((a, b) => (b.source?.length || 0) - (a.source?.length || 0));
	return cssAssets[0].fileName;
}

export function buildVersionPayload(version, bundle = {}) {
	const loaderFile = getChunkFileName(bundle, "loader");
	const posawesomeFile = getChunkFileName(bundle, "posawesome");
	const offlineIndexFile = getChunkFileName(bundle, "offline/index");
	const cssFile = getCssAssetFileName(bundle);

	return {
		version,
		assets: {
			loader: loaderFile
				? toVersionedPublicAssetUrl(loaderFile, version)
				: toVersionedPublicAssetUrl("loader.js", version),
			posawesome: posawesomeFile
				? toVersionedPublicAssetUrl(posawesomeFile, version)
				: toVersionedPublicAssetUrl("posawesome.js", version),
			css: cssFile
				? toVersionedPublicAssetUrl(cssFile, version)
				: toVersionedPublicAssetUrl("posawesome.css", version),
			offlineIndex: offlineIndexFile
				? toPublicAssetUrl(offlineIndexFile)
				: toPublicAssetUrl("offline/index.js"),
		},
	};
}
