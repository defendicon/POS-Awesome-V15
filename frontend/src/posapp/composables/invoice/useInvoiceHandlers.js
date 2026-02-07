import { ref } from "vue";

export function useInvoiceHandlers(
	pos_profile,
	company,
	customer,
	pos_opening_shift,
	stock_settings,
	invoiceType,
	fetch_price_lists,
	update_price_list,
	fetch_available_currencies,
	load_invoice,
	items,
	invoice_doc,
	discount_amount,
	additional_discount,
	return_doc,
	additional_discount_percentage,
	update_item_detail,
	primeInvoiceStockState,
) {
	const handleRegisterPosProfile = (data) => {
		pos_profile.value = data.pos_profile;
		company.value = data.company || null;
		customer.value = data.pos_profile.customer;
		pos_opening_shift.value = data.pos_opening_shift;
		stock_settings.value = data.stock_settings;

		invoiceType.value = pos_profile.value.posa_default_sales_order ? "Order" : "Invoice";

		// Pricing list initialization
		fetch_price_lists();
		update_price_list();
		fetch_available_currencies();
	};

	const handleSetAllItems = (data) => {
		// Assuming allItems logic is handled elsewhere or not critical
		// items.value = data; // Wait, items is a computed setter in original component usually
		// But here we need to iterate over existing items to update details
		items.value.forEach((item) => {
			if (item._detailSynced !== true) {
				update_item_detail(item);
			}
		});
		primeInvoiceStockState();
	};

	const handleLoadReturnInvoice = (data) => {
		console.log("Invoice component received load_return_invoice event with data:", data);
		load_invoice(data.invoice_doc);
		invoiceType.value = "Return";
		invoice_doc.value.is_return = 1;
		if (items.value && items.value.length) {
			items.value.forEach((item) => {
				if (item.qty > 0) item.qty = -Math.abs(item.qty);
				if (item.stock_qty > 0) item.stock_qty = -Math.abs(item.stock_qty);
			});
		}
		if (data.return_doc) {
			console.log("Return against existing invoice:", data.return_doc.name);
			discount_amount.value = data.return_doc.discount_amount || 0;
			additional_discount.value = data.return_doc.discount_amount || 0;
			return_doc.value = data.return_doc;
			invoice_doc.value.return_against = data.return_doc.name;
		} else {
			console.log("Return without invoice reference");
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
