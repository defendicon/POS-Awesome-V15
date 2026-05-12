import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourcePath = (relativePath: string) =>
	fileURLToPath(new URL(`../src/${relativePath}`, import.meta.url));

describe("large cart performance guards", () => {
	it("does not log from CartItemRow render memoization", () => {
		const source = readFileSync(
			sourcePath("posapp/components/pos/invoice/CartItemRow.vue"),
			"utf8",
		);

		expect(source).not.toMatch(/console\.log\(\`\[CartItemRow\]/);
	});

	it("does not deep-watch every cart item for offer refreshes", () => {
		const source = readFileSync(
			sourcePath("posapp/composables/pos/invoice/useInvoiceOffers.ts"),
			"utf8",
		);

		expect(source).toContain("invoiceStore.metadata.changeVersion");
		expect(source).not.toContain("[items, posOffers, posa_coupons");
	});

	it("keeps Vuetify virtual table spacer available for bottom rows", () => {
		const source = readFileSync(
			sourcePath("posapp/components/pos/invoice/items-table-styles.css"),
			"utf8",
		);

		expect(source).not.toMatch(
			/\.v-data-table-virtual__spacer\s*\{[\s\S]*display:\s*none/i,
		);
		expect(source).not.toMatch(
			/\.v-data-table-virtual__spacer\s*\{[\s\S]*height:\s*0/i,
		);
	});

	it("does not log from the rapid item merge path", () => {
		const additionSource = readFileSync(
			sourcePath("posapp/composables/pos/items/useItemAddition.ts"),
			"utf8",
		);
		const creationSource = readFileSync(
			sourcePath("posapp/composables/pos/items/addition/useItemCreation.ts"),
			"utf8",
		);
		const batchSerialSource = readFileSync(
			sourcePath("posapp/composables/pos/shared/useBatchSerial.ts"),
			"utf8",
		);

		expect(additionSource).not.toContain("[useItemAddition] Merging item qty");
		expect(additionSource).not.toContain(
			"[useItemAddition] Adding new items to store",
		);
		expect(additionSource).not.toContain(
			"[useItemAddition] Adding split batch items",
		);
		expect(creationSource).not.toContain("[useItemAddition]");
		expect(creationSource).not.toContain("[useItemCreation]");
		expect(batchSerialSource).toContain("__POSAWESOME_DEBUG_BATCH_FLOW__");
	});

	it("does not deep-watch the invoice item map on every cart mutation", () => {
		const source = readFileSync(
			sourcePath("posapp/stores/invoiceStore.ts"),
			"utf8",
		);

		expect(source).not.toMatch(/watch\(\s*itemsData[\s\S]*deep:\s*true/i);
		expect(source).toContain("triggerUpdateTotals");
	});

	it("uses the stable invoice store order for cart merge caching", () => {
		const source = readFileSync(
			sourcePath("posapp/composables/pos/items/addition/useItemMerging.ts"),
			"utf8",
		);

		expect(source).toContain("getStoreOrder");
		expect(source).toContain("context?.invoiceStore?.itemOrder");
		expect(source).toContain("cache.lastOrder");
	});
});
