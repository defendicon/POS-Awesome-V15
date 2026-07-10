import {
	computed,
	onBeforeUnmount,
	onMounted,
	watch,
	type Ref,
} from "vue";
import { useInvoiceStore } from "../../../stores/invoiceStore";
import { useCustomersStore } from "../../../stores/customersStore";
import {
	buildCustomerDisplayUrl,
	createCustomerDisplayTransport,
	getAutoOpenMarkerKey,
	getOrCreateCustomerDisplayChannelId,
	isCustomerDisplayEnabled,
	shouldAutoOpenCustomerDisplay,
	type CustomerDisplayLineItem,
	type CustomerDisplaySnapshot,
	type CustomerDisplayTotalsSummary,
} from "../../../utils/customerDisplay";

declare const frappe: any;
declare const __: (_text: string, _args?: any[]) => string;

interface UseCustomerDisplayPublisherOptions {
	posProfile: Ref<any>;
	eventBus?: any;
}

const CUSTOMER_DISPLAY_WINDOW_NAME = "POSA_CUSTOMER_DISPLAY_WINDOW";
const CUSTOMER_DISPLAY_WINDOW_FEATURES =
	"popup=yes,width=1280,height=820,left=80,top=60,resizable=yes,scrollbars=yes";

const toNumber = (value: any) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
};

const toFiniteOrNull = (value: any) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
};

const toText = (value: any) => {
	if (value === undefined || value === null) return "";
	return String(value).trim();
};

const toLineItem = (item: any, index: number): CustomerDisplayLineItem => {
	const qty = toNumber(item?.qty);
	const rate = toNumber(item?.rate);
	const amount = toFiniteOrNull(item?.amount) ?? qty * rate;

	return {
		id:
			toText(item?.posa_row_id) ||
			toText(item?.item_code) ||
			`line_${index + 1}`,
		item_code: toText(item?.item_code),
		item_name:
			toText(item?.item_name) ||
			toText(item?.item_code) ||
			__("Item"),
		qty,
		rate,
		amount,
		uom: toText(item?.uom || item?.stock_uom),
	};
};

const getCustomerName = (
	invoiceDoc: any,
	customerInfo: Record<string, any>,
	selectedCustomer: string | null,
) =>
	toText(invoiceDoc?.customer_name) ||
	toText(customerInfo?.customer_name) ||
	toText(selectedCustomer);

const getInvoiceTotal = (
	invoiceDoc: any,
	keys: string[],
	fallback = 0,
) => {
	for (const key of keys) {
		const value = toFiniteOrNull(invoiceDoc?.[key]);
		if (value !== null) {
			return value;
		}
	}
	return fallback;
};

