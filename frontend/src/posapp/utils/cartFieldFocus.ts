export type CartGridColumnKey =
	| "item_name"
	| "qty"
	| "uom"
	| "price_list_rate"
	| "discount_percentage"
	| "discount_amount"
	| "rate"
	| "amount"
	| "posa_is_offer"
	| "actions"
	| "data-table-expand";

export type CartShortcutField =
	| "qty"
	| "uom"
	| "rate"
	| "discount_percentage"
	| "discount_amount";

export interface CartFieldFocusOptions {
	activate?: boolean;
}

export type CounterGridKeyboardCommand =
	| { type: "move-entry"; delta: -1 }
	| {
			type: "move-boundary";
			row: "current" | "first" | "last";
			column: "first" | "last";
	  };

const FIELD_SELECTORS: Record<CartGridColumnKey, string> = {
	item_name: '[data-column-key="item_name"]',
	qty: '[data-column-key="qty"] .posa-cart-table__qty-input-shell input',
	uom: '[data-column-key="uom"] .posa-cart-table__editor-display',
	price_list_rate: '[data-column-key="price_list_rate"]',
	rate: '[data-column-key="rate"] .posa-cart-table__editor-display',
	amount: '[data-column-key="amount"]',
	discount_percentage:
		'[data-column-key="discount_percentage"] .posa-cart-table__editor-display',
	discount_amount:
		'[data-column-key="discount_amount"] .posa-cart-table__editor-display',
	posa_is_offer: '[data-column-key="posa_is_offer"] button',
	actions: '[data-column-key="actions"] button',
	"data-table-expand": '[data-column-key="data-table-expand"] button',
};

export const CART_GRID_NAVIGABLE_COLUMNS: CartGridColumnKey[] = [
	"item_name",
	"qty",
	"uom",
	"price_list_rate",
	"discount_percentage",
	"discount_amount",
	"rate",
	"amount",
	"posa_is_offer",
	"actions",
	"data-table-expand",
];

export const CART_GRID_DIRECT_EDIT_COLUMNS: CartGridColumnKey[] = [
	"qty",
	"uom",
	"discount_percentage",
	"discount_amount",
	"rate",
];

const NAVIGABLE_COLUMN_SET = new Set<string>(CART_GRID_NAVIGABLE_COLUMNS);
const DIRECT_EDIT_COLUMN_SET = new Set<string>(CART_GRID_DIRECT_EDIT_COLUMNS);

export const isCartGridColumnKey = (key: unknown): key is CartGridColumnKey =>
	typeof key === "string" && NAVIGABLE_COLUMN_SET.has(key);

export const isCartGridDirectEditColumnKey = (
	key: unknown,
): key is CartGridColumnKey =>
	typeof key === "string" && DIRECT_EDIT_COLUMN_SET.has(key);

export const shouldDelegateCartGridKeyToEditor = (
	target: EventTarget | null,
	key: string,
	modifiers: { shiftKey?: boolean } = {},
) =>
	target instanceof Element &&
	Boolean(target.closest(".uom-select")) &&
	!(key === "Enter" && modifiers.shiftKey) &&
	["ArrowDown", "ArrowUp", "Enter", " ", "Escape"].includes(key);

export const resolveCounterGridKeyboardCommand = (
	event: Pick<
		KeyboardEvent,
		"key" | "shiftKey" | "ctrlKey" | "metaKey" | "altKey"
	>,
	options: {
		mode: "inactive" | "row" | "cell";
		directEditCell?: boolean;
	},
): CounterGridKeyboardCommand | null => {
	if (options.mode === "inactive" || event.altKey) {
		return null;
	}

	if (
		options.mode === "cell" &&
		options.directEditCell &&
		event.key === "Enter" &&
		event.shiftKey &&
		!event.ctrlKey &&
		!event.metaKey
	) {
		return { type: "move-entry", delta: -1 };
	}

	if (event.key !== "Home" && event.key !== "End") {
		return null;
	}

	const isDocumentBoundary = event.ctrlKey || event.metaKey;
	return {
		type: "move-boundary",
		row: isDocumentBoundary
			? event.key === "Home"
				? "first"
				: "last"
			: "current",
		column: event.key === "Home" ? "first" : "last",
	};
};

