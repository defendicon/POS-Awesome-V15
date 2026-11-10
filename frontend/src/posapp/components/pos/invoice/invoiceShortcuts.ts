import { resolveReturnDefaultAmount } from "../../../utils/paymentInitialization";
import { requestSafeRefresh } from "../../../services/safeRefresh";

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
const isArrowRight = (event: KeyboardEvent) =>
	event.key === "ArrowRight" || event.code === "ArrowRight";
const isArrowKey = (event: KeyboardEvent) =>
	["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key);
const isMacPlatform = () => {
	const nav = typeof navigator !== "undefined" ? navigator : undefined;
	return /Mac|iPhone|iPad|iPod/i.test(
		`${nav?.platform || ""} ${nav?.userAgent || ""}`,
	);
};
const isLetter = (event: KeyboardEvent, letter: string) => {
	const normalized = letter.toLowerCase();
	const keyValue = event.key?.toLowerCase?.();
	return (
		keyValue === normalized || event.code === `Key${letter.toUpperCase()}`
	);
};
const isTextEditingTarget = (target: EventTarget | null) => {
	const element = target as HTMLElement | null;
	if (!element) {
		return false;
	}
	const tagName = element.tagName?.toLowerCase?.();
	return (
		element.isContentEditable ||
		tagName === "input" ||
		tagName === "textarea" ||
		tagName === "select" ||
		["textbox", "searchbox", "spinbutton", "combobox"].includes(
			String(element.getAttribute("role") || "").toLowerCase(),
		)
	);
};
const isArrowEntrySearchTarget = (target: EventTarget | null) => {
	const element = target as HTMLElement | null;
	return Boolean(element?.closest?.("[data-pos-arrow-enters-invoice-grid]"));
};
const isItemSearchTarget = (target: EventTarget | null) => {
	const element = target as HTMLElement | null;
	return Boolean(
		element?.closest?.(
			"[data-pos-keyboard-target='item-search'], [data-testid='pos-item-search'], .search-field-shell",
		),
	);
};
const isElementVisible = (element: HTMLElement) => {
	if (typeof window === "undefined") {
		return false;
	}
	const style = window.getComputedStyle(element);
	const rect = element.getBoundingClientRect();
	return (
		style.display !== "none" &&
		style.visibility !== "hidden" &&
		rect.width > 0 &&
		rect.height > 0
	);
};
const hasVisibleOverlay = () => {
	if (typeof document === "undefined") {
		return false;
	}
	return Array.from(
		document.querySelectorAll<HTMLElement>(".v-overlay__content"),
	).some(isElementVisible);
};
const shouldEnterInvoiceGridFromArrow = (event: KeyboardEvent) => {
	if (
		!isArrowKey(event) ||
		event.altKey ||
		event.ctrlKey ||
		event.metaKey ||
		hasVisibleOverlay()
	) {
		return false;
	}
	const target = event.target as HTMLElement | null;
	if (target?.closest?.(".posa-items-table-container, .v-overlay__content")) {
		return false;
	}
	if (isItemSearchTarget(target)) {
		return false;
	}
	return !isTextEditingTarget(target) || isArrowEntrySearchTarget(target);
};
const invoiceGridEntryOptionsFromArrow = (key: string, count: number) => {
	const rowIndex = key === "ArrowDown" ? 0 : Math.max(0, count - 1);
	if (key === "ArrowLeft" || key === "ArrowRight") {
		return {
			rowIndex,
			mode: "cell" as const,
			cellEdge:
				key === "ArrowLeft" ? ("last" as const) : ("first" as const),
		};
	}
	return { rowIndex, mode: "row" as const };
};
const showCompactPanel = (
	eventBus:
		| { emit: (_event: string, _payload?: unknown) => void }
		| undefined,
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
			enterKeyboardGrid?: (_options?: {
				rowIndex?: number;
				mode?: "row" | "cell";
				cellEdge?: "first" | "last";
			}) => boolean;
		};
		itemsTable?: {
			focusItemField?: (_index: number, _field: ShortcutField) => void;
			enterKeyboardGrid?: (_options?: {
				rowIndex?: number;
				mode?: "row" | "cell";
				cellEdge?: "first" | "last";
			}) => boolean;
		};
	};
	items?: Array<Record<string, unknown>>;
	invoice_doc?: {
		rounded_total?: number;
		grand_total?: number;
		is_return?: number | boolean;
		posa_refundable_amount?: number;
	};
	subtotal?: number;
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
	openItemWorkspace?: () => void;
	openItemQuickEdit?: () => void;
	focusItemSearchField?: () => void;
	isCounterGridPresentation?: boolean;
	get_invoice_doc?: () => {
		rounded_total?: number;
		grand_total?: number;
		is_return?: number | boolean;
		posa_refundable_amount?: number;
	};
	confirmPaymentSubmission: (
		_initialAmount?: number,
	) => Promise<number | null>;
	getShortcutPaymentAmount: () => number;
	focusItemTableField: (_field: ShortcutField) => void;
	enterInvoiceItemsGrid: (_options?: {
		rowIndex?: number;
		mode?: "row" | "cell";
		cellEdge?: "first" | "last";
	}) => void;
	enterInvoiceItemsGridFromArrow?: (_key?: string) => void;
}

