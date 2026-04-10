import type { createPosCheckoutStore } from "./posCheckoutStore";

type PosCheckoutStore = ReturnType<typeof createPosCheckoutStore>;

export function resetCheckout(checkout: PosCheckoutStore) {
	checkout.resetCheckout();
	return checkout.state.value;
}
