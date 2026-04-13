import type { PosCheckoutSource } from "./posCheckoutTypes";

export type CheckoutStageLoadResult = {
	source?: PosCheckoutSource;
};

export async function loadCheckoutCustomerData() {
	return {
		source: "unknown" as const,
	} satisfies CheckoutStageLoadResult;
}
