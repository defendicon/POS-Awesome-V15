export const defaultDenominations = {
	PKR: [10, 20, 50, 100, 500, 1000, 5000],
	INR: [10, 20, 50, 100, 200, 500, 2000],
	USD: [1, 5, 10, 20, 50, 100],
	EUR: [5, 10, 20, 50, 100, 200, 500],
	GBP: [5, 10, 20, 50],
	AED: [5, 10, 20, 50, 100, 200, 500, 1000],
	SAR: [1, 5, 10, 50, 100, 500],
	QAR: [1, 5, 10, 50, 100, 500],
};

export function getSmartTenderSuggestions(amount, currency) {
	const denoms = defaultDenominations[currency] || [1, 5, 10, 20, 50, 100, 500, 1000];
	const suggestions = new Set();

	// Ensure amount is valid
	if (amount <= 0) return [];

	// Calculate next multiple for each denomination
	denoms.forEach((d) => {
		// Handle floating point precision for division
		// e.g. amount=18.50, d=1. 18.5/1 = 18.5. ceil -> 19.
		// amount=10, d=10. 10/10=1. ceil->1. *10 = 10.

		let multiple = Math.ceil(amount / d);

		// If exact match, we include it.
		// Note: Math.ceil(10/10) is 1. 1*10 = 10.

		const val = multiple * d;
		suggestions.add(val);
	});

	// Sort suggestions
	let sorted = Array.from(suggestions).sort((a, b) => a - b);

	// Deduplicate and filter
	const unique = [];
	const seen = new Set();

	sorted.forEach((v) => {
		// Fix precision to avoid 19.0000001
		const fixed = Number(v.toFixed(2));

		// Filter out values slightly less than amount due to precision
		if (fixed >= amount - 0.0001 && !seen.has(fixed)) {
			// If fixed is effectively equal to amount, we keep it (exact change)
			// But we should ensure it is >= amount.
			if (fixed < amount && Math.abs(fixed - amount) < 0.001) {
				// treating as equal
			} else if (fixed < amount) {
				return;
			}

			seen.add(fixed);
			unique.push(fixed);
		}
	});

	// Return reasonable number of suggestions
	// e.g. closest 6
	return unique.slice(0, 6);
}
