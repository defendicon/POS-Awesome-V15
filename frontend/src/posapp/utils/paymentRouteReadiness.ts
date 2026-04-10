type PaymentRouteReadinessInput = {
	customersLoaded: boolean;
	loadingCustomers: boolean;
	isCustomerBackgroundLoading: boolean;
	checkoutStage?:
		| "idle"
		| "starting"
		| "loading-customer"
		| "loading-pricing"
		| "loading-offers"
		| "loading-payments"
		| "ready"
		| "blocked"
		| null;
};

export function isPaymentRouteLocked({
	customersLoaded,
	loadingCustomers,
	isCustomerBackgroundLoading,
	checkoutStage = null,
}: PaymentRouteReadinessInput): boolean {
	return Boolean(
		loadingCustomers ||
			isCustomerBackgroundLoading ||
			!customersLoaded ||
			(checkoutStage &&
				checkoutStage !== "ready" &&
				checkoutStage !== "blocked"),
	);
}

export function buildPaymentRouteLoadingMessage(
	loadProgress: number | null | undefined,
	checkoutStage:
		| "idle"
		| "starting"
		| "loading-customer"
		| "loading-pricing"
		| "loading-offers"
		| "loading-payments"
		| "ready"
		| "blocked"
		| null = null,
): string {
	if (checkoutStage === "loading-pricing") {
		return "Preparing payments. Checkout pricing is still loading.";
	}

	if (checkoutStage === "loading-offers") {
		return "Preparing payments. Checkout offers are still loading.";
	}

	if (checkoutStage === "loading-payments") {
		return "Preparing payments. Payment methods are still loading.";
	}

	const normalizedProgress =
		typeof loadProgress === "number" && Number.isFinite(loadProgress)
			? Math.max(0, Math.min(100, Math.round(loadProgress)))
			: null;

	if (normalizedProgress === null) {
		return "Preparing payments. Customer data is still loading.";
	}

	return `Preparing payments. Customer data is still loading (${normalizedProgress}%).`;
}
