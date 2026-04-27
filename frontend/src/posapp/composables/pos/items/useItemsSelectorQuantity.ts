import { computed, ref, type Ref } from "vue";

type UseItemsSelectorQuantityArgs = {
	hideQtyDecimals: Ref<boolean>;
	initialQty?: number;
};

export function useItemsSelectorQuantity({
	hideQtyDecimals,
	initialQty = 1,
}: UseItemsSelectorQuantityArgs) {
	const qty = ref<number | null>(initialQty);

	const debounceQty = computed({
		get() {
			if (qty.value === null) return "";
			return hideQtyDecimals.value ? Math.round(qty.value) : qty.value;
		},
		set(value: unknown) {
			let parsed: number | null = parseFloat(String(value).replace(/,/g, ""));
			if (Number.isNaN(parsed)) parsed = null;
			if (hideQtyDecimals.value && parsed != null) parsed = Math.round(parsed);
			qty.value = parsed;
		},
	});

	const clearQty = () => {
		qty.value = null;
	};

	const onQtyBlur = () => {
		if (!qty.value || qty.value <= 0) {
			qty.value = 1;
		}
	};

	return {
		qty,
		debounceQty,
		clearQty,
		onQtyBlur,
	};
}
