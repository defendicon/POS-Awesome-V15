import { ref } from "vue";
import {
	findItemIndexByCode,
	getNextHighlightedIndex,
} from "../../../utils/itemHighlight.js";

type SelectableItem = {
	item_code?: string | null;
	raw?: SelectableItem;
	item?: SelectableItem;
	[key: string]: unknown;
};

type FlyConfig = Record<string, unknown>;

type ItemSelectionContext = {
	items: SelectableItem[];
	displayedItems: SelectableItem[];
	addItem: ((_item: SelectableItem) => Promise<void> | void) | null;
	clearSearch: (() => void) | null;
	focusItemSearch: (() => void) | null;
	fly:
		| ((_source: Element, _target: Element, _config?: FlyConfig) => void)
		| null;
	flyConfig: FlyConfig | undefined;
	items_view: "card" | "list";
};

/**
 * useItemSelection
 *
 * Manages item list navigation (highlighting), selection via keyboard/mouse,
 * and interaction with the item list (e.g. clicking rows).
 */
export function useItemSelection() {
	// State
	const highlightedIndex = ref(-1);
	const highlightedItemCode = ref<string | null>(null);

	// Context (Late Binding)
	const ctx: ItemSelectionContext = {
		items: [], // Access to full items list (if needed)
		displayedItems: [], // The filtered/visible items
		addItem: null, // Method to add item to cart
		clearSearch: null,
		focusItemSearch: null,
		fly: null, // For animation
		flyConfig: undefined,
		items_view: "card", // "card" or "list"
	};

	function registerContext(context: Partial<ItemSelectionContext>) {
		if (!context || typeof context !== "object") {
			return;
		}

		Object.defineProperties(
			ctx,
			Object.getOwnPropertyDescriptors(context),
		);
	}

	// --- Highlighting Logic ---

	function clearHighlightedItem() {
		highlightedIndex.value = -1;
		highlightedItemCode.value = null;
	}

	function syncHighlightedItem() {
		if (
			!Array.isArray(ctx.displayedItems) ||
			ctx.displayedItems.length === 0
		) {
			clearHighlightedItem();
			return;
		}

		if (highlightedItemCode.value) {
			const index = findItemIndexByCode(
				ctx.displayedItems,
				highlightedItemCode.value,
			);
			if (index >= 0) {
				highlightedIndex.value = index;
				return;
			}
		}

		clearHighlightedItem();
	}

	function navigateHighlightedItem(direction: number) {
		if (
			!Array.isArray(ctx.displayedItems) ||
			ctx.displayedItems.length === 0
		) {
			clearHighlightedItem();
			return;
		}

		const nextIndex = getNextHighlightedIndex({
			currentIndex: highlightedIndex.value,
			itemsLength: ctx.displayedItems.length,
			direction,
		});

		if (nextIndex < 0) {
			clearHighlightedItem();
			return;
		}

		const nextItem = ctx.displayedItems[nextIndex];
		if (!nextItem) {
			clearHighlightedItem();
			return;
		}

		highlightedIndex.value = nextIndex;
		highlightedItemCode.value = nextItem.item_code || null;
		// Scroll logic is watcher-driven in the component
	}

	function resolveHighlightedItem(item: unknown): SelectableItem | unknown {
		if (!item || typeof item !== "object") {
			return item;
		}
		const asItem = item as SelectableItem;
		if (asItem.raw) return asItem.raw;
		if (asItem.item) return asItem.item.raw || asItem.item;
		return item;
	}

	function isItemHighlighted(item: unknown) {
		const resolvedItem = resolveHighlightedItem(item);
		if (!resolvedItem || !highlightedItemCode.value) {
			return false;
		}
		return (
			(resolvedItem as SelectableItem).item_code ===
			highlightedItemCode.value
		);
	}

	function getItemRowClass(item: unknown) {
		return isItemHighlighted(item) ? "item-row-highlighted" : "";
	}

	function getItemRowProps(item: unknown) {
		return isItemHighlighted(item) ? { class: "item-row-highlighted" } : {};
	}

	// --- Selection Logic ---

	async function selectHighlightedItem() {
		if (
			!Array.isArray(ctx.displayedItems) ||
			ctx.displayedItems.length === 0
		) {
			return;
		}

		const index = highlightedIndex.value;
		if (index < 0 || index >= ctx.displayedItems.length) {
			return;
		}

		const item = ctx.displayedItems[index];
		if (!item) {
			return;
		}

		if (ctx.addItem) {
			await ctx.addItem(item);
		}

		clearHighlightedItem();
		if (ctx.clearSearch) ctx.clearSearch();
		if (ctx.focusItemSearch) ctx.focusItemSearch();
	}

	function selectTopItem() {
		if (!ctx.displayedItems || !ctx.displayedItems.length) {
			return;
		}
		const firstItem = ctx.displayedItems[0];
		if (!firstItem) {
			return;
		}
		if (ctx.addItem) {
			ctx.addItem(firstItem);
		}
	}

	// --- Mouse Interaction ---

	function triggerFlyAnimation(event: MouseEvent, isRow = false) {
		if (!ctx.fly) return;

		const targets = document.querySelectorAll(".items-table-container");
		const target = targets[targets.length - 1]; // The Cart table container

		if (!target) return;

		let source: Element | null | undefined;
		if (isRow) {
			// For row click, we create a placeholder
			const placeholder = document.createElement("div");
			placeholder.className = "item-fly-placeholder";
			placeholder.style.width = "40px";
			placeholder.style.height = "40px";
			placeholder.style.borderRadius = "50%";
			placeholder.style.position = "fixed";
			placeholder.style.top = `${event.clientY - 20}px`;
			placeholder.style.left = `${event.clientX - 20}px`;
			document.body.appendChild(placeholder);

			ctx.fly(placeholder, target, ctx.flyConfig);

			// Cleanup placeholder after animation starts?
			// The original code does `placeholder.remove()` immediately?
			// "this.fly(placeholder, target, this.flyConfig); placeholder.remove();"
			// Wait, if removed immediately, does it animate?
			// `useFlyAnimation` likely clones it or uses it as start pos.
			// Let's assume original code works.
			placeholder.remove();
		} else {
			// For card click
			const currentTarget = event.currentTarget as Element | null;
			source =
				currentTarget?.querySelector?.(".card-item-image") ||
				currentTarget;
			if (source) {
				ctx.fly(source, target, ctx.flyConfig);
			}
		}
	}

	function handleItemSelection(event: MouseEvent, item: SelectableItem) {
		triggerFlyAnimation(event, false);
		if (ctx.addItem) ctx.addItem(item);
	}

	async function handleRowClick(
		event: MouseEvent,
		{ item }: { item: SelectableItem },
	) {
		triggerFlyAnimation(event, true);
		if (ctx.addItem) await ctx.addItem(item);
	}

	function handleSearchKeydown(event: KeyboardEvent) {
		if (!event) return;
		const key = event.key || "";

		if (key === "ArrowDown") {
			event.preventDefault();
			navigateHighlightedItem(1);
			return true; // handled
		}

		if (key === "ArrowUp") {
			event.preventDefault();
			navigateHighlightedItem(-1);
			return true; // handled
		}

		return false; // not handled
	}

	return {
		highlightedIndex,
		highlightedItemCode,
		registerContext,
		clearHighlightedItem,
		syncHighlightedItem,
		navigateHighlightedItem,
		selectHighlightedItem,
		isItemHighlighted,
		getItemRowClass,
		getItemRowProps,
		selectTopItem,
		handleItemSelection,
		handleRowClick,
		handleSearchKeydown,
	};
}
