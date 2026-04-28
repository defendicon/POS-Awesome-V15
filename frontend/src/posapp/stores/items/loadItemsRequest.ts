import type { POSProfile } from "../../types/models";
import type { GetItemsArgs } from "../../services/itemService";

export interface LoadItemsOptions {
	forceServer?: boolean;
	searchValue?: string;
	groupFilter?: string;
	priceList?: string | null;
	limit?: number | null;
}

export interface BuildLoadItemsRequestInput {
	options?: LoadItemsOptions;
	posProfile: POSProfile | null;
	activePriceList: string;
	customer: string | null;
	itemCount: number;
	totalItemCount: number;
	limitSearchEnabled: boolean;
	resolvePageSize: () => number;
	resolveLimitSearchSize: () => number | null;
}

export interface BuiltLoadItemsRequest {
	forceServer: boolean;
	searchValue: string;
	normalizedGroup: string;
	priceList: string | null;
	effectivePriceList: string;
	isInitialBootstrapRequest: boolean;
	resolvedLimit: number | null;
	args: GetItemsArgs | null;
}

export const buildLoadItemsRequest = ({
	options = {},
	posProfile,
	activePriceList,
	customer,
	itemCount,
	totalItemCount,
	limitSearchEnabled,
	resolvePageSize,
	resolveLimitSearchSize,
}: BuildLoadItemsRequestInput): BuiltLoadItemsRequest => {
	const {
		forceServer = false,
		searchValue: rawSearchValue = "",
		groupFilter = "ALL",
		priceList = null,
		limit = null,
	} = options;

	const searchValue =
		typeof rawSearchValue === "string" ? rawSearchValue.trim() : "";
	const normalizedGroup =
		typeof groupFilter === "string" && groupFilter.trim().length > 0
			? groupFilter.trim()
			: "ALL";

	const isInitialBootstrapRequest =
		!forceServer &&
		!limitSearchEnabled &&
		!searchValue &&
		normalizedGroup === "ALL" &&
		itemCount === 0 &&
		totalItemCount === 0;

	const resolvedLimit =
		Number.isFinite(limit) && limit! > 0
			? limit!
			: isInitialBootstrapRequest
				? resolvePageSize()
				: limitSearchEnabled
					? resolveLimitSearchSize()
					: null;

	if (!posProfile) {
		return {
			forceServer,
			searchValue,
			normalizedGroup,
			priceList,
			effectivePriceList: priceList || activePriceList,
			isInitialBootstrapRequest,
			resolvedLimit,
			args: null,
		};
	}

	const requestProfile = JSON.parse(JSON.stringify(posProfile));
	const effectivePriceList = priceList || activePriceList;
	const shouldForceServerCacheRefresh = forceServer && !searchValue;
	if (shouldForceServerCacheRefresh) {
		requestProfile.posa_use_server_cache = 0;
		requestProfile.posa_force_reload_items = 1;
	}

	const args: GetItemsArgs = {
		pos_profile: JSON.stringify(requestProfile),
		price_list: effectivePriceList,
		item_group: normalizedGroup !== "ALL" ? normalizedGroup.toLowerCase() : "",
		search_value: searchValue || "",
		customer,
		include_image: 1,
		item_groups: posProfile?.item_groups?.map((g: any) => g.item_group) || [],
	};

	if (typeof resolvedLimit === "number" && resolvedLimit > 0) {
		args.limit = resolvedLimit;
	}

	return {
		forceServer,
		searchValue,
		normalizedGroup,
		priceList,
		effectivePriceList,
		isInitialBootstrapRequest,
		resolvedLimit,
		args,
	};
};
