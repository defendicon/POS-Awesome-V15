import { ref } from "vue";

export function useInvoiceUI() {
	const invoiceHeight = ref<string | null>(null);
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
		if (viewportHeight <= 900) return Math.round(viewportHeight * 0.56);
		return Math.round(viewportHeight * 0.68);
	};

	const getDefaultInvoiceHeight = () => {
		if (typeof document === "undefined") {
			return "68vh";
		}
		return (
			getComputedStyle(document.documentElement)
				.getPropertyValue("--container-height")
				.trim() || "68vh"
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

	const saveInvoiceHeight = (element: HTMLElement | null) => {
		if (element) {
			const defaultHeight = getDefaultInvoiceHeight();
			invoiceHeight.value = clampInvoiceHeight(
				`${element.clientHeight}px`,
				defaultHeight,
			);
			try {
				localStorage.setItem(
					"posawesome_invoice_height",
					invoiceHeight.value,
				);
			} catch (e) {
				console.error("Failed to save invoice height:", e);
			}
		}
	};

	const loadInvoiceHeight = () => {
		const defaultHeight = getDefaultInvoiceHeight();
		try {
			const saved = localStorage.getItem("posawesome_invoice_height");
			invoiceHeight.value = clampInvoiceHeight(
				saved || defaultHeight,
				defaultHeight,
			);
			localStorage.setItem("posawesome_invoice_height", invoiceHeight.value);
		} catch (e) {
			console.error("Failed to load invoice height:", e);
			invoiceHeight.value = clampInvoiceHeight(defaultHeight, defaultHeight);
		}
	};

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
