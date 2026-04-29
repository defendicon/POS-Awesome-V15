import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(__dirname, "..");

const readFrontendFile = (path: string) =>
	readFileSync(resolve(repoRoot, path), "utf8");

describe("cart performance guards", () => {
	it("keeps Vuetify virtual-scroll spacer elements available for positioning", () => {
		const css = readFrontendFile(
			"src/posapp/components/pos/invoice/items-table-styles.css",
		);

		expect(css).not.toMatch(
			/\.posa-cart-table\s+\.v-data-table-virtual__spacer\s*\{[^}]*display\s*:\s*none/is,
		);
		expect(css).not.toMatch(
			/\.posa-cart-table\s+\.v-virtual-scroll__spacer[^{]*\{[^}]*display\s*:\s*none/is,
		);
	});

	it("does not log from rapid cart scan/add render hot paths", () => {
		const hotPathFiles = [
			"src/posapp/components/pos/invoice/CartItemRow.vue",
			"src/posapp/composables/pos/items/addition/useItemCreation.ts",
			"src/posapp/composables/pos/items/useItemAddition.ts",
			"src/posapp/composables/pos/items/useScannerInput.ts",
			"src/posapp/composables/pos/items/useScanProcessor.ts",
			"src/posapp/composables/pos/shared/useBatchSerial.ts",
		];

		for (const file of hotPathFiles) {
			expect(readFrontendFile(file), file).not.toMatch(
				/console\.(log|debug)\s*\(/,
			);
		}
	});
});
