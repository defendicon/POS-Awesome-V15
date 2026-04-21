import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";

import { useUIStore } from "../src/posapp/stores/uiStore";

describe("uiStore parked orders", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it("keeps parked orders cached when drafts are opened", () => {
		const store = useUIStore();
		const drafts = [
			{ name: "ACC-SINV-0001", customer_name: "Walk-in Customer" },
			{ name: "ACC-SINV-0002", customer_name: "Acme Store" },
		];

		store.openDrafts(drafts);

		expect(store.draftsDialog).toBe(true);
		expect(store.draftsData).toEqual(drafts);
		expect(store.parkedOrders).toEqual(drafts);
		expect(store.parkedOrdersCount).toBe(2);
		expect(store.hasParkedOrders).toBe(true);
	});

	it("can update parked orders without forcing the drafts dialog open", () => {
		const store = useUIStore();
		const drafts = [{ name: "ACC-SINV-0003" }];

		store.setParkedOrders(drafts);

		expect(store.draftsDialog).toBe(false);
		expect(store.parkedOrders).toEqual(drafts);
		expect(store.parkedOrdersCount).toBe(1);
	});

	it("can cache drafts data without opening the legacy drafts dialog", () => {
		const store = useUIStore();
		const drafts = [{ name: "ACC-SINV-0004" }];

		store.setDraftsData(drafts);

		expect(store.draftsDialog).toBe(false);
		expect(store.draftsData).toEqual(drafts);
		expect(store.parkedOrders).toEqual([]);
	});

	it("can open invoice management directly on the drafts tab", () => {
		const store = useUIStore();

		store.openInvoiceManagement("drafts");

		expect(store.invoiceManagementDialog).toBe(true);
		expect(store.invoiceManagementTargetTab).toBe("drafts");
	});

	it("can preserve the selected drafts source when invoice management opens", () => {
		const store = useUIStore();

		store.openInvoiceManagement("drafts", "quote");

		expect(store.invoiceManagementDialog).toBe(true);
		expect(store.invoiceManagementTargetTab).toBe("drafts");
		expect(store.invoiceManagementDraftSource).toBe("quote");
	});
});
