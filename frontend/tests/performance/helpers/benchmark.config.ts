import type { CatalogSize } from "./mockDataGenerators";

export interface CatalogThresholds {
	load: number;
	search: number;
	barcode: number;
}

export interface ConcurrentThresholds {
	syncCoordinator: number;
	parallelSubmissions: number;
	concurrentSearch: number;
}

export interface BenchmarkConfig {
	catalog: Record<CatalogSize, CatalogThresholds>;
	concurrent: Record<number, ConcurrentThresholds>;
}

const defaultConfig: BenchmarkConfig = {
	catalog: {
		10_000: { load: 3000, search: 100, barcode: 50 },
		50_000: { load: 8000, search: 200, barcode: 50 },
		100_000: { load: 15000, search: 300, barcode: 50 },
	},
	concurrent: {
		10: { syncCoordinator: 50, parallelSubmissions: 120, concurrentSearch: 50 },
		50: { syncCoordinator: 200, parallelSubmissions: 300, concurrentSearch: 100 },
		100: { syncCoordinator: 400, parallelSubmissions: 700, concurrentSearch: 200 },
	},
};

const multiplier = (() => {
	if (typeof process !== "undefined" && process.env) {
		const m = Number(process.env.PERF_THRESHOLD_MULTIPLIER);
		return Number.isFinite(m) && m > 0 ? m : 1;
	}
	return 1;
})();

function scale(thresholds: Record<string, number | Record<string, number>>): any {
	if (multiplier === 1) return thresholds;
	const scaled: Record<string, any> = {};
	for (const [key, value] of Object.entries(thresholds)) {
		if (typeof value === "number") {
			scaled[key] = Math.round(value * multiplier);
		} else if (typeof value === "object") {
			scaled[key] = scale(value as any);
		} else {
			scaled[key] = value;
		}
	}
	return scaled;
}

export const config: BenchmarkConfig = scale(defaultConfig) as BenchmarkConfig;

export function catalogThreshold(size: CatalogSize): CatalogThresholds {
	const t = config.catalog[size];
	if (!t) throw new Error(`No thresholds for catalog size ${size}`);
	const envOverride = typeof process !== "undefined"
		? process.env?.[`PERF_THRESHOLD_CATALOG_${size}`]
		: undefined;
	if (envOverride) {
		try {
			return JSON.parse(envOverride);
		} catch {}
	}
	return t;
}

export function concurrentThreshold(stationCount: number): ConcurrentThresholds {
	const t = config.concurrent[stationCount];
	if (!t) throw new Error(`No thresholds for ${stationCount} stations`);
	return t;
}
