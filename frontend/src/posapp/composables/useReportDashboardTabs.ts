export type DashboardTab =
	| "sales"
	| "staff"
	| "customers"
	| "finance"
	| "branches"
	| "products"
	| "inventory"
	| "procurement";

type Translator = (value: string) => string;

export function createDashboardTabItems(translate: Translator) {
	return [
		{ value: "sales", label: translate("Sales"), icon: "mdi-point-of-sale" },
		{ value: "staff", label: translate("Staff"), icon: "mdi-account-group-outline" },
		{ value: "customers", label: translate("Customers"), icon: "mdi-account-heart-outline" },
		{ value: "finance", label: translate("Finance"), icon: "mdi-finance" },
		{ value: "branches", label: translate("Branches"), icon: "mdi-storefront-outline" },
		{ value: "products", label: translate("Products"), icon: "mdi-package-variant-closed" },
		{ value: "inventory", label: translate("Inventory"), icon: "mdi-warehouse" },
		{ value: "procurement", label: translate("Procurement"), icon: "mdi-truck-delivery-outline" },
	] satisfies Array<{ value: DashboardTab; label: string; icon: string }>;
}
