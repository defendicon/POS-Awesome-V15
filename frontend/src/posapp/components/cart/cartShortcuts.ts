const isAltOnly = (event: KeyboardEvent) =>
	event.altKey && !event.ctrlKey && !event.metaKey;
const consumeEvent = (event: KeyboardEvent) => {
	event.preventDefault();
	event.stopPropagation();
	event.stopImmediatePropagation?.();
};
const isDigit = (event: KeyboardEvent, digit: number) =>
	event.key === String(digit) ||
	event.code === `Digit${digit}` ||
	event.code === `Numpad${digit}`;
const isBackquote = (event: KeyboardEvent) =>
	event.key === "`" || event.code === "Backquote";
const isLetter = (event: KeyboardEvent, letter: string) => {
	const normalized = letter.toLowerCase();
	const keyValue = event.key?.toLowerCase?.();
	return (
		keyValue === normalized || event.code === `Key${letter.toUpperCase()}`
	);
};
const showCompactPanel = (
	eventBus: { emit: (_event: string, _payload?: unknown) => void } | undefined,
	panel: "selector" | "invoice",
) => {
	eventBus?.emit?.("set_compact_panel", panel);
};

type ShortcutField = "qty" | "uom" | "rate";

interface InvoiceShortcutsVm {
	toastStore: { show: (_payload: { title: string; color: string }) => void };
	eventBus: {
		emit: (_event: string, _payload?: unknown) => void;
		on?: (_event: string, _handler: (_payload?: unknown) => void) => void;
		off?: (_event: string, _handler: (_payload?: unknown) => void) => void;
	};
	uiStore: {
		setActiveView: (_view: string) => void;
		triggerItemSearchFocus: () => void;
		selectTopItem: () => void;
		toggleItemSettings: () => void;
	};
	$refs: {
		actionToolbar?: {
			focusSearch?: () => void;
		};
		customerSection?: {
			openNewCustomer?: () => void;
			selectFirstCustomer?: () => void;
		};
		customerComponent?: {
			openNewCustomer?: () => void;
			selectFirstCustomer?: () => void;
		};
		deliveryChargesComponent?: { focusDeliveryCharges?: () => void };
		postingDateComponent?: { focusPostingDate?: () => void };
		itemSearchField?: {
			focus?: () => void;
			$el?: { querySelector?: (_s: string) => { focus?: () => void } };
		};
		itemsTableRef?: {
			focusItemField?: (_index: number, _field: ShortcutField) => void;
		};
		itemsTable?: {
			focusItemField?: (_index: number, _field: ShortcutField) => void;
		};
	};
	items?: Array<Record<string, unknown>>;
	paymentVisible?: boolean;
	shortcutSubmitInFlight?: boolean;
	cancel_dialog?: boolean;
	shortcutCycle?: Record<ShortcutField, number>;
	flushBackgroundUpdates?: () => Promise<void> | void;
	schedulePricingRuleApplication?: {
		(_force?: boolean): void;
		flush?: () => void;
		cancel?: () => void;
	};
	triggerBackgroundFlush?: {
		(): void;
		flush?: () => void;
		cancel?: () => void;
	};
	close_payments?: () => void;
	focusCustomerSearchField?: () => void;
	get_draft_orders?: () => void;
	open_returns?: () => void;
	show_payment?: () => Promise<void> | void;
	focusAdditionalDiscountField?: () => void;
	remove_item?: (_item: Record<string, unknown>) => void;
	get_draft_invoices?: () => void;
	save_and_clear_invoice?: () => void;
	confirmPaymentSubmission: () => Promise<boolean>;
	focusItemTableField: (_field: ShortcutField) => void;
}

