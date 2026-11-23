import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
	POS_APP_ID,
	POS_BRAND_NAME,
	POS_BRAND_SHORT_NAME,
	getPosAppDisplayName,
	resolvePosBranding,
} from "../src/posapp/config/branding";

const readRepoFile = (path: string) =>
	readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const canonicalBrandingFiles = [
	"electron/main.js",
	"electron/renderer/offline.html",
	"electron/renderer/setup.html",
	"frontend/src/posapp/components/navbar/NavbarAppBar.vue",
	"frontend/src/posapp/components/reports/components/DashboardHeader.vue",
	"frontend/src/posapp/config/branding.ts",
	"posawesome/config/desktop.py",
	"posawesome/config/docs.py",
	"posawesome/config/pos_awesome.py",
	"posawesome/fixtures/custom_field.json",
	"posawesome/hooks.py",
	"posawesome/posawesome/page/pos/pos.js",
	"posawesome/posawesome/page/posapp/posapp.js",
	"posawesome/posawesome/workspace/pos_awesome/pos_awesome.json",
	"posawesome/www/manifest.json",
	"posawesome/www/offline.html",
];

describe("POS Awesome branding", () => {
	it("keeps the stable app identifier separate from the display brand", () => {
		expect(POS_APP_ID).toBe("posawesome");
		expect(POS_BRAND_NAME).toBe("Nornux POS");
		expect(POS_BRAND_SHORT_NAME).toBe("Nornux");
	});

	it("uses the canonical name in installed-app displays", () => {
		expect(getPosAppDisplayName("posawesome")).toBe("Nornux POS");
		expect(getPosAppDisplayName("erpnext")).toBe("erpnext");
	});

	it("allows explicitly enabled POS Profile branding without changing source constants", () => {
		expect(
			resolvePosBranding({
				posa_enable_custom_branding: 1,
				posa_brand_name: "My Store POS",
				posa_brand_short_name: "MSP",
				posa_brand_logo: "/files/my-store-logo.png",
			}),
		).toEqual({
			name: "My Store POS",
			shortName: "MSP",
			logo: "/files/my-store-logo.png",
		});
	});

	it("ignores custom values until custom branding is enabled", () => {
		expect(resolvePosBranding({ posa_brand_name: "Unapproved Brand" })).toEqual({
			name: "Nornux POS",
			shortName: "Nornux",
			logo: "",
		});
	});

	it("keeps canonical branding files free from the removed private brand", () => {
		for (const path of canonicalBrandingFiles) {
			expect(readRepoFile(path), path).not.toMatch(/RetailMind-POS|RetailMind Dashboard/);
		}
	});

	it("locks desktop, PWA, and Frappe identities to POS Awesome", () => {
		const packageConfig = JSON.parse(readRepoFile("package.json"));
		const manifest = JSON.parse(readRepoFile("posawesome/www/manifest.json"));
		const hooks = readRepoFile("posawesome/hooks.py");
		const dashboardHeader = readRepoFile(
			"frontend/src/posapp/components/reports/components/DashboardHeader.vue",
		);
		const fixtures = readRepoFile("posawesome/fixtures/custom_field.json");
		const workspace = JSON.parse(
			readRepoFile(
				"posawesome/posawesome/workspace/pos_awesome/pos_awesome.json",
			),
		);

		expect(packageConfig.build.productName).toBe("POS Awesome Desktop");
		expect(packageConfig.build.win.artifactName).toBe(
			"POSAwesome-Setup-${version}.${ext}",
		);
		expect(manifest.name).toBe("Nornux POS");
		expect(hooks).toContain('app_title = "POS Awesome"');
		expect(dashboardHeader).toContain('__("Awesome Dashboard")');
		expect(fixtures).toContain('"label": "POS Awesome Settings"');
		expect(fixtures).not.toContain("RetailMind-POS");
		expect(workspace.label).toBe("POS Awesome");
		expect(workspace.title).toBe("POS Awesome");
	});
});
