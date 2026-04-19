/**
 * Provides three invoice-level event handlers that coordinate reactive refs and
 * callbacks injected by the parent component.
 *
 * This composable owns no state of its own. It acts as a thin wiring layer that
 * connects raw event payloads (from the POS page or socket events) to the correct
 * sequence of store mutations and callback invocations:
 *
 * - **`handleRegisterPosProfile`** — populates all session-level refs from the
 *   register-data API response, then triggers price-list and currency loading.
 * - **`handleSetAllItems`** — called after the cart is fully populated (e.g. loading a
 *   saved invoice); ensures item details are fetched for un-synced items, then primes
 *   stock state.
 * - **`handleLoadReturnInvoice`** — loads the return invoice, negates all item
 *   quantities, links `return_against`, and applies a prorated discount from the
 *   original invoice (fixed-amount discount mode only; percentage mode skips proration).
 *
 * All mutable state is passed in as refs; mutations inside these handlers propagate
 * reactively to any component reading those refs.
 */
export function useInvoiceHandlers(
	pos_profile: any,
	company: any,
	customer: any,
	pos_opening_shift: any,
	stock_settings: any,
	invoiceType: any,
	fetch_price_lists: () => void,
	update_price_list: () => void,
	fetch_available_currencies: () => void,
	load_invoice: (_data: any) => void,
	items: any,
	invoice_doc: any,
	discount_amount: any,
	additional_discount: any,
	return_doc: any,
	additional_discount_percentage: any,
	update_item_detail: (_item: any) => void,
	primeInvoiceStockState: () => void,
) {
	/**
	 * Prorates `returnDoc.discount_amount` proportionally to the fraction of the
	 * original invoice total that is being returned.
	 *
	 * Formula: `prorated = |originalDiscount| × min(1, returnTotal / originalTotal)`.
	 * Returns a **negative** value so the discount reduces the return amount, or `0`
	 * when `returnDoc` is absent, the original discount is zero, or the return total is zero.
	 *
	 * Only invoked when `pos_profile.posa_use_percentage_discount` is falsy. In
	 * percentage-discount mode, the percentage is preserved directly without proration.
	 */
	const calcProratedReturnDiscount = (returnDoc: any, itemList: any[]) => {
		if (!returnDoc) return 0;

		const originalDiscount = Math.abs(
			Number(returnDoc.discount_amount || 0),
		);
		if (!originalDiscount) return 0;

		const originalTotal = Math.abs(
			Number(
				returnDoc.total ??
					returnDoc.net_total ??
					returnDoc.grand_total ??
					0,
			),
		);
		if (!originalTotal) return 0;

		const returnTotal = Array.isArray(itemList)
			? itemList.reduce((sum: number, item: any) => {
					const qty = Math.abs(Number(item?.qty || 0));
					const rate = Number(item?.rate || 0);
					return sum + qty * rate;
				}, 0)
			: 0;

		if (!returnTotal) return 0;

		const ratio = Math.min(1, returnTotal / originalTotal);
		const prorated = originalDiscount * ratio;
		return -Math.abs(prorated);
	};

	/**
	 * Populates all session-level reactive refs from the register-data API response.
	 *
	 * Sets `invoiceType` to `"Order"` when `posa_default_sales_order` is enabled on the
	 * profile, otherwise `"Invoice"`. Then triggers price-list and currency loading via
	 * the injected callbacks.
	 *
	 * @param data - Response payload from the register-data API call. Expected to contain
	 *   `pos_profile`, `company`, `pos_opening_shift`, and `stock_settings`.
	 */
	const handleRegisterPosProfile = (data: any) => {
		pos_profile.value = data.pos_profile;
		company.value = data.company || null;
		customer.value = data.pos_profile.customer;
		pos_opening_shift.value = data.pos_opening_shift;
		stock_settings.value = data.stock_settings;

		invoiceType.value = pos_profile.value.posa_default_sales_order
			? "Order"
			: "Invoice";

		fetch_price_lists();
		update_price_list();
		fetch_available_currencies();
	};

	/**
	 * Called after the cart items list is fully populated (e.g. when loading a saved invoice).
	 *
	 * Iterates all current items and calls `update_item_detail` for each item whose
	 * `_detailSynced` flag is not `true`. Then calls `primeInvoiceStockState` to initialise
	 * stock-availability data for the loaded invoice.
	 *
	 * @param _data - Unused; present for interface consistency with other event handlers.
	 */
	const handleSetAllItems = (_data: any) => {
		items.value.forEach((item: any) => {
			if (item._detailSynced !== true) {
				update_item_detail(item);
			}
		});
		primeInvoiceStockState();
	};

	/**
	 * Loads a return invoice into the active session.
	 *
	 * Steps performed in order:
	 * 1. Calls `load_invoice` with `data.invoice_doc`.
	 * 2. Sets `invoiceType` to `"Return"` and marks `invoice_doc.is_return = 1`.
	 * 3. Negates any positive `qty` and `stock_qty` values on all cart items.
	 * 4. When `data.return_doc` is present:
	 *    - Stores it in `return_doc` and sets `invoice_doc.return_against`.
	 *    - In fixed-discount mode (`posa_use_percentage_discount` falsy): applies a
	 *      prorated discount via `calcProratedReturnDiscount`.
	 * 5. When `data.return_doc` is absent: clears all discount fields to zero.
	 *
	 * @param data - Must contain `invoice_doc`. Optionally contains `return_doc`
	 *   (the original invoice document being returned against).
	 */
	const handleLoadReturnInvoice = (data: any) => {
		load_invoice(data.invoice_doc);
		invoiceType.value = "Return";
		invoice_doc.value.is_return = 1;
		if (items.value && items.value.length) {
			items.value.forEach((item: any) => {
				if (item.qty > 0) item.qty = -Math.abs(item.qty);
				if (item.stock_qty > 0)
					item.stock_qty = -Math.abs(item.stock_qty);
			});
		}
		if (data.return_doc) {
			return_doc.value = data.return_doc;
			invoice_doc.value.return_against = data.return_doc.name;

			if (!pos_profile.value?.posa_use_percentage_discount) {
				const prorated = calcProratedReturnDiscount(
					data.return_doc,
					items.value,
				);
				discount_amount.value = prorated;
				additional_discount.value = prorated;
				additional_discount_percentage.value = 0;
			}
		} else {
			discount_amount.value = 0;
			additional_discount.value = 0;
			additional_discount_percentage.value = 0;
		}
	};

	return {
		handleRegisterPosProfile,
		handleSetAllItems,
		handleLoadReturnInvoice,
	};
}
