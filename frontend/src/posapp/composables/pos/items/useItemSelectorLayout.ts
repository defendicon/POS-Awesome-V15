import { ref, computed, onMounted, onUnmounted, nextTick } from "vue";
import _ from "lodash";
import {
	getCardColumns,
	getCardGap,
	getCardPadding,
} from "../../../utils/itemSelectorLayout.js";

type SelectorLayoutOptions = {
	resizeDebounce?: number;
	loadVisibleItems?: () => void;
	/** Returns the selector presentation ("classic", "nornux", ...). */
	presentation?: () => string;
};

/** Nornux card grid: compact square-ish product cards. */
const NORNUX_MIN_CARD_WIDTH = 150;
const NORNUX_CARD_ROW_HEIGHT = 168;
const NORNUX_CARD_GAP = 14;
const NORNUX_PANE_RATIO = 0.64;
/** Column/panel paddings and borders between the window and the card grid. */
const NORNUX_PANE_CHROME = 64;

/**
 * Manages the layout metrics and resize behavior for the ItemsSelector component.
 * Handles calculation of grid columns, card dimensions, and overflow detection.
 */
export function useItemSelectorLayout(options: SelectorLayoutOptions = {}) {
	const {
		resizeDebounce = 100,
		loadVisibleItems, // Method to load more items on scroll (pagination)
		presentation = () => "classic",
	} = options;
	const isNornux = computed(() => presentation() === "nornux");

	// State
	const windowWidth = ref(window.innerWidth);
	const isOverflowing = ref(false);
	const itemsContainerRef = ref<any>(null);
	const scrollThrottle = ref<number | null>(null);

	// Computed Metrics
	const cardPadding = computed(() =>
		isNornux.value ? 0 : getCardPadding(windowWidth.value),
	);
	const cardGap = computed(() =>
		isNornux.value ? NORNUX_CARD_GAP : getCardGap(windowWidth.value),
	);
	const cardColumns = computed(() => {
		if (!isNornux.value) {
			return getCardColumns(windowWidth.value);
		}
		const paneWidth = windowWidth.value * NORNUX_PANE_RATIO - NORNUX_PANE_CHROME;
		const columns = Math.floor(
			(paneWidth + NORNUX_CARD_GAP) / (NORNUX_MIN_CARD_WIDTH + NORNUX_CARD_GAP),
		);
		return Math.min(8, Math.max(2, columns));
	});

	const cardRowHeight = computed(() => {
		if (isNornux.value) {
			return NORNUX_CARD_ROW_HEIGHT;
		}
		if (windowWidth.value <= 768) {
			return 260;
		}
		if (windowWidth.value <= 1200) {
			return 280;
		}
		return 300;
	});

	const cardSlotHeight = computed(() => cardRowHeight.value + cardGap.value);
	const cardSlotWidth = computed(() => cardColumnWidth.value + cardGap.value);

	const cardContainerWidth = computed(() => {
		// If we have a reference to the container, try to get its width
		// Otherwise fallback to an estimated width based on window
		if (itemsContainerRef.value && itemsContainerRef.value.$el) {
			return itemsContainerRef.value.$el.clientWidth;
		}
		// Fallback estimation (e.g. 5 columns of regular grid)
		// This is just a safe default until mounted
		if (isNornux.value) {
			return windowWidth.value * NORNUX_PANE_RATIO - NORNUX_PANE_CHROME;
		}
		return windowWidth.value * 0.4; // Approx 40% of screen for items selector usually
	});

	const cardColumnWidth = computed(() => {
		const columns = Math.max(1, cardColumns.value);
		// Note: We might need a more robust way to get container width if it's dynamic
		// Ideally pass a ref to the container element
		const containerWidth = cardContainerWidth.value || 0;
		if (!containerWidth) {
			return 240; // Safe default
		}

		const gapTotal = cardGap.value * (columns - 1);
		const paddingTotal = cardPadding.value * 2;
		const available = Math.max(0, containerWidth - gapTotal - paddingTotal);
		const width = Math.floor(available / columns);
		return Math.max(isNornux.value ? NORNUX_MIN_CARD_WIDTH - 20 : 180, width);
	});

	// Actions
	const updateWindowWidth = () => {
		windowWidth.value = window.innerWidth;
	};

	const scheduleCardMetricsUpdate = _.debounce(() => {
		updateWindowWidth();
		// Force re-evaluation of container width if needed by accessing ref
		if (itemsContainerRef.value) {
			// Trigger reactivity if needed, though windowWidth usually drives computed props
		}
		checkItemContainerOverflow();
	}, resizeDebounce);

	const getItemsContainerElement = (): HTMLElement | null => {
		if (!itemsContainerRef.value) return null;
		// Handle both Vue component ref and raw element
		return (itemsContainerRef.value.$el ||
			itemsContainerRef.value) as HTMLElement | null;
	};

	const checkItemContainerOverflow = () => {
		const el = getItemsContainerElement();
		if (!el) {
			isOverflowing.value = false;
			return;
		}

		const containerHeight = parseFloat(
			getComputedStyle(el).getPropertyValue("--container-height"),
		);
		if (isNaN(containerHeight)) {
			isOverflowing.value = false;
			return;
		}

		const stickyHeader = el
			.closest(".dynamic-padding")
			?.querySelector(".sticky-header") as HTMLElement | null;
		const headerHeight = stickyHeader ? stickyHeader.offsetHeight : 0;
		const availableHeight = containerHeight - headerHeight;

		// Only apply if calculated height is valid
		if (availableHeight > 0) {
			el.style.maxHeight = `${availableHeight}px`;
			isOverflowing.value = el.scrollHeight > availableHeight;
		}

		// Also schedule metrics update as this might affect layout
		// But be careful of infinite loops; separate updateWindowWidth logic if needed
	};

	const onListScroll = (event: Event) => {
		if (scrollThrottle.value) return;

		scrollThrottle.value = requestAnimationFrame(() => {
			try {
				const el = event.target as HTMLElement | null;
				if (!el) return;
				if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) {
					// Trigger pagination via callback
					if (typeof loadVisibleItems === "function") {
						// We need access to currentPage logic, but usually loadVisibleItems handles the "next/more" logic
						loadVisibleItems();
					}
				}
			} catch (error: unknown) {
				console.error("Error in list scroll handler:", error);
			} finally {
				scrollThrottle.value = null;
			}
		});
	};

	// Lifecycle
	onMounted(() => {
		window.addEventListener("resize", scheduleCardMetricsUpdate);
		nextTick(() => {
			updateWindowWidth();
			checkItemContainerOverflow();
		});
	});

	onUnmounted(() => {
		window.removeEventListener("resize", scheduleCardMetricsUpdate);
		if (scrollThrottle.value) {
			cancelAnimationFrame(scrollThrottle.value);
		}
		scheduleCardMetricsUpdate.cancel();
	});

	return {
		// Refs
		windowWidth,
		isOverflowing,
		itemsContainerRef, // Bind this to the container in template

		// Computed
		cardColumns,
		cardGap,
		cardPadding,
		cardRowHeight,
		cardSlotHeight,
		cardSlotWidth,
		cardColumnWidth,

		// Methods
		checkItemContainerOverflow,
		scheduleCardMetricsUpdate,
		onListScroll,
	};
}
