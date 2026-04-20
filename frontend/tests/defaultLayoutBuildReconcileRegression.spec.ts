import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoFile = (...segments: string[]) =>
	readFileSync(path.resolve(process.cwd(), ...segments), "utf8");

describe("build reconciliation placement", () => {
	it("keeps build reconciliation out of the lazy-loaded DefaultLayout chunk", () => {
		const source = repoFile("src", "posapp", "layouts", "DefaultLayout.vue");

		expect(source).not.toContain("reconcileBuildChangeOnStartup");
		expect(source).not.toContain("reconcileWhenBackOnline");
	});

	it("keeps startup reconciliation in posapp pre-mount flow", () => {
		const source = repoFile("src", "posapp", "posapp.ts");

		expect(source).toContain("reconcileBuildChangeOnStartup");
		expect(source).toContain("await reconcileBuildChangeOnStartup");
	});
});
