import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("InvoiceManagement dark mode summary cards", () => {
	it("defines dedicated dark-mode text styling for summary card labels and meta copy", () => {
		const filePath = resolve(
			process.cwd(),
		"src/posapp/components/pos/flows/invoice-management/invoice-management.css",
		);
		const source = readFileSync(filePath, "utf8");

		expect(source).toContain(".invoice-management-card--dark .summary-tile__label");
		expect(source).toContain(".invoice-management-card--dark .summary-tile__value");
		expect(source).toContain(".invoice-management-card--dark .summary-tile__meta");
		expect(source).toContain(".invoice-detail-card--dark .summary-tile");
		expect(source).toContain(".invoice-detail-card--dark .summary-tile__label");
		expect(source).toContain(".invoice-detail-card--dark .summary-tile__value");
	});
});
