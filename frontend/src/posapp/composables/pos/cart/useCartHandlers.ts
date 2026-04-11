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

	const handleSetAllItems = (_data: any) => {
		items.value.forEach((item: any) => {
			if (item._detailSynced !== true) {
				update_item_detail(item);
			}
		});
		primeInvoiceStockState();
	};

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