const invoiceShortcuts: Record<string, unknown> & ThisType<InvoiceShortcutsVm> =
	{
		async handleInvoiceShortcut(event: KeyboardEvent) {
			if (event.defaultPrevented) {
				return;
			}

			const key = event.key;

			if (key === "F4") {
				consumeEvent(event);
				this.eventBus.emit("open_employee_switch");
				return;
			}

			if (key === "F6") {
				consumeEvent(event);
				this.$refs.customerSection?.openNewCustomer?.() ||
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
				this.eventBus.emit("lock_pos_screen");
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
					showCompactPanel(this.eventBus, "invoice");
					this.uiStore.setActiveView("items");
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
				showCompactPanel(this.eventBus, "selector");
				this.uiStore.setActiveView("items");
				this.uiStore.triggerItemSearchFocus();
				this.eventBus.emit("focus_item_search");
				return;
			}

			if (isDigit(event, 4)) {
				consumeEvent(event);
				showCompactPanel(this.eventBus, "selector");
				this.uiStore.setActiveView("items");
				this.uiStore.selectTopItem();
				return;
			}

			if (isDigit(event, 5)) {
				consumeEvent(event);
				showCompactPanel(this.eventBus, "invoice");
				this.focusCustomerSearchField?.();
				return;
			}

			if (isDigit(event, 6)) {
				consumeEvent(event);
				showCompactPanel(this.eventBus, "invoice");
				this.$refs.customerSection?.selectFirstCustomer?.() ||
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
				showCompactPanel(this.eventBus, "invoice");
				this.$refs.deliveryChargesComponent?.focusDeliveryCharges?.();
				return;
			}

			if (isBackquote(event)) {
				consumeEvent(event);
				showCompactPanel(this.eventBus, "invoice");
				this.$refs.postingDateComponent?.focusPostingDate?.();
				return;
			}

			if (key === "PageUp") {
				consumeEvent(event);
				showCompactPanel(this.eventBus, "selector");
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
				showCompactPanel(this.eventBus, "invoice");
				this.focusItemTableField("qty");
				return;
			}

			if (isLetter(event, "a")) {
				consumeEvent(event);
				showCompactPanel(this.eventBus, "invoice");
				this.focusAdditionalDiscountField?.();
				return;
			}

			if (isLetter(event, "u")) {
				consumeEvent(event);
				showCompactPanel(this.eventBus, "invoice");
				this.focusItemTableField("uom");
				return;
			}

			if (isLetter(event, "r")) {
				consumeEvent(event);
				showCompactPanel(this.eventBus, "invoice");
				this.focusItemTableField("rate");
				return;
			}

			if (isLetter(event, "e")) {
				consumeEvent(event);
				showCompactPanel(this.eventBus, "invoice");
				const firstItem = this.items?.[0];
				if (firstItem) {
					this.remove_item?.(firstItem);
				}
				return;
			}

			if (isLetter(event, "f")) {
				consumeEvent(event);
				showCompactPanel(this.eventBus, "invoice");
				if (this.$refs.actionToolbar?.focusSearch) {
					this.$refs.actionToolbar.focusSearch();
					return;
				}
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
				showCompactPanel(this.eventBus, "selector");
				this.uiStore.toggleItemSettings();
				return;
			}

			if (isLetter(event, "s")) {
				consumeEvent(event);
				this.save_and_clear_invoice?.();
				return;
			}

			if (isLetter(event, "d")) {
				consumeEvent(event);
				showCompactPanel(this.eventBus, "selector");
				this.show_payment?.();
				return;
			}

			const isPaymentShortcut = isLetter(event, "x");
			const isPrintShortcut = isLetter(event, "p");
			if (isPaymentShortcut || isPrintShortcut) {
				if (this.paymentVisible) {
					return;
				}
				if (event.repeat || this.shortcutSubmitInFlight) {
					consumeEvent(event);
					return;
				}
				consumeEvent(event);
				this.shortcutSubmitInFlight = true;

				try {
					const shouldPrint = isPrintShortcut;
					const shouldSubmit = await this.confirmPaymentSubmission();
					if (!shouldSubmit) {
						return;
					}
					await this.flushBackgroundUpdates?.();
					this.triggerBackgroundFlush?.flush?.();
					this.schedulePricingRuleApplication?.flush?.();
					showCompactPanel(this.eventBus, "selector");
					await this.show_payment?.();
					this.eventBus.emit("queue_submit_payment_shortcut", {
						print: shouldPrint,
					});
				} finally {
					this.shortcutSubmitInFlight = false;
				}
			}
		},

		focusItemTableField(field: ShortcutField) {
			const count = this.items?.length || 0;
			if (!count) {
				return;
			}

			if (!this.shortcutCycle) {
				this.shortcutCycle = { qty: 0, uom: 0, rate: 0 };
			}

			let index = Number.isInteger(this.shortcutCycle[field])
				? this.shortcutCycle[field]
				: 0;
			if (index >= count) {
				index = 0;
			}
			this.shortcutCycle[field] = (index + 1) % count;
			this.$refs.itemsTableRef?.focusItemField?.(index, field) ||
				this.$refs.itemsTable?.focusItemField?.(index, field);
		},
	};

export default invoiceShortcuts;
