import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { verifyBuildArtifacts } from "./verify_build_artifacts.mjs";

async function withFixture(files, callback) {
	const root = await mkdtemp(path.join(os.tmpdir(), "posa-build-verify-"));
	try {
		for (const [relativePath, content] of Object.entries(files)) {
			const filePath = path.join(root, relativePath);
			await mkdir(path.dirname(filePath), { recursive: true });
			await writeFile(filePath, content, "utf8");
		}
		return await callback(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

const completeBuildFiles = {
	"posawesome/public/dist/js/version.json": JSON.stringify({
		version: "test-build",
		assets: {
			loader: "/assets/posawesome/dist/js/loader.js",
			posawesome: "/assets/posawesome/dist/js/posawesome.js",
			css: "/assets/posawesome/dist/js/posawesome.css",
			offlineIndex: "/assets/posawesome/dist/js/offline/index-AbCd1234.js",
			fonts: [
				"/assets/posawesome/dist/js/materialdesignicons-webfont-ICONS.woff2",
			],
		},
	}),
	"posawesome/public/dist/js/loader.js": "console.log('loader');",
	"posawesome/public/dist/js/posawesome.js": "console.log('app');",
	"posawesome/public/dist/js/posawesome.css": "body{}",
	"posawesome/public/dist/js/offline/index-AbCd1234.js": "console.log('offline');",
	"posawesome/public/dist/js/materialdesignicons-webfont-ICONS.woff2": "font",
	"posawesome/public/dist/js/posapp/workers/itemWorker.js": "self.onmessage = () => {};",
	"posawesome/public/dist/js/libs/dexie.min.js": "window.Dexie = {};",
	"posawesome/public/dist/js/libs/JsBarcode.all.min.js": "window.JsBarcode = {};",
	"posawesome/public/dist/js/libs/html2pdf.bundle.min.js": "window.html2pdf = {};",
};

test("fails when version.json is missing", async () => {
	await withFixture(
		{
			"posawesome/public/dist/js/loader.js": "console.log('loader');",
		},
		async (root) => {
			await assert.rejects(
				() => verifyBuildArtifacts({ rootDir: root }),
				/version\.json/,
			);
		},
	);
});

test("verifies POS loader assets and writes sha256 checksums", async () => {
	await withFixture(completeBuildFiles, async (root) => {
		const result = await verifyBuildArtifacts({ rootDir: root });
		const checksumPath = path.join(
			root,
			"posawesome/public/dist/js/checksums.sha256",
		);
		const checksums = await readFile(checksumPath, "utf8");

		assert.equal(result.checkedFiles.length, 9);
		assert.match(checksums, /  version\.json$/m);
		assert.match(checksums, /  loader\.js$/m);
		assert.match(checksums, /  materialdesignicons-webfont-ICONS\.woff2$/m);
		assert.match(checksums, /  offline\/index-AbCd1234\.js$/m);
	});
});
