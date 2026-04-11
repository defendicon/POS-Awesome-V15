type ItemSelectionLike = {
	highlightedIndex?: { value: number };
	isItemHighlighted?: (_candidate: unknown) => boolean;
	getItemRowProps?: (_item: unknown) => Record<string, unknown>;
};

export const createItemHighlightMatcher = (itemSelection: ItemSelectionLike) => {
	return (candidate: unknown) => {
		if (typeof candidate === "number") {
			return itemSelection?.highlightedIndex?.value === candidate;
		}
		return itemSelection?.isItemHighlighted?.(candidate) || false;
	};
};

export const buildSelectorRowProps = (
	itemSelection: ItemSelectionLike,
	item: Record<string, unknown> | null | undefined,
) => {
	const highlightProps = itemSelection?.getItemRowProps?.(item) || {};
	return {
		...highlightProps,
		"data-item-code": item?.item_code || "",
		draggable: true,
	};
};
