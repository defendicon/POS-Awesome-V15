type PaymentRouteReadinessInput = {
	customersLoaded: boolean;
	loadingCustomers: boolean;
	isCustomerBackgroundLoading: boolean;
};

export function isPaymentRouteLocked({
	customersLoaded,
	loadingCustomers,
	isCustomerBackgroundLoading,
}: PaymentRouteReadinessInput): boolean {
	return Boolean(
		loadingCustomers ||
			!customersLoaded,
	);
}

export function buildPaymentRouteLoadingMessage(
	loadProgress: number | null | undefined,
): string {
	const normalizedProgress =
		typeof loadProgress === "number" && Number.isFinite(loadProgress)
			? Math.max(0, Math.min(100, Math.round(loadProgress)))
			: null;

	if (normalizedProgress === null) {
		return "Preparing payments. Customer data is still loading.";
	}

	return `Preparing payments. Customer data is still loading (${normalizedProgress}%).`;
}
