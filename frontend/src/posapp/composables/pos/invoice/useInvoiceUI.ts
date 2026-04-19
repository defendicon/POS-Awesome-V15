/**
 * Invoice panel layout, resize persistence, and modal-confirmation helpers.
 *
 * **Resizable invoice panel**
 * The invoice item list panel can be resized by the operator on large screens.
 * `canResizeInvoicePanel()` returns `true` only when the viewport is at least
 * 1280 × 860 px; below that threshold a viewport-fraction default is used instead.
 * The clamped height is persisted in `localStorage` under the key
 * `posawesome_invoice_height` and reloaded on the next session.
 * The maximum height scales with viewport size: 58 % on very small screens,
 * 64 % on medium, 72 % on large. A minimum of 320 px is enforced.
 * The CSS custom property `--container-height` is used as the fallback default.
 *
 * **Payment confirmation dialog**
 * `confirmPaymentSubmission()` opens `confirm_payment_dialog` and returns a
 * `Promise<boolean>` that resolves when `resolvePaymentConfirmation(result)` is
 * called by the dialog component. The resolver is stored in a closure-local
 * variable and cleared after resolution to prevent double-resolve.
 *
 * **Drag feedback**
 * `showDropFeedback(isDragging, target)` adds or removes the `drag-over` CSS
 * class from the `.modern-items-table` element inside `target`, providing visual
 * feedback during item drag-and-drop onto the cart.
 */
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

	const getViewportWidth = () => {
		if (typeof window === "undefined") {
			return 1366;
		}
		return window.innerWidth || 1366;
	};

	const canResizeInvoicePanel = () => {
		return getViewportWidth() >= 1280 && getViewportHeight() >= 860;
	};

	const getMaxInvoiceHeightPx = () => {
		const viewportHeight = getViewportHeight();
		if (viewportHeight <= 800) return Math.round(viewportHeight * 0.58);
		if (viewportHeight <= 960) return Math.round(viewportHeight * 0.64);
		return Math.round(viewportHeight * 0.72);
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
			if (!canResizeInvoicePanel()) {
				invoiceHeight.value = clampInvoiceHeight(defaultHeight, defaultHeight);
				return;
			}
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
			if (!canResizeInvoicePanel()) {
				invoiceHeight.value = clampInvoiceHeight(defaultHeight, defaultHeight);
				return;
			}
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
		canResizeInvoicePanel,
		saveInvoiceHeight,
		loadInvoiceHeight,
		confirm_payment_dialog,
		confirmPaymentSubmission,
		resolvePaymentConfirmation,
		showDropFeedback,
	};
}
