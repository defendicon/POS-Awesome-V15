import { computed } from "vue";

import { usePosCheckoutStore } from "../../checkout/domain/posCheckoutStore";

export function usePaymentRouteCheckoutState() {
	const checkout = usePosCheckoutStore();

	return {
		checkoutStage: computed(() => checkout.state.value.stage),
	};
}
