import type { Ref } from "vue";

type UseItemsSelectorPriceListSyncArgs = {
	activePriceList: Ref<unknown>;
	getDefaultPriceList: () => unknown;
	updatePriceList: (priceList: string) => Promise<unknown> | unknown;
	refreshVisibleItemRates?: (priceList: string) => Promise<unknown> | unknown;
};

const normalizePriceList = (priceList: unknown) =>
	typeof priceList === "string" ? priceList.trim() : "";

export function useItemsSelectorPriceListSync({
	activePriceList,
	getDefaultPriceList,
	updatePriceList,
	refreshVisibleItemRates,
}: UseItemsSelectorPriceListSyncArgs) {
	const resolveIncomingPriceList = (incomingPriceList: unknown) => {
		const normalized = normalizePriceList(incomingPriceList);
		if (normalized) {
			return normalized;
		}
		return normalizePriceList(getDefaultPriceList());
	};

	const syncSelectorPriceList = async (incomingPriceList: unknown) => {
		const nextPriceList = resolveIncomingPriceList(incomingPriceList);
		if (!nextPriceList) {
			return;
		}

		const priceListChanged = activePriceList.value !== nextPriceList;
		if (priceListChanged) {
			await updatePriceList(nextPriceList);
			if (typeof refreshVisibleItemRates === "function") {
				await refreshVisibleItemRates(nextPriceList);
			}
		}
	};

	return {
		resolveIncomingPriceList,
		syncSelectorPriceList,
	};
}
