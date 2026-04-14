const normalizeOfferRowId = (value: unknown) => String(value ?? "").trim();

const getOfferId = (offer: any) =>
	normalizeOfferRowId(offer?.row_id || offer?.name);

const shouldDefaultOfferApplied = (
	offer: Record<string, any>,
	discountPercentageOfferName: string | null,
) => {
	if (offer.coupon_based) {
		return true;
	}

	if (
		offer.apply_type == "Item Group" &&
		offer.offer == "Give Product" &&
		!offer.replace_cheapest_item &&
		!offer.replace_item
	) {
		return false;
	}

	if (offer.offer === "Grand Total" && discountPercentageOfferName) {
		return false;
	}

	return !!offer.auto;
};

export const mergeDisplayedOffers = (
	existingOffers: any[],
	incomingOffers: any[],
	options: {
		discountPercentageOfferName?: string | null;
		resolveDefaultGiveItem?: (_offer: Record<string, any>) => string | null | undefined;
	} = {},
) => {
	const discountPercentageOfferName =
		options.discountPercentageOfferName ?? null;
	const resolveDefaultGiveItem = options.resolveDefaultGiveItem;

	const normalizedIncoming = (Array.isArray(incomingOffers) ? incomingOffers : []).map(
		(offer) => {
			const nextOffer = { ...(offer || {}) };
			const rowId = getOfferId(nextOffer);
			if (rowId) {
				nextOffer.row_id = rowId;
			}
			return nextOffer;
		},
	);

	const mergedOffers = (Array.isArray(existingOffers) ? existingOffers : [])
		.filter((offer) =>
			normalizedIncoming.some((incomingOffer) => getOfferId(incomingOffer) === getOfferId(offer)),
		)
		.map((offer) => ({ ...(offer || {}) }));

	normalizedIncoming.forEach((offer) => {
		const rowId = getOfferId(offer);
		const existingIndex = mergedOffers.findIndex(
			(existingOffer) => getOfferId(existingOffer) === rowId,
		);

		if (existingIndex >= 0) {
			const existingOffer = mergedOffers[existingIndex];
			mergedOffers[existingIndex] = {
				...existingOffer,
				...offer,
				row_id: rowId,
				offer_applied: Boolean(
					offer.offer_applied ||
						existingOffer.offer_applied ||
						offer.coupon_based,
				),
				coupon:
					offer.coupon ??
					existingOffer.coupon ??
					null,
			};
			return;
		}

		const newOffer = {
			...offer,
			row_id: rowId,
		};

		if (offer.apply_type == "Item Code") {
			if (offer.replace_item) {
				newOffer.give_item = offer.item || offer.apply_item_code || null;
			} else {
				newOffer.give_item = offer.apply_item_code || null;
			}
		}

		if (offer.offer_applied) {
			newOffer.offer_applied = !!offer.offer_applied;
		} else {
			newOffer.offer_applied = shouldDefaultOfferApplied(
				newOffer,
				discountPercentageOfferName,
			);
		}

		if (newOffer.offer == "Give Product" && !newOffer.give_item && resolveDefaultGiveItem) {
			newOffer.give_item = resolveDefaultGiveItem(newOffer) || newOffer.give_item || null;
		}

		mergedOffers.push(newOffer);
	});

	return mergedOffers;
};
