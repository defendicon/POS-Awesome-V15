import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(testsDir, "..");
const source = (...segments: string[]) =>
	readFileSync(path.join(frontendDir, "src", "posapp", ...segments), "utf8");

describe("Cart and payment visual hierarchy", () => {
	it("keeps classic cart polish separate from the rugged Counter Grid skin", () => {
		const cartStyles = source(
			"components",
			"pos",
			"invoice",
			"items-table-styles.css",
		);

		expect(cartStyles).toContain(
			".posa-cart-table:not(.posa-cart-table--counter-grid) tbody tr:hover > td:first-child",
		);
		expect(cartStyles).toContain(
			"box-shadow: inset 3px 0 0 var(--pos-primary)",
		);
		expect(cartStyles).toContain("background: var(--pos-input-bg)");
		expect(cartStyles).toContain(".posa-cart-table--counter-grid");
	});

	it("marks active tenders and uses shared semantic action colors", () => {
		const methods = source(
			"components",
			"pos",
			"payments",
			"PaymentMethods.vue",
		);
		const actions = source(
			"components",
			"pos",
			"payments",
			"PaymentActionButtons.vue",
		);

		expect(methods).toContain("payment-method-card--active");
		expect(methods).toContain(
			"background-color: var(--pos-action-primary) !important",
		);
		expect(actions).toContain(
			"background-color: var(--pos-action-pay) !important",
		);
		expect(actions).toContain(
			"background-color: var(--pos-error-container) !important",
		);
		expect(actions).not.toContain("min-height: 34px !important");
	});

	it("adds scannable payment sections and settlement states", () => {
		const payment = source("components", "pos", "Payments.vue");
		const summary = source(
			"components",
			"pos",
			"payments",
			"PaymentSummary.vue",
		);

		expect(payment).toContain("payment-section__icon");
		expect(payment).toContain(
			"border-inline-start: 5px solid var(--pos-primary)",
		);
		expect(summary).toContain('data-state="settlementState"');
		expect(summary).toContain('data-state="remaining"');
		expect(summary).toContain('data-state="balanced"');
	});
});
