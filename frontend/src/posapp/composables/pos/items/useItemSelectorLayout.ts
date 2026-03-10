import { ref, computed, onMounted, onUnmounted, nextTick, type Ref } from "vue";
import _ from "lodash";
import {
	getCardColumns,
	getCardGap,
	getCardPadding,
} from "../../../utils/itemSelectorLayout.js";

type SelectorLayoutOptions = {
	resizeDebounce?: number;
	loadVisibleItems?: () => void;
	containerRef?: Ref<any>;
};

/**
 * Manages the layout metrics and resize behavior for the ItemsSelector component.
 * Handles calculation of grid columns, card dimensions, and overflow detection.
 */
export function useItemSelectorLayout(options: SelectorLayoutOptions = {}) {
	const {
		resizeDebounce = 100,
		loadVisibleItems, // Method to load more items on scroll (pagination)
		containerRef,
	} = options;

	// State
	const windowWidth = ref(window.innerWidth);
	const isOverflowing = ref(false);
	const itemsContainerRef = ref<any>(null);
	const measuredContainerWidth = ref(0);
	const scrollThrottle = ref<number | null>(null);
	let resizeObserver: ResizeObserver | null = null;

	// Computed Metrics
	const layoutWidth = computed(() => measuredContainerWidth.value || windowWidth.value);
	const cardColumns = computed(() => getCardColumns(layoutWidth.value));
	const cardGap = computed(() => getCardGap(layoutWidth.value));
	const cardPadding = computed(() => getCardPadding(layoutWidth.value));

	const cardRowHeight = computed(() => {
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
		if (measuredContainerWidth.value > 0) {
			return measuredContainerWidth.value;
		}
		return windowWidth.value <= 768 ? windowWidth.value : windowWidth.value * 0.4;
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
		return Math.max(180, width);
	});

	// Actions
	const updateWindowWidth = () => {
		windowWidth.value = window.innerWidth;
	};

	const scheduleCardMetricsUpdate = _.debounce(() => {
		updateWindowWidth();
		updateMeasuredContainerWidth();
		checkItemContainerOverflow();
	}, resizeDebounce);

	const getItemsContainerElement = (): HTMLElement | null => {
		const container = containerRef?.value ?? itemsContainerRef.value;
		if (!container) return null;
		// Handle both Vue component ref and raw element
		return (container.$el || container) as HTMLElement | null;
	};

	const updateMeasuredContainerWidth = () => {
		const el = getItemsContainerElement();
		if (!el) {
			measuredContainerWidth.value = 0;
			return;
		}
		const nextWidth = Math.floor(el.clientWidth || el.getBoundingClientRect().width || 0);
		if (nextWidth > 0) {
			measuredContainerWidth.value = nextWidth;
		}
	};

	const checkItemContainerOverflow = () => {
		const el = getItemsContainerElement();
		if (!el) {
			isOverflowing.value = false;
			return;
		}

		const scrollEl =
			(el.querySelector(".virtual-scroller") as HTMLElement | null) ||
			(el.querySelector(".items-card-grid") as HTMLElement | null) ||
			el;

		isOverflowing.value = scrollEl.scrollHeight > scrollEl.clientHeight + 1;
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
			updateMeasuredContainerWidth();
			checkItemContainerOverflow();
			const el = getItemsContainerElement();
			if (el && typeof ResizeObserver !== "undefined") {
				resizeObserver = new ResizeObserver(() => {
					updateMeasuredContainerWidth();
					checkItemContainerOverflow();
				});
				resizeObserver.observe(el);
			}
		});
	});

	onUnmounted(() => {
		window.removeEventListener("resize", scheduleCardMetricsUpdate);
		if (resizeObserver) {
			resizeObserver.disconnect();
			resizeObserver = null;
		}
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