export function useCustomerDisplayPublisher({
	posProfile,
	eventBus,
}: UseCustomerDisplayPublisherOptions) {
	const invoiceStore = useInvoiceStore();
	const customersStore = useCustomersStore();

	const channelId = getOrCreateCustomerDisplayChannelId();
	const transport = createCustomerDisplayTransport(channelId);

	const isEnabled = computed(() =>
		isCustomerDisplayEnabled(posProfile.value),
	);
	const shouldAutoOpen = computed(() =>
		shouldAutoOpenCustomerDisplay(posProfile.value),
	);
	const autoOpenMarker = computed(() => getAutoOpenMarkerKey(channelId));

	let publishTimer: ReturnType<typeof setTimeout> | null = null;

	const buildSnapshot = (): CustomerDisplaySnapshot => {
		const items = (invoiceStore.items || []).map(toLineItem);
		const total_qty = items.reduce((sum, row) => sum + row.qty, 0);
		const item_total = items.reduce((sum, row) => sum + row.amount, 0);
		const additional_discount = toNumber(invoiceStore.additionalDiscount);
		const delivery_charges = toNumber(invoiceStore.deliveryChargesRate);
		const is_return = Boolean(invoiceStore.invoiceDoc?.is_return);
		const gross_total = is_return ? Math.abs(item_total) : item_total;
		const discount_magnitude = Math.abs(additional_discount);
		const subtotal = gross_total - discount_magnitude + delivery_charges;
		const invoiceDoc = invoiceStore.invoiceDoc;
		const tax_total = getInvoiceTotal(
			invoiceDoc,
			["total_taxes_and_charges", "base_total_taxes_and_charges"],
			0,
		);
		const item_discount_total = Math.abs(toNumber(invoiceStore.discountTotal));
		const invoice_discount = getInvoiceTotal(
			invoiceDoc,
			["discount_amount", "base_discount_amount"],
			additional_discount,
		);
		const fallback_total = toFiniteOrNull(subtotal + tax_total) ?? item_total;
		const grand_total = getInvoiceTotal(
			invoiceDoc,
			["rounded_total", "grand_total", "total", "net_total"],
			fallback_total,
		);
		const rounded_total = toFiniteOrNull(invoiceDoc?.rounded_total);
		const total_amount = grand_total;
		const totals_summary: CustomerDisplayTotalsSummary = {
			item_total,
			item_discount_total,
			additional_discount: invoice_discount,
			delivery_charges,
			tax_total,
			grand_total,
			rounded_total,
		};
		const customer_name = getCustomerName(
			invoiceDoc,
			customersStore.customerInfo,
			customersStore.selectedCustomer,
		);
		const currency =
			toText(posProfile.value?.currency) ||
			toText(invoiceDoc?.currency);

		return {
			channel_id: channelId,
			currency,
			customer_name,
			items,
			total_qty,
			total_amount,
			totals_summary,
			updated_at: new Date().toISOString(),
		};
	};

	const publishSnapshot = () => {
		if (!isEnabled.value) {
			return;
		}
		transport.publish(buildSnapshot());
	};

	const schedulePublish = () => {
		if (!isEnabled.value) {
			return;
		}
		if (publishTimer) {
			clearTimeout(publishTimer);
		}
		publishTimer = setTimeout(() => {
			publishTimer = null;
			publishSnapshot();
		}, 80);
	};

	const openCustomerDisplay = () => {
		if (!isEnabled.value) {
			frappe?.show_alert?.(
				{
					message: __("Enable Customer Display in POS Profile first."),
					indicator: "orange",
				},
				4,
			);
			return null;
		}

		const url = buildCustomerDisplayUrl(channelId);
		const displayWindow = window.open(
			url,
			CUSTOMER_DISPLAY_WINDOW_NAME,
			CUSTOMER_DISPLAY_WINDOW_FEATURES,
		);
		if (!displayWindow) {
			frappe?.show_alert?.(
				{
					message: __(
						"Customer display was blocked. Please allow pop-ups for this site.",
					),
					indicator: "red",
				},
				6,
			);
			return null;
		}

		try {
			displayWindow.focus?.();
		} catch {
			// Ignore focus errors when browser restricts window interactions.
		}

		schedulePublish();
		return displayWindow;
	};

	const markAutoOpenDone = () => {
		if (typeof window === "undefined" || !window.sessionStorage) return;
		window.sessionStorage.setItem(autoOpenMarker.value, "1");
	};

	const hasAutoOpened = () => {
		if (typeof window === "undefined" || !window.sessionStorage) return false;
		return window.sessionStorage.getItem(autoOpenMarker.value) === "1";
	};

	const tryAutoOpen = () => {
		if (!isEnabled.value || !shouldAutoOpen.value || hasAutoOpened()) {
			return;
		}
		const openedWindow = openCustomerDisplay();
		if (openedWindow) {
			markAutoOpenDone();
		}
	};

	const handleOpenRequest = () => {
		openCustomerDisplay();
	};

	onMounted(() => {
		if (eventBus?.on) {
			eventBus.on("open_customer_display", handleOpenRequest);
		}
		tryAutoOpen();
		schedulePublish();
	});

	onBeforeUnmount(() => {
		if (eventBus?.off) {
			eventBus.off("open_customer_display", handleOpenRequest);
		}
		if (publishTimer) {
			clearTimeout(publishTimer);
			publishTimer = null;
		}
		transport.close();
	});

	watch(
		() => invoiceStore.metadata.changeVersion,
		() => {
			schedulePublish();
		},
	);

	watch(
		() => [
			invoiceStore.additionalDiscount,
			invoiceStore.additionalDiscountPercentage,
			invoiceStore.deliveryChargesRate,
			invoiceStore.invoiceDoc?.is_return,
			invoiceStore.invoiceDoc?.net_total,
			invoiceStore.invoiceDoc?.total,
			invoiceStore.invoiceDoc?.total_taxes_and_charges,
			invoiceStore.invoiceDoc?.discount_amount,
			invoiceStore.invoiceDoc?.grand_total,
			invoiceStore.invoiceDoc?.rounded_total,
		],
		() => {
			schedulePublish();
		},
	);

	watch(
		() => customersStore.selectedCustomer,
		() => {
			schedulePublish();
		},
	);

	watch(
		() => customersStore.customerInfo,
		() => {
			schedulePublish();
		},
		{ deep: true },
	);

	watch(
		posProfile,
		() => {
			tryAutoOpen();
			schedulePublish();
		},
		{ deep: true, immediate: true },
	);

	return {
		channelId,
		openCustomerDisplay,
		publishCustomerDisplaySnapshot: publishSnapshot,
	};
}
