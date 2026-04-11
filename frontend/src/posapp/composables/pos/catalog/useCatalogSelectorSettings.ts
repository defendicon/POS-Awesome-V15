import { normalizeBackgroundSyncInterval } from "../../../utils/backgroundSync.js";
import {
	loadItemSelectorSettings,
	saveItemSelectorSettings,
} from "../../../utils/itemSelectorSettings.js";

declare const frappe: any;
declare const __: (_text: string) => string;

type SelectorSettingsDeps = {
	getVM?: () => any;
	itemSync?: any;
};

export const useItemsSelectorSettings = ({
	getVM,
	itemSync,
}: SelectorSettingsDeps) => {
	const getVm = (): any => (typeof getVM === "function" ? getVM() : null);

	const toggleItemSettings = () => {
		const vm = getVm();
		if (!vm) return;
		vm.temp_new_line = vm.new_line;
		vm.temp_hide_qty_decimals = vm.hide_qty_decimals;
		vm.temp_hide_zero_rate_items = vm.hide_zero_rate_items;
		vm.temp_enable_custom_items_per_page = vm.enable_custom_items_per_page;
		vm.temp_items_per_page = vm.items_per_page;
		vm.temp_force_server_items = !!(
			vm.pos_profile && vm.pos_profile.posa_force_server_items
		);
		vm.temp_show_last_invoice_rate = vm.show_last_invoice_rate;
		vm.temp_enable_background_sync = vm.enable_background_sync;
		vm.temp_background_sync_interval = vm.background_sync_interval;
		vm.show_item_settings = true;
	};

	const cancelItemSettings = () => {
		const vm = getVm();
		if (!vm) return;
		vm.show_item_settings = false;
	};

	const saveItemSettings = () => {
		const vm = getVm();
		if (!vm || !vm.localStorageAvailable) return;
		const settings = {
			new_line: vm.new_line,
			hide_qty_decimals: vm.hide_qty_decimals,
			hide_zero_rate_items: vm.hide_zero_rate_items,
			show_last_invoice_rate: vm.show_last_invoice_rate,
			enable_background_sync: vm.enable_background_sync,
			background_sync_interval: vm.background_sync_interval,
			enable_custom_items_per_page: vm.enable_custom_items_per_page,
			items_per_page: vm.items_per_page,
		};
		saveItemSelectorSettings(settings);
	};

	const savePosProfileSetting = (field: string, value: unknown) => {
		const vm = getVm();
		if (!vm || !vm.pos_profile || !vm.pos_profile.name) {
			return;
		}
		frappe.db
			.set_value("POS Profile", vm.pos_profile.name, field, value ? 1 : 0)
			.catch((e: unknown) => {
				console.error("Failed to save POS Profile setting", e);
			});
	};

	const applyItemSettings = (
		payload: Record<string, unknown> | null | undefined,
	) => {
		const vm = getVm();
		if (!vm) return;
		const resolved = payload && typeof payload === "object" ? payload : {};
		const getValue = (key: string, fallback: any) =>
			Object.prototype.hasOwnProperty.call(resolved, key)
				? resolved[key]
				: fallback;

		vm.new_line = getValue("new_line", vm.temp_new_line);
		vm.hide_qty_decimals = getValue(
			"hide_qty_decimals",
			vm.temp_hide_qty_decimals,
		);
		vm.hide_zero_rate_items = getValue(
			"hide_zero_rate_items",
			vm.temp_hide_zero_rate_items,
		);
		vm.show_last_invoice_rate = getValue(
			"show_last_invoice_rate",
			vm.temp_show_last_invoice_rate,
		);
		vm.enable_background_sync = getValue(
			"enable_background_sync",
			vm.temp_enable_background_sync,
		);
		vm.background_sync_interval = normalizeBackgroundSyncInterval(
			getValue(
				"background_sync_interval",
				vm.temp_background_sync_interval,
			),
		);
		vm.temp_background_sync_interval = vm.background_sync_interval;
		vm.enable_custom_items_per_page = getValue(
			"enable_custom_items_per_page",
			vm.temp_enable_custom_items_per_page,
		);
		const itemsPerPage = getValue("items_per_page", vm.temp_items_per_page);
		if (vm.enable_custom_items_per_page) {
			vm.items_per_page = parseInt(itemsPerPage) || 50;
		} else {
			vm.items_per_page = 50;
		}
		vm.itemsPerPage = vm.items_per_page;
		vm.pos_profile.posa_force_server_items = getValue(
			"force_server_items",
			vm.temp_force_server_items,
		)
			? 1
			: 0;
		savePosProfileSetting(
			"posa_force_server_items",
			vm.pos_profile.posa_force_server_items,
		);
		if (!vm.show_last_invoice_rate) {
			vm.clearLastInvoiceRateCache();
		} else {
			vm.scheduleLastInvoiceRateRefresh();
		}
		saveItemSettings();
		(itemSync || vm.itemSync).startBackgroundSyncScheduler();
		vm.show_item_settings = false;
	};

	const loadItemSettings = () => {
		const vm = getVm();
		if (!vm || !vm.localStorageAvailable) return;
		const opts = loadItemSelectorSettings();
		if (!opts) {
			return;
		}
		if (typeof opts.new_line === "boolean") {
			vm.new_line = opts.new_line;
		}
		if (typeof opts.hide_qty_decimals === "boolean") {
			vm.hide_qty_decimals = opts.hide_qty_decimals;
		}
		if (typeof opts.hide_zero_rate_items === "boolean") {
			vm.hide_zero_rate_items = opts.hide_zero_rate_items;
		}
		if (typeof opts.show_last_invoice_rate === "boolean") {
			vm.show_last_invoice_rate = opts.show_last_invoice_rate;
		}
		if (typeof opts.enable_background_sync === "boolean") {
			vm.enable_background_sync = opts.enable_background_sync;
		}
		if (typeof opts.background_sync_interval === "number") {
			vm.background_sync_interval = normalizeBackgroundSyncInterval(
				opts.background_sync_interval,
			);
		}
		if (typeof opts.enable_custom_items_per_page === "boolean") {
			vm.enable_custom_items_per_page = opts.enable_custom_items_per_page;
		}
		if (typeof opts.items_per_page === "number") {
			vm.items_per_page = opts.items_per_page;
			vm.itemsPerPage = vm.items_per_page;
		}
	};

	const formatBackgroundSyncTime = () => {
		const vm = getVm();
		if (!vm) return __("Never");
		const lastSync = vm.last_background_sync_time;
		if (!lastSync) {
			return __("Never");
		}
		const parsed = new Date(lastSync);
		if (Number.isNaN(parsed.getTime())) {
			return __("Never");
		}
		return parsed.toLocaleTimeString();
	};

	return {
		toggleItemSettings,
		cancelItemSettings,
		applyItemSettings,
		saveItemSettings,
		savePosProfileSetting,
		loadItemSettings,
		formatBackgroundSyncTime,
	};
};
