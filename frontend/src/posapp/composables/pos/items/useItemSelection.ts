import { ref } from "vue";
import {
	findItemIndexByCode,
	getNextHighlightedIndex,
} from "../../../utils/itemHighlight.js";

type SelectableItem = {
	item_code?: string | null;
	item_name?: string | null;
	image?: string | null;
	stock_uom?: string | null;
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

const isVisibleElement = (element: Element | null): element is HTMLElement => {
	if (!(element instanceof HTMLElement)) {
		return false;
	}

	const rect = element.getBoundingClientRect();
	if (rect.width <= 0 || rect.height <= 0) {
		return false;
	}

	const styles = window.getComputedStyle(element);
	return styles.display !== "none" && styles.visibility !== "hidden" && styles.opacity !== "0";
};

const findVisibleTarget = (selectors: string[]) => {
	for (const selector of selectors) {
		const matches = Array.from(document.querySelectorAll(selector));
		const visibleMatch = matches.find((candidate) => isVisibleElement(candidate));
		if (visibleMatch) {
			return visibleMatch;
		}
	}

	return null;
};

const resolveThemeHost = (element: Element | null) => {
	return (
		element?.closest(
			".v-theme--dark, .v-theme--light, [data-theme='dark'], [data-theme='light'], [data-theme-mode='dark'], [data-theme-mode='light'], .v-application",
		) || document.body
	);
};

const isDarkThemeHost = (element: Element | null) => {
	return Boolean(
		element?.closest(".v-theme--dark, [data-theme='dark'], [data-theme-mode='dark']"),
	);
};

const getItemMonogram = (item: SelectableItem) => {
	const label = String(item.item_name || item.item_code || "").trim();
	if (!label) {
		return "+";
	}
	return label
		.split(/\s+/)
		.slice(0, 2)
		.map((part) => part.charAt(0).toUpperCase())
		.join("");
};

const createFlyChip = (
	item: SelectableItem,
	event: MouseEvent,
	anchor: Element | null,
) => {
	const themeHost = resolveThemeHost(anchor || (event.currentTarget as Element | null));
	const hostStyles = window.getComputedStyle(themeHost as Element);
	const primaryRgb = hostStyles.getPropertyValue("--v-theme-primary").trim() || "59, 130, 246";
	const surface =
		hostStyles.getPropertyValue("--pos-surface-raised").trim() ||
		hostStyles.getPropertyValue("--pos-card-bg").trim() ||
		(isDarkThemeHost(themeHost as Element) ? "#1f2933" : "#ffffff");
	const textPrimary =
		hostStyles.getPropertyValue("--pos-text-primary").trim() ||
		(isDarkThemeHost(themeHost as Element) ? "#ffffff" : "#111827");
	const textSecondary =
		hostStyles.getPropertyValue("--pos-text-secondary").trim() ||
		(isDarkThemeHost(themeHost as Element) ? "#cbd5e1" : "#4b5563");
	const chip = document.createElement("div");
	const avatar = document.createElement(item.image ? "img" : "div");
	const content = document.createElement("div");
	const title = document.createElement("div");
	const subtitle = document.createElement("div");
	const qtyBadge = document.createElement("div");
	const isDarkTheme = isDarkThemeHost(themeHost as Element);

	chip.style.position = "fixed";
	chip.style.left = `${event.clientX - 84}px`;
	chip.style.top = `${event.clientY - 32}px`;
	chip.style.width = "168px";
	chip.style.minHeight = "64px";
	chip.style.display = "flex";
	chip.style.alignItems = "center";
	chip.style.gap = "10px";
	chip.style.padding = "10px 12px";
	chip.style.borderRadius = "18px";
	chip.style.background = surface;
	chip.style.border = `1px solid rgba(${primaryRgb}, ${isDarkTheme ? "0.48" : "0.2"})`;
	chip.style.boxShadow = isDarkTheme
		? `0 0 0 1px rgba(${primaryRgb}, 0.18), 0 0 22px rgba(${primaryRgb}, 0.22), 0 18px 42px rgba(0, 0, 0, 0.45)`
		: `0 12px 34px rgba(15, 23, 42, 0.16), 0 0 0 1px rgba(${primaryRgb}, 0.1)`;
	chip.style.backdropFilter = "blur(10px)";
	chip.style.pointerEvents = "none";
	chip.style.zIndex = "2600";
	chip.style.color = textPrimary;
	chip.style.overflow = "hidden";

	avatar.style.width = "42px";
	avatar.style.height = "42px";
	avatar.style.borderRadius = "12px";
	avatar.style.flex = "0 0 42px";
	avatar.style.objectFit = "cover";
	avatar.style.background = `rgba(${primaryRgb}, ${isDarkTheme ? "0.22" : "0.12"})`;
	avatar.style.border = `1px solid rgba(${primaryRgb}, ${isDarkTheme ? "0.35" : "0.16"})`;
	avatar.style.display = "flex";
	avatar.style.alignItems = "center";
	avatar.style.justifyContent = "center";
	avatar.style.fontSize = "0.82rem";
	avatar.style.fontWeight = "800";
	avatar.style.color = `rgb(${primaryRgb})`;

	if (avatar instanceof HTMLImageElement && item.image) {
		avatar.src = String(item.image);
		avatar.alt = String(item.item_name || item.item_code || "Item");
	} else {
		avatar.textContent = getItemMonogram(item);
	}

	content.style.display = "flex";
	content.style.flexDirection = "column";
	content.style.minWidth = "0";
	content.style.flex = "1";

	title.style.fontSize = "0.82rem";
	title.style.fontWeight = "700";
	title.style.lineHeight = "1.25";
	title.style.whiteSpace = "nowrap";
	title.style.overflow = "hidden";
	title.style.textOverflow = "ellipsis";
	title.textContent = String(item.item_name || item.item_code || "Item added");

	subtitle.style.fontSize = "0.72rem";
	subtitle.style.fontWeight = "600";
	subtitle.style.lineHeight = "1.2";
	subtitle.style.whiteSpace = "nowrap";
	subtitle.style.overflow = "hidden";
	subtitle.style.textOverflow = "ellipsis";
	subtitle.style.color = textSecondary;
	subtitle.textContent = String(item.item_code || item.stock_uom || "Added to cart");

	qtyBadge.style.display = "inline-flex";
	qtyBadge.style.alignItems = "center";
	qtyBadge.style.justifyContent = "center";
	qtyBadge.style.height = "26px";
	qtyBadge.style.minWidth = "32px";
	qtyBadge.style.padding = "0 10px";
	qtyBadge.style.borderRadius = "999px";
	qtyBadge.style.background = `rgb(${primaryRgb})`;
	qtyBadge.style.color = isDarkTheme ? "#03131a" : "#ffffff";
	qtyBadge.style.fontSize = "0.76rem";
	qtyBadge.style.fontWeight = "800";
	qtyBadge.style.flex = "0 0 auto";
	qtyBadge.textContent = "+1";

	content.appendChild(title);
	content.appendChild(subtitle);
	chip.appendChild(avatar);
	chip.appendChild(content);
	chip.appendChild(qtyBadge);
	(themeHost as HTMLElement).appendChild(chip);

	return chip;
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

	function triggerFlyAnimation(event: MouseEvent, item: SelectableItem) {
		if (!ctx.fly) return;

		const target = findVisibleTarget([
			"[data-fly-target='invoice-tab-badge']",
			"[data-fly-target='invoice-tab']",
			"[data-fly-target='cart-surface']",
			".posa-items-table-container",
			".invoice-main-card",
		]);

		if (!target) return;

		const source = createFlyChip(
			item,
			event,
			(event.currentTarget as Element | null) || target,
		);
		if (source) {
			ctx.fly(source, target, ctx.flyConfig);
			source.remove();
		}
	}

	function handleItemSelection(event: MouseEvent, item: SelectableItem) {
		triggerFlyAnimation(event, item);
		if (ctx.addItem) ctx.addItem(item);
	}

	async function handleRowClick(
		event: MouseEvent,
		payload: { item?: SelectableItem } | SelectableItem,
	) {
		const item =
			payload && typeof payload === "object" && "item" in payload
				? payload.item
				: (payload as SelectableItem);
		if (!item) {
			return;
		}
		triggerFlyAnimation(event, item);
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
