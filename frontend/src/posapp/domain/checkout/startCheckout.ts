import { createPosCheckoutBlocker } from "./checkoutDiagnostics";
import { loadCheckoutCustomerData } from "./loadCheckoutCustomerData";
import type { CheckoutStageLoadResult } from "./loadCheckoutCustomerData";
import { loadCheckoutOffers } from "./loadCheckoutOffers";
import { loadCheckoutPayments } from "./loadCheckoutPayments";
import { loadCheckoutPricing } from "./loadCheckoutPricing";
import { createPosCheckoutStore } from "./posCheckoutStore";

type PosCheckoutStore = ReturnType<typeof createPosCheckoutStore>;

type StartCheckoutOptions = {
	checkout?: PosCheckoutStore;
	loadCheckoutCustomerData?:
		| (() => Promise<CheckoutStageLoadResult>)
		| (() => CheckoutStageLoadResult);
	loadCheckoutPricing?:
		| (() => Promise<CheckoutStageLoadResult>)
		| (() => CheckoutStageLoadResult);
	loadCheckoutOffers?:
		| (() => Promise<CheckoutStageLoadResult>)
		| (() => CheckoutStageLoadResult);
	loadCheckoutPayments?:
		| (() => Promise<CheckoutStageLoadResult>)
		| (() => CheckoutStageLoadResult);
};

function getErrorSummary(error: unknown, fallback: string) {
	return error instanceof Error && error.message ? error.message : fallback;
}

export async function startCheckout(options: StartCheckoutOptions = {}) {
	const checkout = options.checkout ?? createPosCheckoutStore();
	const runCustomerLoad =
		options.loadCheckoutCustomerData ?? loadCheckoutCustomerData;
	const runPricingLoad = options.loadCheckoutPricing ?? loadCheckoutPricing;
	const runOffersLoad = options.loadCheckoutOffers ?? loadCheckoutOffers;
	const runPaymentsLoad = options.loadCheckoutPayments ?? loadCheckoutPayments;

	try {
		checkout.markStarting();

		checkout.markStage("loading-customer");
		const customerResult = await Promise.resolve(runCustomerLoad());
		checkout.setSource("customer", customerResult?.source ?? "unknown");

		checkout.markStage("loading-pricing");
		const pricingResult = await Promise.resolve(runPricingLoad());
		checkout.setSource("pricing", pricingResult?.source ?? "unknown");

		checkout.markStage("loading-offers");
		const offersResult = await Promise.resolve(runOffersLoad());
		checkout.setSource("offers", offersResult?.source ?? "unknown");

		checkout.markStage("loading-payments");
		const paymentsResult = await Promise.resolve(runPaymentsLoad());
		checkout.setSource("payments", paymentsResult?.source ?? "unknown");

		checkout.markReady();
		return checkout.state.value;
	} catch (error) {
		const currentStage = checkout.state.value.stage;
		const blockerCode =
			currentStage === "loading-customer"
				? "customer_load_failed"
				: currentStage === "loading-pricing"
					? "pricing_failed"
					: currentStage === "loading-offers"
						? "offers_failed"
						: currentStage === "loading-payments"
							? "payments_failed"
							: "checkout_failed";
		checkout.blockCheckout(
			createPosCheckoutBlocker(
				blockerCode,
				getErrorSummary(error, "Checkout did not finish loading."),
			),
		);
		return checkout.state.value;
	}
}