const invoiceShortcuts: Record<string, unknown> & ThisType<InvoiceShortcutsVm> =
	{
		async handleInvoiceShortcut(event: KeyboardEvent) {
			if (event.defaultPrevented) {
				return;
			}

			const key = event.key;

			if (shouldEnterInvoiceGridFromArrow(event)) {
				const count = this.items?.length || 0;
				if (!count) {
					return;
				}
				consumeEvent(event);
				showCompactPanel(this.eventBus, "invoice");
				this.enterInvoiceItemsGrid(
					invoiceGridEntryOptionsFromArrow(key, count),
				);
				return;
			}

			if (key === "F2") {
				consumeEvent(event);
				this.focusItemSearchField?.();
				return;
			}

			if (key === "F12") {
				consumeEvent(event);
				(this.openItemWorkspace || this.openItemQuickEdit)?.call(this);
				return;
			}

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

			if (key === "F9") {
				consumeEvent(event);
				this.show_payment?.();
				return;
			}

			if (!isAltOnly(event)) {
				return;
			}

			if (isArrowRight(event)) {
				consumeEvent(event);
				showCompactPanel(this.eventBus, "invoice");
				this.enterInvoiceItemsGrid();
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
				if (this.isCounterGridPresentation) {
					this.focusItemSearchField?.();
					return;
				}
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
				if (isMacPlatform()) {
					(this.openItemWorkspace || this.openItemQuickEdit)?.call(
						this,
					);
					return;
				}
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
				requestSafeRefresh({ action: () => { frappe.set_route("/"); location.reload(); } });
				return;
			}

			if (this.isCounterGridPresentation && isLetter(event, "g")) {
				consumeEvent(event);
				this.eventBus.emit("open_cart_alternates");
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
					const paymentAmount = await this.confirmPaymentSubmission(
						this.getShortcutPaymentAmount(),
					);
					if (paymentAmount === null) {
						return;
					}
					await this.flushBackgroundUpdates?.();
					this.triggerBackgroundFlush?.flush?.();
					this.schedulePricingRuleApplication?.flush?.();
					showCompactPanel(this.eventBus, "selector");
					await this.show_payment?.();
					this.eventBus.emit("queue_submit_payment_shortcut", {
						print: shouldPrint,
						amount: paymentAmount,
					});
				} finally {
					this.shortcutSubmitInFlight = false;
				}
			}
		},

		getShortcutPaymentAmount() {
			const currentDoc = this.get_invoice_doc?.() || this.invoice_doc;
			const doc = currentDoc
				? {
						...currentDoc,
						posa_refundable_amount:
							this.invoice_doc?.posa_refundable_amount ??
							currentDoc.posa_refundable_amount,
					}
				: undefined;
			const amount = Number(
				doc?.rounded_total ?? doc?.grand_total ?? this.subtotal ?? 0,
			);
			return Number.isFinite(amount)
				? Math.abs(resolveReturnDefaultAmount(doc, amount))
				: 0;
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

		enterInvoiceItemsGrid(options?: {
			rowIndex?: number;
			mode?: "row" | "cell";
			cellEdge?: "first" | "last";
		}) {
			const count = this.items?.length || 0;
			if (!count) {
				return;
			}

			const resolvedOptions = options || {
				rowIndex: count - 1,
				mode: "row" as const,
			};
			this.$refs.itemsTableRef?.enterKeyboardGrid?.(resolvedOptions) ||
				this.$refs.itemsTable?.enterKeyboardGrid?.(resolvedOptions);
		},

		enterInvoiceItemsGridFromArrow(key?: string) {
			const count = this.items?.length || 0;
			if (!count) {
				return;
			}

			this.enterInvoiceItemsGrid(
				invoiceGridEntryOptionsFromArrow(key || "ArrowUp", count),
			);
		},
	};

export default invoiceShortcuts;
