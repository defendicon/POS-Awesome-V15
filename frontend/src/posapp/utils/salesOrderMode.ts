import { parseBooleanSetting } from "./stock";

export function shouldCreateSalesOrder(
	invoiceType: string,
	posProfile: Record<string, any> | null | undefined,
) {
	if (invoiceType !== "Order") {
		return false;
	}

	return (
		parseBooleanSetting(posProfile?.posa_allow_sales_order) ||
		parseBooleanSetting(posProfile?.posa_create_only_sales_order)
	);
}
