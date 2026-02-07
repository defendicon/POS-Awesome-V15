export const defaultDenominations: Record<string, number[]> = {
	PKR: [10, 20, 50, 100, 500, 1000, 5000],
	INR: [10, 20, 50, 100, 200, 500, 2000],
	USD: [1, 5, 10, 20, 50, 100],
	EUR: [5, 10, 20, 50, 100, 200, 500],
	GBP: [5, 10, 20, 50],
	AED: [5, 10, 20, 50, 100, 200, 500, 1000],
	SAR: [1, 5, 10, 50, 100, 500],
	QAR: [1, 5, 10, 50, 100, 500],
};

export function getSmartTenderSuggestions(amount: number, currency: string) {
	const denoms = defaultDenominations[currency] || [
		1, 5, 10, 20, 50, 100, 500, 1000,
	];
	const suggestions = new Set<number>();

	if (amount <= 0) return [];

	denoms.forEach((d) => {
		const multiple = Math.ceil(amount / d);
		const val = multiple * d;
		suggestions.add(val);
	});

	const sorted = Array.from(suggestions).sort((a, b) => a - b);

	const unique: number[] = [];
	const seen = new Set<number>();

	sorted.forEach((v) => {
		const fixed = Number(v.toFixed(2));

		if (fixed >= amount - 0.0001 && !seen.has(fixed)) {
			if (!(fixed < amount && Math.abs(fixed - amount) >= 0.001)) {
				seen.add(fixed);
				unique.push(fixed);
			}
		}
	});

	return unique.slice(0, 6);
}
