import { computed, reactive } from "vue";

import {
	buildSelectorRowProps,
	createItemHighlightMatcher,
} from "../../../utils/itemSelectorHighlightBindings";

type ValueRef<T> = {
	value: T;
};

type Formatter = (...args: any[]) => unknown;

type ItemDisplayLike = {
	headers: ValueRef<unknown[]>;
	memoizedFormatCurrency: ValueRef<Formatter>;
	memoizedFormatNumber: ValueRef<Formatter>;
	ratePrecision: Formatter;
	format_currency: Formatter;
	format_number: Formatter;
	currencySymbol: Formatter;
};

type ItemSelectionLike = {
	highlightedIndex?: ValueRef<number>;
	isItemHighlighted?: (_candidate: unknown) => boolean;
	getItemRowClass?: (_item: unknown) => unknown;
	getItemRowProps?: (_item: unknown) => Record<string, unknown>;
};

type UseItemsSelectorDisplayBindingsArgs = {
	itemDisplay: ItemDisplayLike;
	itemSelection: ItemSelectionLike;
};

export function useItemsSelectorDisplayBindings({
	itemDisplay,
	itemSelection,
}: UseItemsSelectorDisplayBindingsArgs) {
	const headerProps = reactive({
		"sort-icon": "mdi-arrow-up",
		class: "pos-table-header",
	});

	const headers = computed(() => itemDisplay.headers.value);
	const memoizedFormatCurrency = computed(
		() => itemDisplay.memoizedFormatCurrency.value,
	);
	const memoizedFormatNumber = computed(() => itemDisplay.memoizedFormatNumber.value);
	const isItemHighlighted = createItemHighlightMatcher(itemSelection);
	const isNegative = (val: any) => val < 0;
	const getItemRowClass = (item: unknown) =>
		itemSelection.getItemRowClass?.(item);
	const getItemRowProps = (item: Record<string, unknown> | null | undefined) =>
		buildSelectorRowProps(itemSelection, item);

	return {
		ratePrecision: itemDisplay.ratePrecision,
		format_currency: itemDisplay.format_currency,
		format_number: itemDisplay.format_number,
		currencySymbol: itemDisplay.currencySymbol,
		headers,
		memoizedFormatCurrency,
		memoizedFormatNumber,
		isItemHighlighted,
		isNegative,
		headerProps,
		getItemRowClass,
		getItemRowProps,
	};
}
