import { computed, ref, watch, type Ref } from "vue";
import { applyRowOrder, reorderRows } from "../../utils/rowOrder";
import {
	registerCustomization,
	workspaceCustomization,
	type CustomizationSection,
} from "./workspaceCustomization";
import { useRowReorder } from "./useRowReorder";

type Header = {
	key: string;
	title?: string;
	headerProps?: Record<string, any>;
	[key: string]: any;
};

export function columnOrderStorageKey(
	profile: any,
	user: string,
	table: string,
): string {
	if (!profile?.name) return "";
	return `posawesome:column-order:v1:${JSON.stringify([user || window.frappe?.session?.user || "", profile.company || "", profile.name, profile.warehouse || "", table])}`;
}

/** Column visibility stays owned by the caller; this helper changes presentation order only. */
export function useColumnOrder<T extends Header>(
	root: Ref<HTMLElement | null>,
	available: Ref<T[]>,
	scope: Ref<string>,
	options: { section?: CustomizationSection; label?: string } = {},
) {
	const order = ref<string[]>([]);
	const error = ref("");
	const ordered = computed(() =>
		applyRowOrder(available.value, order.value, (header) => header.key),
	);
	const headers = computed(() =>
		ordered.value.map((header) => ({
			...header,
			headerProps: {
				...header.headerProps,
				"data-column-reorder-id": header.key,
			},
		})),
	);
	const hasOrder = computed(() => order.value.length > 0);
	function persist() {
		if (customization.defer()) return;
		if (!scope.value) return;
		try {
			localStorage.setItem(scope.value, JSON.stringify(order.value));
			error.value = "";
		} catch (cause) {
			console.warn("Unable to save column order", cause);
			error.value =
				"Column order could not be saved. Changes last for this session only.";
		}
	}
	function moveColumn(drop: {
		source: string;
		target: string;
		after: boolean;
		visibleKeys: string[];
	}) {
		const moved = reorderRows(
			ordered.value,
			(header) => header.key,
			drop.source,
			drop.target,
			drop.after,
			drop.visibleKeys,
		);
		if (!moved) return;
		const shown = new Set(moved.map((header) => header.key));
		// Remember positions of optional columns even while they are hidden.
		const queue = moved.map((header) => header.key);
		const previous = order.value;
		order.value = previous.map((key) =>
			shown.has(key) ? queue.shift()! : key,
		);
		order.value.push(...queue);
		persist();
	}
	const drag = useRowReorder(root, moveColumn, { axis: "horizontal" });
	watch(
		scope,
		() => {
			drag.cancel();
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
					].slice(0, 200);
			} catch (cause) {
				console.warn("Unable to load column order", cause);
				error.value =
					"Saved column order could not be loaded. Default order is in use.";
			}
		},
		{ immediate: true },
	);
	function reset() {
		drag.cancel();
		order.value = [];
		persist();
	}
	const customization = registerCustomization({
		section: options.section || "selector",
		label: options.label || "Item selector",
		kind: "order",
		scope,
		state: order,
		error,
		reset,
		stop: drag.cancel,
		entries: () =>
			ordered.value.map((header) => ({
				key: header.key,
				label: header.title || header.key,
			})),
		move: (key, direction) => {
			const index = ordered.value.findIndex(
				(header) => header.key === key,
			);
			const target = ordered.value[index + direction];
			if (target)
				moveColumn({
					source: key,
					target: target.key,
					after: direction > 0,
					visibleKeys: ordered.value.map((header) => header.key),
				});
		},
	});
	const editing = computed(() =>
		workspaceCustomization.isEditing(options.section || "selector"),
	);
	return { headers, ordered, error, hasOrder, reset, editing, ...drag };
}
