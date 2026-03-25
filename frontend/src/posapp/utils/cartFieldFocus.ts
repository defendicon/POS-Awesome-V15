export type CartShortcutField = "qty" | "uom" | "rate";

const FIELD_SELECTORS: Record<CartShortcutField, string> = {
	qty: '[data-column-key="qty"] .posa-cart-table__qty-display',
	uom: '[data-column-key="uom"] .posa-cart-table__editor-display',
	rate: '[data-column-key="rate"] .posa-cart-table__editor-display',
};

export const focusCartItemField = (
	container: ParentNode | null | undefined,
	rowIndex: number,
	field: CartShortcutField,
) => {
	if (!container || rowIndex < 0) {
		return false;
	}

	const rows = container.querySelectorAll?.(".posa-cart-item-row");
	const row = rows?.[rowIndex] as HTMLElement | undefined;
	if (!row) {
		return false;
	}

	row.scrollIntoView?.({ block: "nearest" });

	const activator = row.querySelector(FIELD_SELECTORS[field]) as HTMLElement | null;
	if (!activator) {
		return false;
	}

	activator.focus?.();
	activator.click?.();
	return true;
};
