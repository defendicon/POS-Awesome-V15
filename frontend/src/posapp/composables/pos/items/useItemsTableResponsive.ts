import { ref, computed, onMounted, onBeforeUnmount, type Ref } from "vue";
import * as _ from "lodash";

export interface TableHeader {
	title: string;
	key: string;
	required?: boolean;
	sortable?: boolean;
	align?: "start" | "center" | "end";
	width?: string | number;
	minWidth?: string | number;
	[key: string]: any;
}

export const DATA_TABLE_EXPAND_COLUMN: TableHeader = {
	title: "",
	key: "data-table-expand",
	sortable: false,
	align: "center",
	width: 48,
	minWidth: 48,
};

const DENSE_COLUMN_COUNT = 9;
const DENSE_LAYOUT_MIN_WIDTH = 900;
type ColumnWidthConfig = { min: number; max: number; ratio: number };

const STANDARD_COLUMN_WIDTHS: Record<string, ColumnWidthConfig> = {
	item_name: { min: 160, max: 210, ratio: 0.23 },
	qty: { min: 92, max: 112, ratio: 0.11 },
	uom: { min: 92, max: 112, ratio: 0.1 },
	rate: { min: 92, max: 110, ratio: 0.105 },
	amount: { min: 100, max: 118, ratio: 0.11 },
	discount_percentage: { min: 96, max: 110, ratio: 0.1 },
	discount_amount: { min: 105, max: 118, ratio: 0.11 },
	price_list_rate: { min: 105, max: 118, ratio: 0.11 },
	actions: { min: 68, max: 76, ratio: 0.07 },
	posa_is_offer: { min: 70, max: 90, ratio: 0.06 },
};

const DENSE_COLUMN_WIDTHS: Record<string, ColumnWidthConfig> = {
	item_name: { min: 148, max: 178, ratio: 0.17 },
	qty: { min: 82, max: 96, ratio: 0.085 },
	uom: { min: 72, max: 88, ratio: 0.075 },
	rate: { min: 86, max: 98, ratio: 0.09 },
	amount: { min: 94, max: 108, ratio: 0.1 },
	discount_percentage: { min: 82, max: 94, ratio: 0.085 },
	discount_amount: { min: 94, max: 108, ratio: 0.1 },
	price_list_rate: { min: 92, max: 104, ratio: 0.095 },
	actions: { min: 56, max: 64, ratio: 0.06 },
	posa_is_offer: { min: 72, max: 82, ratio: 0.075 },
};

const getColumnWidthConfig = (header: TableHeader, dense: boolean) =>
	(dense ? DENSE_COLUMN_WIDTHS : STANDARD_COLUMN_WIDTHS)[header.key] || {
		min: 80,
		max: 150,
		ratio: 0.1,
	};

export const usesDenseColumnLayout = (headers: TableHeader[], width: number) =>
	headers.length >= DENSE_COLUMN_COUNT && width >= DENSE_LAYOUT_MIN_WIDTH;

export function getResponsiveVisibleHeaders(
	headers: TableHeader[],
	width: number,
) {
	const visibleHeaders = headers.filter((header) => {
		if (
			header.required ||
			header.key === "item_name" ||
			header.key === "qty" ||
			header.key === "actions" ||
			header.key === "amount"
		) {
			return true;
		}

		if (width > 0 && width < 450) {
			return ["item_name", "qty", "amount", "actions"].includes(
				header.key,
			);
		}
		return true;
	});
	const dense = usesDenseColumnLayout(visibleHeaders, width);

	return visibleHeaders.map((header) => ({
		...header,
		width: calculateColumnWidth(header, width, dense),
		minWidth: calculateMinColumnWidth(header, dense),
	}));
}

export function buildFinalVisibleColumns(
	headers: TableHeader[],
	width: number,
	options: { showExpand?: boolean } = {},
) {
	const visibleHeaders = getResponsiveVisibleHeaders(headers, width);

	if (options.showExpand === false) {
		return visibleHeaders;
	}

	return [...visibleHeaders, DATA_TABLE_EXPAND_COLUMN];
}

const calculateColumnWidth = (
	header: TableHeader,
	width: number,
	dense = false,
) => {
	const config = getColumnWidthConfig(header, dense);
	const calculatedWidth = width * config.ratio;
	return Math.max(config.min, Math.min(config.max, calculatedWidth));
};

const calculateMinColumnWidth = (header: TableHeader, dense = false) =>
	getColumnWidthConfig(header, dense).min;

export function useItemsTableResponsive(
	containerRef: Ref<HTMLElement | null>,
	headers: Ref<TableHeader[]>,
) {
	const containerWidth = ref(0);
	const containerHeight = ref(0);
	const breakpoint = ref("xl");
	let resizeObserver: ResizeObserver | null = null;

	const updateBreakpoint = (width: number) => {
		if (width < 500) return "xs";
		if (width < 700) return "sm";
		if (width < 900) return "md";
		if (width < 1200) return "lg";
		return "xl";
	};

	const responsiveHeaders = computed(() => {
		const width = containerWidth.value;
		if (!headers.value || headers.value.length === 0) return [];

		return getResponsiveVisibleHeaders(headers.value, width);
	});

	const isColumnVisible = (key: string) => {
		return responsiveHeaders.value.some((h) => h.key === key);
	};

	const containerStyles = computed(() => ({
		height: "100%",
		maxHeight: "100%",
		minHeight: "0",
		"--container-width": containerWidth.value + "px",
		"--container-height": containerHeight.value + "px",
	}));

	const containerClasses = computed(() => ({
		[`breakpoint-${breakpoint.value}`]: true,
		"compact-view": containerWidth.value < 600,
		"medium-view":
			containerWidth.value >= 600 && containerWidth.value < 900,
		"large-view": containerWidth.value >= 900,
	}));

	const tableClasses = computed(() => ({
		[`container-${breakpoint.value}`]: true,
		"responsive-table": true,
		"dense-columns-view": usesDenseColumnLayout(
			responsiveHeaders.value,
			containerWidth.value,
		),
	}));

	const expandedContentClasses = computed(() => ({
		[`expanded-${breakpoint.value}`]: true,
		"compact-expanded": containerWidth.value < 600,
	}));

	const tableDensity = computed(() => {
		if (containerWidth.value < 500) return "compact";
		if (containerWidth.value < 800) return "default";
		return "comfortable";
	});

	const setupResizeObserver = () => {
		if (typeof ResizeObserver !== "undefined" && containerRef.value) {
			const debouncedResizeHandler = _.debounce(
				(entries: ResizeObserverEntry[]) => {
					for (let entry of entries) {
						const { width, height } = entry.contentRect;
						if (
							containerWidth.value !== width ||
							containerHeight.value !== height
						) {
							containerWidth.value = width;
							containerHeight.value = height;
							breakpoint.value = updateBreakpoint(width);
						}
					}
				},
				100,
			);

			resizeObserver = new ResizeObserver(debouncedResizeHandler);
			resizeObserver.observe(containerRef.value);
			// Initial call
			const rect = containerRef.value.getBoundingClientRect();
			containerWidth.value = rect.width;
			containerHeight.value = rect.height;
			breakpoint.value = updateBreakpoint(rect.width);
		}
	};

	onMounted(() => {
		setupResizeObserver();
	});

	onBeforeUnmount(() => {
		if (resizeObserver) {
			resizeObserver.disconnect();
		}
	});

	return {
		containerWidth,
		containerHeight,
		breakpoint,
		responsiveHeaders,
		isColumnVisible,
		containerStyles,
		containerClasses,
		tableClasses,
		expandedContentClasses,
		tableDensity,
	};
}
