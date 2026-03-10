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

	const calculateColumnWidth = (header: TableHeader, width: number) => {
		const baseWidths: Record<
			string,
			{ min: number; max: number; ratio: number }
		> = {
			item_name: { min: 170, max: 220, ratio: 0.24 },
			qty: { min: 110, max: 132, ratio: 0.1 },
			uom: { min: 72, max: 88, ratio: 0.08 },
			rate: { min: 88, max: 108, ratio: 0.1 },
			amount: { min: 92, max: 112, ratio: 0.1 },
			discount_value: { min: 76, max: 92, ratio: 0.08 },
			discount_amount: { min: 88, max: 104, ratio: 0.09 },
			price_list_rate: { min: 96, max: 116, ratio: 0.1 },
			actions: { min: 56, max: 68, ratio: 0.055 },
			posa_is_offer: { min: 84, max: 104, ratio: 0.09 },
		};

		const config = baseWidths[header.key] || {
			min: 80,
			max: 150,
			ratio: 0.1,
		};
		const calculatedWidth = width * config.ratio;
		return Math.max(config.min, Math.min(config.max, calculatedWidth));
	};

	const calculateMinColumnWidth = (header: TableHeader) => {
		const minWidths: Record<string, number> = {
			item_name: 170,
			qty: 110,
			uom: 72,
			rate: 88,
			amount: 92,
			discount_value: 76,
			discount_amount: 88,
			price_list_rate: 96,
			actions: 56,
			posa_is_offer: 84,
		};
		return minWidths[header.key] || 80;
	};

	const responsiveHeaders = computed(() => {
		const width = containerWidth.value;
		if (!headers.value || headers.value.length === 0) return [];

		return headers.value
			.filter((header) => {
				if (
					header.required ||
					header.key === "item_name" ||
					header.key === "qty" ||
					header.key === "actions" ||
					header.key === "amount"
				) {
					return true;
				}

				if (width < 450) {
					return ["item_name", "qty", "amount", "actions"].includes(
						header.key,
					);
				} else if (width < 650) {
					return ![
						"discount_value",
						"discount_amount",
						"price_list_rate",
						"uom",
						"posa_is_offer",
					].includes(header.key);
				}
				return true;
			})
			.map((header) => ({
				...header,
				width: calculateColumnWidth(header, width),
				minWidth: calculateMinColumnWidth(header),
			}));
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
	}));

	const expandedContentClasses = computed(() => ({
		[`expanded-${breakpoint.value}`]: true,
		"compact-expanded": containerWidth.value < 600,
	}));

	const tableDensity = computed(() => {
		if (containerWidth.value < 500) return "compact";
		if (containerWidth.value < 800) return "default";
		return "default";
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
