import { ref } from "vue";

export function useInvoiceUI() {
	const invoiceHeight = ref<string | null>(null);
	const confirm_payment_dialog = ref(false);
	let payment_confirmation_resolver: ((_result: boolean) => void) | null =
		null;

	const saveInvoiceHeight = (element: HTMLElement | null) => {
		if (element) {
			invoiceHeight.value = element.clientHeight + "px";
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
		try {
			const saved = localStorage.getItem("posawesome_invoice_height");
			if (saved) {
				invoiceHeight.value = saved;
			} else {
				invoiceHeight.value =
					getComputedStyle(document.documentElement).getPropertyValue(
						"--container-height",
					) || "68vh";
			}
		} catch (e) {
			console.error("Failed to load invoice height:", e);
			invoiceHeight.value =
				getComputedStyle(document.documentElement).getPropertyValue(
					"--container-height",
				) || "68vh";
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

	const showDropFeedback = (isDragging: boolean, el: Element | null) => {
		const itemsTable = el?.querySelector(".modern-items-table");
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
