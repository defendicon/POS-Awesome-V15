import { ref, watch, type Ref } from "vue";
import { applyRowOrder, reorderRows } from "../../../utils/rowOrder";

export function useSelectorRowOrder(scope: Ref<string>) {
	const order = ref<string[]>([]);
	const error = ref("");
	const keyOf = (item: any) => String(item?.item_code || "");
	watch(
		scope,
		() => {
			order.value = [];
			error.value = "";
			if (!scope.value) return;
			try {
				const saved = JSON.parse(
					localStorage.getItem(scope.value) || "null",
				);
				if (Array.isArray(saved))
					order.value = [
						...new Set(
							saved.filter(
								(key): key is string =>
									typeof key === "string" && !!key,
							),
						),
					].slice(0, 10000);
			} catch (cause) {
				console.warn("Unable to load selector row order", cause);
				error.value = "Saved item order could not be loaded.";
			}
		},
		{ immediate: true },
	);
	function save() {
		if (!scope.value) return;
		try {
			localStorage.setItem(scope.value, JSON.stringify(order.value));
			error.value = "";
		} catch (cause) {
			console.warn("Unable to save selector row order", cause);
			error.value =
				"Item order could not be saved. Changes last for this session only.";
		}
	}
	function move(
		rows: any[],
		source: string,
		target: string,
		after: boolean,
		visibleKeys: string[],
	) {
		const moved = reorderRows(
			rows,
			keyOf,
			source,
			target,
			after,
			visibleKeys,
		);
		if (!moved) return;
		const keys = moved.map(keyOf);
		const shown = new Set(keys);
		order.value = [
			...keys,
			...order.value.filter((key) => !shown.has(key)),
		].slice(0, 10000);
		save();
	}
	function reset() {
		order.value = [];
		save();
	}
	return {
		apply: <T>(rows: T[]) => applyRowOrder(rows, order.value, keyOf),
		move,
		reset,
		error,
		order,
	};
}
