import { expect } from "vitest";

export interface MeasureResult {
	label: string;
	durationMs: number;
	success: boolean;
	iterations: number;
	memoryMB?: number;
}

export interface MeasureOptions {
	iterations?: number;
	warmup?: boolean;
}

function getMemoryMB(): number | undefined {
	try {
		const mem = (performance as any).memory;
		if (mem?.usedJSHeapSize) {
			return mem.usedJSHeapSize / 1_048_576;
		}
		if (typeof process !== "undefined" && process.memoryUsage) {
			return process.memoryUsage().heapUsed / 1_048_576;
		}
	} catch {}
	return undefined;
}

export function measure(
	label: string,
	fn: () => void,
	options?: MeasureOptions,
): MeasureResult {
	const iterations = options?.iterations ?? 1;
	if (options?.warmup !== false) {
		fn();
	}
	const beforeMem = getMemoryMB();
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		fn();
	}
	const durationMs = (performance.now() - start) / iterations;
	const afterMem = getMemoryMB();
	const memoryMB = beforeMem !== undefined && afterMem !== undefined
		? Math.round((afterMem - beforeMem) * 10) / 10
		: undefined;
	return { label, durationMs, success: true, iterations, memoryMB };
}

export async function measureAsync(
	label: string,
	fn: () => Promise<void>,
	options?: MeasureOptions,
): Promise<MeasureResult> {
	const iterations = options?.iterations ?? 1;
	if (options?.warmup !== false) {
		await fn();
	}
	const beforeMem = getMemoryMB();
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		await fn();
	}
	const durationMs = (performance.now() - start) / iterations;
	const afterMem = getMemoryMB();
	const memoryMB = beforeMem !== undefined && afterMem !== undefined
		? Math.round((afterMem - beforeMem) * 10) / 10
		: undefined;
	return { label, durationMs, success: true, iterations, memoryMB };
}

export function assertUnderThreshold(
	label: string,
	measuredMs: number,
	thresholdMs: number,
): void {
	expect(measuredMs, `${label} exceeded threshold of ${thresholdMs}ms`).toBeLessThan(thresholdMs);
}

export function assertBetween(
	label: string,
	measuredMs: number,
	lowerMs: number,
	upperMs: number,
): void {
	expect(
		measuredMs,
		`${label} expected between ${lowerMs}ms and ${upperMs}ms`,
	).toBeGreaterThanOrEqual(lowerMs);
	expect(
		measuredMs,
		`${label} exceeded upper bound of ${upperMs}ms`,
	).toBeLessThan(upperMs);
}

export class BenchmarkCollector {
	private results: MeasureResult[] = [];

	add(result: MeasureResult): void {
		this.results.push(result);
	}

	get summary(): string {
		if (this.results.length === 0) return "No benchmarks collected.";
		const lines = this.results.map((r) => {
			const mem = r.memoryMB !== undefined ? ` | Δmem ${r.memoryMB.toFixed(1)}MB` : "";
			return `  ${r.label}: ${r.durationMs.toFixed(2)}ms (${r.iterations} iteration(s))${mem}`;
		});
		return lines.join("\n");
	}

	get totalDurationMs(): number {
		return this.results.reduce((sum, r) => sum + r.durationMs, 0);
	}
}
