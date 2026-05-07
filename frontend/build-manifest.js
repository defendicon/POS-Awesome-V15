const DIST_BASE_URL = "/assets/posawesome/dist/js/";
const STATIC_ENTRY_NAMES = new Set(["posawesome", "loader"]);

export function getEntryFileName(chunkInfo) {
	return STATIC_ENTRY_NAMES.has(chunkInfo?.name) ? "[name].js" : "[name]-[hash].js";
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

export function buildVersionPayload(version, bundle = {}) {
	const offlineIndexFile = getChunkFileName(bundle, "offline/index");

	return {
		version,
		assets: {
			loader: toVersionedPublicAssetUrl("loader.js", version),
			posawesome: toVersionedPublicAssetUrl("posawesome.js", version),
			css: toVersionedPublicAssetUrl("posawesome.css", version),
			offlineIndex: offlineIndexFile
				? toPublicAssetUrl(offlineIndexFile)
				: toPublicAssetUrl("offline/index.js"),
		},
	};
}
