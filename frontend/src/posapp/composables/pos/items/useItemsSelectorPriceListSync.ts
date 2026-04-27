import type { Ref } from "vue";

type UseItemsSelectorPriceListSyncArgs = {
	activePriceList: Ref<unknown>;
	getDefaultPriceList: () => unknown;
	updatePriceList: (priceList: string) => Promise<unknown> | unknown;
	getItems: (force: boolean) => Promise<unknown> | unknown;
};

const normalizePriceList = (priceList: unknown) =>
	typeof priceList === "string" ? priceList.trim() : "";

export function useItemsSelectorPriceListSync({
	activePriceList,
	getDefaultPriceList,
	updatePriceList,
	getItems,
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

		if (activePriceList.value !== nextPriceList) {
			await updatePriceList(nextPriceList);
		}

		await getItems(true);
	};

	return {
		resolveIncomingPriceList,
		syncSelectorPriceList,
	};
}
