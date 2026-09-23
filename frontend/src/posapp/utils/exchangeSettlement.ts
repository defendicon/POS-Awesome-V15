export type ExchangeSettlementType = "payment" | "credit" | "even";

export interface ExchangeSettlement {
	saleTotal: number;
	returnTotal: number;
	difference: number;
	amount: number;
	type: ExchangeSettlementType;
}

const asAmount = (value: unknown) => {
	const amount = Number(value);
	return Number.isFinite(amount) ? Math.abs(amount) : 0;
};

export function getExchangeSettlement(
	saleTotal: unknown,
	returnTotal: unknown,
	precision = 2,
): ExchangeSettlement {
	const sale = asAmount(saleTotal);
	const returned = asAmount(returnTotal);
	const safePrecision = Math.max(0, Math.min(9, Number(precision) || 0));
	const factor = 10 ** safePrecision;
	const difference = Math.round((sale - returned) * factor) / factor;

	return {
		saleTotal: sale,
		returnTotal: returned,
		difference,
		amount: Math.abs(difference),
		type: difference > 0 ? "payment" : difference < 0 ? "credit" : "even",
	};
}
