import { ref } from "vue";
import type { POSProfile } from "../../../../types/models";
// @ts-ignore
import { getStoredItemsCount } from "../../../../../offline/index";

const DEFAULT_PAGE_SIZE = 200;
const LARGE_CATALOG_THRESHOLD = 5000;
const LIMIT_SEARCH_FALLBACK = 500;

export interface CachedPagination {
	enabled: boolean;
	pageSize: number;
	offset: number;
	total: number;
	loading: boolean;
	search: string;
	group: string;
}

export function useItemsPagination() {
	const cachedPagination = ref<CachedPagination>({
		enabled: false,
		pageSize: DEFAULT_PAGE_SIZE,
		offset: 0,
		total: 0,
		loading: false,
		search: "",
		group: "ALL",
	});

	const resolveLimitSearchSize = (
		posProfile: POSProfile | null,
		limitSearchEnabled: boolean,
	): number => {
		if (!limitSearchEnabled) {
			return DEFAULT_PAGE_SIZE;
		}

		const rawLimit = posProfile?.posa_search_limit;
		const parsedLimit = Number.parseInt(rawLimit, 10);

		if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
			return parsedLimit;
		}

		return LIMIT_SEARCH_FALLBACK;
	};

	const resolvePageSize = (
		posProfile: POSProfile | null,
		limitSearchEnabled: boolean,
		pageSize = DEFAULT_PAGE_SIZE,
	): number => {
		if (limitSearchEnabled) {
			return resolveLimitSearchSize(posProfile, limitSearchEnabled);
		}

		return pageSize;
	};

	const resetCachedPagination = (
		options: { enabled?: boolean; total?: number; pageSize?: number } = {},
		posProfile: POSProfile | null,
		limitSearchEnabled: boolean,
	) => {
		const {
			enabled = false,
			total = 0,
			pageSize = DEFAULT_PAGE_SIZE,
		} = options;

		const resolvedPageSize = resolvePageSize(
			posProfile,
			limitSearchEnabled,
			pageSize,
		);

		cachedPagination.value.enabled = enabled;
		cachedPagination.value.total = Number.isFinite(total) ? total : 0;
		cachedPagination.value.pageSize = resolvedPageSize;
		cachedPagination.value.offset = 0;
		cachedPagination.value.loading = false;
		cachedPagination.value.search = "";
	};

	const updateCachedPaginationFromStorage = async (
		itemsLength: number,
		totalItemCount: { value: number },
		posProfile: POSProfile | null,
		shouldUseIndexedSearch: boolean,
		limitSearchEnabled: boolean,
	) => {
		if (!shouldUseIndexedSearch) {
			cachedPagination.value.enabled = false;
			cachedPagination.value.total = itemsLength;
			cachedPagination.value.offset = itemsLength;
			return;
		}

		try {
			const storedCount = await getStoredItemsCount().catch(() => 0);
			const resolvedCount = Number.isFinite(storedCount)
				? storedCount
				: 0;

			const shouldPaginate = resolvedCount > LARGE_CATALOG_THRESHOLD;
			cachedPagination.value.enabled = shouldPaginate;
			cachedPagination.value.total = resolvedCount;
			cachedPagination.value.pageSize = resolvePageSize(
				posProfile,
				limitSearchEnabled,
				DEFAULT_PAGE_SIZE,
			);
			cachedPagination.value.offset = Math.min(
				resolvedCount,
				itemsLength,
			);
			totalItemCount.value = Math.max(
				totalItemCount.value,
				resolvedCount,
			);
		} catch (error) {
			console.warn("Failed to update cached pagination state:", error);
		}
	};

	return {
		cachedPagination,
		DEFAULT_PAGE_SIZE,
		LARGE_CATALOG_THRESHOLD,
		resolvePageSize,
		resolveLimitSearchSize,
		resetCachedPagination,
		updateCachedPaginationFromStorage,
	};
}
