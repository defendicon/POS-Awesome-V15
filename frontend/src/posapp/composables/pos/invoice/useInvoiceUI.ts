import { ref } from "vue";

export function useInvoiceUI() {
	const confirm_payment_dialog = ref(false);
	let payment_confirmation_resolver: ((_result: boolean) => void) | null =
		null;

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
		confirm_payment_dialog,
		confirmPaymentSubmission,
		resolvePaymentConfirmation,
		showDropFeedback,
	};
}
