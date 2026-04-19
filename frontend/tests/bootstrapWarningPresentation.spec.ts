import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("DefaultLayout bootstrap warning presentation", () => {
	it("routes bootstrap warnings through the navbar status indicator and a top-center snackbar", () => {
		const source = readFileSync(
			resolve(process.cwd(), "src/posapp/layouts/DefaultLayout.vue"),
			"utf8",
		);

		expect(source).toContain(':bootstrap-warning-active="visibleBootstrapWarningActive"');
		expect(source).toContain(':bootstrap-warning-tooltip="visibleBootstrapWarningTooltip"');
		expect(source).toContain(':bootstrap-capabilities="visibleBootstrapCapabilitySummaries"');
		expect(source).toContain("shouldLiftBootstrapWarningStartupGate");
		expect(source).toContain("initialBootstrapSyncSettled");
		expect(source).toContain("<v-snackbar");
		expect(source).toContain('v-model="bootstrapSnackbarVisible"');
		expect(source).toContain('location="top center"');
		expect(source).toContain("Status > Clear Cache");
		expect(source).not.toContain("<v-alert");
	});
});
