import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIST_RELATIVE_DIR = path.join("posawesome", "public", "dist", "js");
const PUBLIC_DIST_PREFIX = "/assets/posawesome/dist/js/";

const REQUIRED_MANIFEST_ASSETS = ["loader", "posawesome", "css", "offlineIndex"];
const REQUIRED_STATIC_ASSETS = [
	"posapp/workers/itemWorker.js",
	"libs/dexie.min.js",
	"libs/JsBarcode.all.min.js",
	"libs/html2pdf.bundle.min.js",
];

function toDistRelativePath(assetUrl) {
	if (typeof assetUrl !== "string" || !assetUrl.startsWith(PUBLIC_DIST_PREFIX)) {
		throw new Error(`Unexpected POS asset URL in version.json: ${assetUrl}`);
	}
	const withoutPrefix = assetUrl.slice(PUBLIC_DIST_PREFIX.length).split("?")[0];
	const normalized = path.posix.normalize(withoutPrefix);
	if (normalized.startsWith("../") || path.posix.isAbsolute(normalized)) {
		throw new Error(`Unsafe POS asset URL in version.json: ${assetUrl}`);
	}
	return normalized;
}

async function requireFile(filePath, label) {
	let fileStat;
	try {
		fileStat = await stat(filePath);
	} catch (error) {
		throw new Error(`Missing ${label}: ${filePath}`, { cause: error });
	}
	if (!fileStat.isFile() || fileStat.size === 0) {
		throw new Error(`Invalid ${label}: ${filePath}`);
	}
}

async function sha256File(filePath) {
	const content = await readFile(filePath);
	return createHash("sha256").update(content).digest("hex");
}

export async function verifyBuildArtifacts({ rootDir = process.cwd() } = {}) {
	const distDir = path.resolve(rootDir, DIST_RELATIVE_DIR);
	const versionPath = path.join(distDir, "version.json");

	await requireFile(versionPath, "version.json");

	let versionPayload;
	try {
		versionPayload = JSON.parse(await readFile(versionPath, "utf8"));
	} catch (error) {
		throw new Error(`Unable to parse version.json: ${versionPath}`, { cause: error });
	}

	const version = versionPayload.version || versionPayload.buildVersion;
	if (typeof version !== "string" || !version.trim()) {
		throw new Error("version.json must contain a non-empty version string");
	}

	const assets = versionPayload.assets || {};
	const manifestRelativePaths = REQUIRED_MANIFEST_ASSETS.map((key) => {
		if (!assets[key]) {
			throw new Error(`version.json is missing assets.${key}`);
		}
		return toDistRelativePath(assets[key]);
	});
	const fontRelativePaths = Array.isArray(assets.fonts)
		? assets.fonts.map((assetUrl) => toDistRelativePath(assetUrl))
		: [];

	const checkedFiles = [
		...new Set([
			...manifestRelativePaths,
			...fontRelativePaths,
			...REQUIRED_STATIC_ASSETS,
		]),
	];
	for (const relativePath of checkedFiles) {
		await requireFile(path.join(distDir, relativePath), relativePath);
	}

	const checksumFiles = ["version.json", ...checkedFiles].sort();
	const checksumLines = [];
	for (const relativePath of checksumFiles) {
		const hash = await sha256File(path.join(distDir, relativePath));
		checksumLines.push(`${hash}  ${relativePath.replaceAll(path.sep, "/")}`);
	}

	const checksumPath = path.join(distDir, "checksums.sha256");
	await writeFile(checksumPath, `${checksumLines.join("\n")}\n`, "utf8");

	return {
		distDir,
		version,
		checkedFiles,
		checksumPath,
	};
}

async function main() {
	const result = await verifyBuildArtifacts();
	console.log(`Verified ${result.checkedFiles.length} POS build assets for ${result.version}`);
	console.log(`Wrote ${path.relative(process.cwd(), result.checksumPath)}`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
	main().catch((error) => {
		console.error(error.message);
		process.exitCode = 1;
	});
}
