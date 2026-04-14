// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h, ref } from "vue";
import { mount } from "@vue/test-utils";

import OfflineStatusPanel from "../src/posapp/components/navbar/OfflineStatusPanel.vue";
import { useOfflineSyncStore } from "../src/posapp/stores/offlineSyncStore";

const VMenuStub = defineComponent({
	props: {
		modelValue: {
			type: Boolean,
			default: false,
		},
	},
	emits: ["update:modelValue"],
	setup(props, { slots }) {
		return () =>
			h("div", { class: "v-menu-stub" }, [
				slots.activator?.({
					props: {},
				}),
				props.modelValue
					? h("div", { class: "v-menu-stub__content" }, slots.default?.())
					: null,
			]);
	},
});

const VBtnStub = defineComponent({
	emits: ["click"],
	setup(_, { attrs, slots, emit }) {
		return () =>
			h(
				"button",
				{
					...attrs,
					onClick: () => {
						(attrs.onClick as (() => void) | undefined)?.();
						emit("click");
					},
				},
				slots.default?.(),
			);
	},
});

const SimpleStub = defineComponent({
	setup(_, { slots }) {
		return () => h("div", {}, slots.default?.());
	},
});

describe("OfflineStatusPanel", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		vi.stubGlobal("__", (value: string) => value);
	});

	it("shows warning summary, attention resources, and repair actions", () => {
		const store = useOfflineSyncStore();
		store.setSummary({
			networkOnline: true,
			serverOnline: true,
			serverConnecting: false,
			manualOffline: false,
			pendingInvoices: 2,
			cacheUsage: 46,
			cacheUsageDetails: { total: 4096, indexedDB: 3072, localStorage: 1024 },
		});
		store.setBootstrapWarning({
			active: true,
			title: "POS is running with limited offline prerequisites.",
			messages: ["Cached offline data belongs to a different app build."],
		});
		store.setResourceStates([
			{
				resourceId: "bootstrap_config",
				status: "limited",
				lastSyncedAt: "2026-04-09T12:00:00.000Z",
				watermark: null,
				lastSuccessHash: null,
				lastError: null,
				consecutiveFailures: 0,
				scopeSignature: "profile:Main POS",
				schemaVersion: null,
			},
			{
				resourceId: "currency_matrix",
				status: "error",
				lastSyncedAt: null,
				watermark: null,
				lastSuccessHash: null,
				lastError: "Timed out while refreshing exchange rates.",
				consecutiveFailures: 2,
				scopeSignature: "company:Test Co",
				schemaVersion: null,
			},
		]);

		const wrapper = mount(OfflineStatusPanel, {
			props: {
				modelValue: true,
				bootstrapRepairActive: true,
				bootstrapRepairLabel: "Repairing offline prerequisites: offers, coupons",
			},
			slots: {
				activator: "<button data-test='activator'>status</button>",
			},
			global: {
				components: {
					VMenu: VMenuStub,
					VBtn: VBtnStub,
					VCard: SimpleStub,
					VCardTitle: SimpleStub,
					VCardText: SimpleStub,
					VCardActions: SimpleStub,
					VChip: SimpleStub,
					VDivider: SimpleStub,
					VIcon: SimpleStub,
				},
			},
		});

		expect(wrapper.get('[data-test="offline-status-panel"]').text()).toContain(
			"POS is running with limited offline prerequisites.",
		);
		expect(wrapper.text()).toContain(
			"Cached offline data belongs to a different app build.",
		);
		expect(wrapper.get('[data-test="offline-status-repairing"]').text()).toContain(
			"Repairing offline prerequisites: offers, coupons",
		);
		expect(wrapper.text()).toContain("bootstrap_config");
		expect(wrapper.text()).toContain("currency_matrix");
		expect(wrapper.text()).toContain(
			"Timed out while refreshing exchange rates.",
		);
		expect(wrapper.get('[data-test="offline-status-action-refresh"]').text()).toContain(
			"Refresh Offline Data",
		);
		expect(wrapper.get('[data-test="offline-status-action-rebuild"]').text()).toContain(
			"Rebuild Offline Data",
		);
		expect(wrapper.get('[data-test="offline-status-action-clear-cache"]').text()).toContain(
			"Clear Cache",
		);
		expect(wrapper.get('[data-test="offline-status-action-diagnostics"]').text()).toContain(
			"View Data Diagnostics",
		);
	});

	it("emits repair actions from the panel surface", async () => {
		const store = useOfflineSyncStore();
		store.setSummary({
			networkOnline: false,
			serverOnline: false,
			serverConnecting: false,
			manualOffline: true,
			pendingInvoices: 0,
			cacheUsage: 12,
			cacheUsageDetails: { total: 1024, indexedDB: 768, localStorage: 256 },
		});

		const Parent = defineComponent({
			components: { OfflineStatusPanel },
			setup() {
				return {
					toggleCount: ref(0),
					refreshCount: ref(0),
					rebuildCount: ref(0),
					clearCacheCount: ref(0),
					diagnosticCount: ref(0),
				};
			},
			template: `
				<OfflineStatusPanel
					:model-value="true"
					@toggle-offline="toggleCount += 1"
					@refresh-offline-data="refreshCount += 1"
					@rebuild-offline-data="rebuildCount += 1"
					@clear-cache="clearCacheCount += 1"
					@open-diagnostics="diagnosticCount += 1"
				/>
			`,
		});

		const wrapper = mount(Parent, {
			global: {
				components: {
					VMenu: VMenuStub,
					VBtn: VBtnStub,
					VCard: SimpleStub,
					VCardTitle: SimpleStub,
					VCardText: SimpleStub,
					VCardActions: SimpleStub,
					VChip: SimpleStub,
					VDivider: SimpleStub,
					VIcon: SimpleStub,
				},
			},
		});

		await wrapper.get('[data-test="offline-status-action-connectivity"]').trigger("click");
		await wrapper.get('[data-test="offline-status-action-refresh"]').trigger("click");
		await wrapper.get('[data-test="offline-status-action-rebuild"]').trigger("click");
		await wrapper.get('[data-test="offline-status-action-clear-cache"]').trigger("click");
		await wrapper.get('[data-test="offline-status-action-diagnostics"]').trigger("click");

		expect((wrapper.vm as any).toggleCount).toBe(1);
		expect((wrapper.vm as any).refreshCount).toBe(1);
		expect((wrapper.vm as any).rebuildCount).toBe(1);
		expect((wrapper.vm as any).clearCacheCount).toBe(1);
		expect((wrapper.vm as any).diagnosticCount).toBe(1);
	});
});
