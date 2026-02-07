import { ref } from "vue";

export interface PerformanceMetrics {
	lastLoadTime: number;
	averageLoadTime: number;
	cacheHitRate: number;
	totalRequests: number;
	cachedRequests: number;
	searchHits: number;
	searchMisses: number;
}

export function useItemsMetrics() {
	const performanceMetrics = ref<PerformanceMetrics>({
		lastLoadTime: 0,
		averageLoadTime: 0,
		cacheHitRate: 0,
		totalRequests: 0,
		cachedRequests: 0,
		searchHits: 0,
		searchMisses: 0,
	});

	const updatePerformanceMetrics = (startTime: number) => {
		const loadTime = performance.now() - startTime;
		performanceMetrics.value.lastLoadTime = loadTime;

		const { averageLoadTime, totalRequests } = performanceMetrics.value;
		performanceMetrics.value.averageLoadTime =
			totalRequests > 1
				? (averageLoadTime * (totalRequests - 1) + loadTime) /
					totalRequests
				: loadTime;

		const { cachedRequests, totalRequests: total } =
			performanceMetrics.value;
		performanceMetrics.value.cacheHitRate =
			total > 0 ? (cachedRequests / total) * 100 : 0;
	};

	const getEstimatedMemoryUsage = (
		itemsCount: number,
		cacheSize: number,
		priceCacheSize: number,
	) => {
		try {
			let usage = 0;
			usage += (itemsCount * 2) / 1024; // ~2KB per item estimate
			usage += (cacheSize * 1) / 1024; // ~1KB per cache entry
			usage += (priceCacheSize * 0.5) / 1024; // ~0.5KB per price entry
			return Math.round(usage * 100) / 100; // MB estimate
		} catch {
			return 0;
		}
	};

	return {
		performanceMetrics,
		updatePerformanceMetrics,
		getEstimatedMemoryUsage,
	};
}
