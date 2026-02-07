import { ref } from "vue";
import { findItemIndexByCode, getNextHighlightedIndex } from "../utils/itemHighlight.js";

/**
 * useItemSelection
 *
 * Manages item list navigation (highlighting), selection via keyboard/mouse,
 * and interaction with the item list (e.g. clicking rows).
 */
export function useItemSelection() {
	// State
	const highlightedIndex = ref(-1);
	const highlightedItemCode = ref(null);

	// Context (Late Binding)
	const ctx = {
		items: [], // Access to full items list (if needed)
		displayedItems: [], // The filtered/visible items
		addItem: null, // Method to add item to cart
		clearSearch: null,
		focusItemSearch: null,
		fly: null, // For animation
		flyConfig: null,
		items_view: "card", // "card" or "list"
	};

	function registerContext(context) {
		Object.assign(ctx, context);
	}

	// --- Highlighting Logic ---

	function clearHighlightedItem() {
		highlightedIndex.value = -1;
		highlightedItemCode.value = null;
	}

	function syncHighlightedItem() {
		if (!Array.isArray(ctx.displayedItems) || ctx.displayedItems.length === 0) {
			clearHighlightedItem();
			return;
		}

		if (highlightedItemCode.value) {
			const index = findItemIndexByCode(ctx.displayedItems, highlightedItemCode.value);
			if (index >= 0) {
				highlightedIndex.value = index;
				return;
			}
		}

		clearHighlightedItem();
	}

	function navigateHighlightedItem(direction) {
		if (!Array.isArray(ctx.displayedItems) || ctx.displayedItems.length === 0) {
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

	function resolveHighlightedItem(item) {
		if (!item || typeof item !== "object") {
			return item;
		}
		if (item.raw) return item.raw;
		if (item.item) return item.item.raw || item.item;
		return item;
	}

	function isItemHighlighted(item) {
		const resolvedItem = resolveHighlightedItem(item);
		if (!resolvedItem || !highlightedItemCode.value) {
			return false;
		}
		return resolvedItem.item_code === highlightedItemCode.value;
	}

	function getItemRowClass(item) {
		return isItemHighlighted(item) ? "item-row-highlighted" : "";
	}

	function getItemRowProps(item) {
		return isItemHighlighted(item) ? { class: "item-row-highlighted" } : {};
	}

	// --- Selection Logic ---

	async function selectHighlightedItem() {
		if (!Array.isArray(ctx.displayedItems) || ctx.displayedItems.length === 0) {
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
		if (ctx.addItem) {
			ctx.addItem(ctx.displayedItems[0]);
		}
	}

	// --- Mouse Interaction ---

	function triggerFlyAnimation(event, isRow = false) {
		if (!ctx.fly) return;

		const targets = document.querySelectorAll(".items-table-container");
		const target = targets[targets.length - 1]; // The Cart table container

		if (!target) return;

		let source;
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
			source = event.currentTarget?.querySelector?.(".card-item-image") || event.currentTarget;
			if (source) {
				ctx.fly(source, target, ctx.flyConfig);
			}
		}
	}

	function handleItemSelection(event, item) {
		triggerFlyAnimation(event, false);
		if (ctx.addItem) ctx.addItem(item);
	}

	async function handleRowClick(event, { item }) {
		triggerFlyAnimation(event, true);
		if (ctx.addItem) await ctx.addItem(item);
	}

	function handleSearchKeydown(event) {
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
