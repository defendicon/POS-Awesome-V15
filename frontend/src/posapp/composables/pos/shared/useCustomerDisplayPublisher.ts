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
} from "../../../utils/customerDisplay";

declare const frappe: any;
declare const __: (_text: string, _args?: any[]) => string;

interface UseCustomerDisplayPublisherOptions {
	posProfile: Ref<any>;
	eventBus?: any;
}

const toNumber = (value: any) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
};

const toText = (value: any) => {
	if (value === undefined || value === null) return "";
	return String(value).trim();
};

const toLineItem = (item: any, index: number): CustomerDisplayLineItem => {
	const qty = toNumber(item?.qty);
	const rate = toNumber(item?.rate);
	const fallbackAmount = qty * rate;
	const amount = Number.isFinite(Number(item?.amount))
		? Number(item.amount)
		: fallbackAmount;

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
		const total_amount = items.reduce((sum, row) => sum + row.amount, 0);
		const customer_name = getCustomerName(
			invoiceStore.invoiceDoc,
			customersStore.customerInfo,
			customersStore.selectedCustomer,
		);
		const currency =
			toText(posProfile.value?.currency) ||
			toText(invoiceStore.invoiceDoc?.currency);

		return {
			channel_id: channelId,
			currency,
			customer_name,
			items,
			total_qty,
			total_amount,
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
		const displayWindow = window.open(url, "_blank", "noopener");
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
		openCustomerDisplay();
		markAutoOpenDone();
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