export const getCartGridRowId = (rowIndex: number) =>
	`posa-cart-grid-row-${rowIndex}`;

export const getCartGridCellId = (rowIndex: number, columnKey: string) =>
	`posa-cart-grid-cell-${rowIndex}-${columnKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

const isDisabled = (element: HTMLElement | null | undefined) =>
	Boolean(
		element &&
			(element.hasAttribute("disabled") ||
				element.getAttribute("aria-disabled") === "true" ||
				element.classList.contains("v-btn--disabled") ||
				element.closest("[disabled], [aria-disabled='true']")),
	);

export const getNavigableCartColumnKeys = (
	columns: Array<{ key?: unknown }> | null | undefined,
) => {
	if (!Array.isArray(columns)) {
		return [];
	}

	return columns.map((column) => column?.key).filter(isCartGridColumnKey);
};

export const getAdjacentCartGridColumnKey = (
	keys: CartGridColumnKey[],
	currentKey: CartGridColumnKey | null | undefined,
	delta: number,
) => {
	if (!keys.length || delta === 0) return null;
	const currentIndex = currentKey ? keys.indexOf(currentKey) : -1;
	const nextIndex =
		currentIndex < 0
			? delta > 0
				? 0
				: keys.length - 1
			: currentIndex + delta;
	return nextIndex >= 0 && nextIndex < keys.length
		? (keys[nextIndex] ?? null)
		: null;
};

export const getCartGridRow = (
	container: ParentNode | null | undefined,
	rowIndex: number,
) => {
	if (!container || rowIndex < 0) {
		return null;
	}

	const byIndex = container.querySelector?.(
		`.posa-cart-item-row[data-cart-row-index="${rowIndex}"]`,
	) as HTMLElement | null;
	if (byIndex) {
		return byIndex;
	}

	const rows = container.querySelectorAll?.(".posa-cart-item-row");
	return (rows?.[rowIndex] as HTMLElement | undefined) || null;
};

export async function ensureCartGridRowRendered(
	container: ParentNode | null | undefined,
	rowIndex: number,
	scrollToIndex: ((index: number) => void) | null | undefined,
	waitForRender: () => Promise<void>,
) {
	if (getCartGridRow(container, rowIndex)) return true;
	scrollToIndex?.(rowIndex);
	await waitForRender();
	return Boolean(getCartGridRow(container, rowIndex));
}

export const getCartGridCellTarget = (
	container: ParentNode | null | undefined,
	rowIndex: number,
	field: CartGridColumnKey,
) => {
	const row = getCartGridRow(container, rowIndex);
	if (!row) {
		return null;
	}

	const target = row.querySelector(
		FIELD_SELECTORS[field],
	) as HTMLElement | null;
	return target && !isDisabled(target) ? target : null;
};

export const focusCartGridRow = (
	container: ParentNode | null | undefined,
	rowIndex: number,
) => {
	const row = getCartGridRow(container, rowIndex);
	if (!row) {
		return false;
	}

	row.scrollIntoView?.({ block: "nearest", inline: "nearest" });
	row.focus?.();
	return true;
};

export const focusCartGridCell = (
	container: ParentNode | null | undefined,
	rowIndex: number,
	field: CartGridColumnKey,
	options: CartFieldFocusOptions = {},
) => {
	const target = getCartGridCellTarget(container, rowIndex, field);
	if (!target) {
		return false;
	}

	target.scrollIntoView?.({ block: "nearest", inline: "nearest" });
	target.focus?.();
	if (options.activate === true) {
		target.click?.();
	}
	return true;
};

export const activateCartGridCell = (
	container: ParentNode | null | undefined,
	rowIndex: number,
	field: CartGridColumnKey,
) => focusCartGridCell(container, rowIndex, field, { activate: true });

export const focusCartItemField = (
	container: ParentNode | null | undefined,
	rowIndex: number,
	field: CartShortcutField,
	options: CartFieldFocusOptions = {},
) => {
	return focusCartGridCell(container, rowIndex, field, {
		activate: options.activate !== false,
	});
};
