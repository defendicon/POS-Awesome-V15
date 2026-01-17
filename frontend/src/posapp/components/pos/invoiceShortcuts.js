/* global frappe, __ */
const isAltOnly = (event) => event.altKey && !event.ctrlKey && !event.metaKey;
const consumeEvent = (event) => {
	event.preventDefault();
	event.stopPropagation();
};
const isDigit = (event, digit) =>
	event.key === String(digit) || event.code === `Digit${digit}` || event.code === `Numpad${digit}`;
const isBackquote = (event) => event.key === "`" || event.code === "Backquote";
const isLetter = (event, letter) => {
	const normalized = letter.toLowerCase();
	const keyValue = event.key?.toLowerCase?.();
	return keyValue === normalized || event.code === `Key${letter.toUpperCase()}`;
};

export default {
	async handleInvoiceShortcut(event) {
		if (event.defaultPrevented) {
			return;
		}

		const key = event.key;

		if (key === "F4") {
			consumeEvent(event);
			this.eventBus.emit("show_message", {
				title: __("Profile switching is not available yet"),
				color: "warning",
			});
			return;
		}

		if (key === "F6") {
			consumeEvent(event);
			this.$refs.customerComponent?.openNewCustomer?.();
			return;
		}

		if (key === "F7") {
			consumeEvent(event);
			this.eventBus.emit("open_shift_details");
			return;
		}

		if (key === "F8") {
			consumeEvent(event);
			this.eventBus.emit("show_message", {
				title: __("POS lock is not available yet"),
				color: "warning",
			});
			return;
		}

		if (!isAltOnly(event)) {
			return;
		}

		if (isDigit(event, 1)) {
			consumeEvent(event);
			if (typeof this.close_payments === "function") {
				this.close_payments();
			} else {
				this.eventBus.emit("show_payment", "false");
			}
			return;
		}

		if (isDigit(event, 2)) {
			consumeEvent(event);
			this.cancel_dialog = true;
			return;
		}

		if (isDigit(event, 3)) {
			consumeEvent(event);
			this.eventBus.emit("focus_item_search");
			return;
		}

		if (isDigit(event, 4)) {
			consumeEvent(event);
			this.eventBus.emit("select_top_item");
			return;
		}

		if (isDigit(event, 5)) {
			consumeEvent(event);
			this.focusCustomerSearchField?.();
			return;
		}

		if (isDigit(event, 6)) {
			consumeEvent(event);
			this.$refs.customerComponent?.selectFirstCustomer?.();
			return;
		}

		if (isDigit(event, 7)) {
			consumeEvent(event);
			this.get_draft_orders?.();
			return;
		}

		if (isDigit(event, 8)) {
			consumeEvent(event);
			this.open_returns?.();
			return;
		}

		if (isDigit(event, 9)) {
			consumeEvent(event);
			this.$refs.deliveryChargesComponent?.focusDeliveryCharges?.();
			return;
		}

		if (isBackquote(event)) {
			consumeEvent(event);
			this.$refs.postingDateComponent?.focusPostingDate?.();
			return;
		}

		if (key === "PageUp") {
			consumeEvent(event);
			this.show_payment?.();
			return;
		}

		if (key === "Home") {
			consumeEvent(event);
			frappe.set_route("/");
			location.reload();
			return;
		}

		if (isLetter(event, "q")) {
			consumeEvent(event);
			this.focusItemTableField("qty");
			return;
		}

		if (isLetter(event, "a")) {
			consumeEvent(event);
			this.focusAdditionalDiscountField?.();
			return;
		}

		if (isLetter(event, "u")) {
			consumeEvent(event);
			this.focusItemTableField("uom");
			return;
		}

		if (isLetter(event, "r")) {
			consumeEvent(event);
			this.focusItemTableField("rate");
			return;
		}

		if (isLetter(event, "e")) {
			consumeEvent(event);
			const firstItem = this.items?.[0];
			if (firstItem) {
				this.remove_item?.(firstItem);
			}
			return;
		}

		if (isLetter(event, "f")) {
			consumeEvent(event);
			const input = this.$refs.itemSearchField;
			if (input?.focus) {
				input.focus();
			} else {
				input?.$el?.querySelector?.("input")?.focus?.();
			}
			return;
		}

		if (isLetter(event, "l")) {
			consumeEvent(event);
			this.get_draft_invoices?.();
			return;
		}

		if (isLetter(event, "m")) {
			consumeEvent(event);
			this.eventBus.emit("toggle_item_selector_settings");
			return;
		}

		if (isLetter(event, "s")) {
			consumeEvent(event);
			this.save_and_clear_invoice?.();
			return;
		}

		if (isLetter(event, "d")) {
			consumeEvent(event);
			this.show_payment?.();
			return;
		}

		const isPaymentShortcut = isLetter(event, "x");
		const isPrintShortcut = isLetter(event, "p");
		if (isPaymentShortcut || isPrintShortcut) {
			if (this.paymentVisible) {
				return;
			}
			consumeEvent(event);

			const shouldPrint = isPrintShortcut;
			const shouldSubmit = window.confirm(
				__("Payments are not open. Do you want to open payments and submit?"),
			);
			if (!shouldSubmit) {
				return;
			}
			await this.show_payment?.();
			if (this.paymentVisible) {
				this.eventBus.emit("submit_payment_shortcut", { print: shouldPrint });
			}
		}
	},

	focusItemTableField(field) {
		const count = this.items?.length || 0;
		if (!count) {
			return;
		}

		if (!this.shortcutCycle) {
			this.shortcutCycle = { qty: 0, uom: 0, rate: 0 };
		}

		let index = Number.isInteger(this.shortcutCycle[field]) ? this.shortcutCycle[field] : 0;
		if (index >= count) {
			index = 0;
		}
		this.shortcutCycle[field] = (index + 1) % count;
		this.$refs.itemsTable?.focusItemField?.(index, field);
	},
};
