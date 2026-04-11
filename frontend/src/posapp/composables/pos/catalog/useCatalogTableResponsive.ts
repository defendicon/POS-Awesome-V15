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
			item_name: { min: 200, max: 250, ratio: 0.3 },
			qty: { min: 140, max: 160, ratio: 0.12 },
			rate: { min: 100, max: 130, ratio: 0.12 },
			amount: { min: 100, max: 130, ratio: 0.12 },
			discount_value: { min: 90, max: 120, ratio: 0.1 },
			discount_amount: { min: 90, max: 120, ratio: 0.11 },
			price_list_rate: { min: 120, max: 140, ratio: 0.13 },
			actions: { min: 80, max: 100, ratio: 0.08 },
			posa_is_offer: { min: 70, max: 90, ratio: 0.06 },
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
			item_name: 200,
			qty: 140,
			rate: 100,
			amount: 100,
			discount_value: 90,
			discount_amount: 90,
			price_list_rate: 120,
			actions: 80,
			posa_is_offer: 70,
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
