import { onBeforeUnmount, onMounted, ref } from "vue";

export function useInvoiceUI() {
	const LEGACY_HEIGHT_KEY = "posawesome_invoice_height";
	const HEIGHT_PREFERENCE_KEY = "posawesome_invoice_height_v2";

	const invoiceHeight = ref<string | null>(null);
	const savedHeightRatio = ref<number | null>(null);
	const confirm_payment_dialog = ref(false);
	let payment_confirmation_resolver: ((_result: boolean) => void) | null =
		null;

	const getViewportHeight = () => {
		if (typeof window === "undefined") {
			return 768;
		}
		return window.innerHeight || 768;
	};

	const getMaxInvoiceHeightPx = () => {
		const viewportHeight = getViewportHeight();
		if (viewportHeight <= 800) return Math.round(viewportHeight * 0.48);
		if (viewportHeight <= 900) return Math.round(viewportHeight * 0.54);
		if (viewportHeight <= 1100) return Math.round(viewportHeight * 0.6);
		if (viewportHeight <= 1300) return Math.round(viewportHeight * 0.63);
		return Math.round(viewportHeight * 0.66);
	};

	const getDefaultInvoiceHeight = () => {
		if (typeof document === "undefined") {
			return "60vh";
		}
		return (
			getComputedStyle(document.documentElement)
				.getPropertyValue("--container-height")
				.trim() || "60vh"
		);
	};

	const parseHeightToPx = (value: string | null | undefined) => {
		if (!value || typeof value !== "string") return null;
		const trimmed = value.trim();
		const parsed = Number.parseFloat(trimmed);
		if (!Number.isFinite(parsed)) return null;
		if (trimmed.endsWith("vh")) {
			return (getViewportHeight() * parsed) / 100;
		}
		return parsed;
	};

	const clampInvoiceHeight = (
		value: string | null | undefined,
		fallback: string,
	) => {
		const fallbackPx = parseHeightToPx(fallback) ?? getMaxInvoiceHeightPx();
		const requestedPx = parseHeightToPx(value) ?? fallbackPx;
		const maxPx = getMaxInvoiceHeightPx();
		const minPx = Math.min(320, maxPx);
		const clamped = Math.max(minPx, Math.min(requestedPx, maxPx));
		return `${Math.round(clamped)}px`;
	};

	const toHeightRatio = (heightPx: number | null) => {
		if (!Number.isFinite(heightPx as number) || heightPx == null) return null;
		const viewportHeight = getViewportHeight();
		if (viewportHeight <= 0) return null;
		return (heightPx as number) / viewportHeight;
	};

	const saveHeightPreference = (ratio: number | null) => {
		try {
			if (ratio == null || !Number.isFinite(ratio) || ratio <= 0) {
				localStorage.removeItem(HEIGHT_PREFERENCE_KEY);
				return;
			}
			localStorage.setItem(
				HEIGHT_PREFERENCE_KEY,
				JSON.stringify({
					ratio,
				}),
			);
		} catch (e) {
			console.error("Failed to persist invoice height preference:", e);
		}
	};

	const loadHeightPreference = () => {
		try {
			const raw = localStorage.getItem(HEIGHT_PREFERENCE_KEY);
			if (!raw) return null;
			const parsed = JSON.parse(raw);
			const ratio = Number(parsed?.ratio);
			if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 1.5) {
				return null;
			}
			return ratio;
		} catch (e) {
			console.error("Failed to parse invoice height preference:", e);
			return null;
		}
	};

	const applyHeightFromRatio = () => {
		if (savedHeightRatio.value == null) {
			invoiceHeight.value = null;
			return;
		}
		const defaultHeight = getDefaultInvoiceHeight();
		const requestedPx = savedHeightRatio.value * getViewportHeight();
		invoiceHeight.value = clampInvoiceHeight(`${requestedPx}px`, defaultHeight);
	};

	const saveInvoiceHeight = (element: HTMLElement | null) => {
		if (element) {
			const defaultHeight = getDefaultInvoiceHeight();
			invoiceHeight.value = clampInvoiceHeight(
				`${element.clientHeight}px`,
				defaultHeight,
			);
			try {
				savedHeightRatio.value = toHeightRatio(
					parseHeightToPx(invoiceHeight.value),
				);
				saveHeightPreference(savedHeightRatio.value);
				localStorage.removeItem(LEGACY_HEIGHT_KEY);
			} catch (e) {
				console.error("Failed to save invoice height:", e);
			}
		}
	};

	const loadInvoiceHeight = () => {
		try {
			savedHeightRatio.value = loadHeightPreference();
			// Drop legacy fixed px storage to keep layout adaptive across screens.
			localStorage.removeItem(LEGACY_HEIGHT_KEY);
			applyHeightFromRatio();
		} catch (e) {
			console.error("Failed to load invoice height:", e);
			savedHeightRatio.value = null;
			invoiceHeight.value = null;
		}
	};

	const handleResize = () => {
		applyHeightFromRatio();
	};

	onMounted(() => {
		if (typeof window !== "undefined") {
			window.addEventListener("resize", handleResize);
		}
	});

	onBeforeUnmount(() => {
		if (typeof window !== "undefined") {
			window.removeEventListener("resize", handleResize);
		}
	});

	const confirmPaymentSubmission = () => {
		confirm_payment_dialog.value = true;
		return new Promise<boolean>((resolve) => {
			payment_confirmation_resolver = resolve;
		});
	};

	const resolvePaymentConfirmation = (result: boolean) => {
		confirm_payment_dialog.value = false;
		if (payment_confirmation_resolver) {
			payment_confirmation_resolver(result);
			payment_confirmation_resolver = null;
		}
	};

	const resolveElement = (target: any): Element | null => {
		if (!target) return null;
		if (target instanceof Element) return target;
		if (target?.value) return resolveElement(target.value);
		if (target?.$el instanceof Element) return target.$el;
		return null;
	};

	const showDropFeedback = (isDragging: boolean, target: any) => {
		const root = resolveElement(target);
		if (!root) return;
		const itemsTable = root.matches(".modern-items-table")
			? root
			: root.querySelector(".modern-items-table") || root;
		if (itemsTable) {
			if (isDragging) {
				itemsTable.classList.add("drag-over");
			} else {
				itemsTable.classList.remove("drag-over");
			}
		}
	};

	return {
		invoiceHeight,
		saveInvoiceHeight,
		loadInvoiceHeight,
		confirm_payment_dialog,
		confirmPaymentSubmission,
		resolvePaymentConfirmation,
		showDropFeedback,
	};
}
