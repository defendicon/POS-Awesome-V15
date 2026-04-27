type ItemLike = {
	item_code?: unknown;
};

type BuildItemDetailsRequestIdentityArgs = {
	posProfileName?: string | null;
	activePriceList?: string | null;
	priceListOverride?: string | null;
	items: Array<ItemLike | null | undefined>;
};

export type ItemDetailsRequestIdentity = {
	effectivePriceList: string;
	key: string;
};

export function buildItemDetailsRequestIdentity({
	posProfileName,
	activePriceList,
	priceListOverride = null,
	items,
}: BuildItemDetailsRequestIdentityArgs): ItemDetailsRequestIdentity {
	const effectivePriceList =
		typeof priceListOverride === "string" &&
		priceListOverride.trim().length
			? priceListOverride.trim()
			: activePriceList || "";
	const itemCodes = Array.from(
		new Set(
			items
				.map((item) => item?.item_code)
				.filter(
					(code) =>
						code !== undefined && code !== null && code !== "",
				),
		),
	)
		.map((code) => String(code))
		.sort();

	return {
		effectivePriceList,
		key: [posProfileName || "", effectivePriceList, itemCodes.join(",")].join(
			":",
		),
	};
}
