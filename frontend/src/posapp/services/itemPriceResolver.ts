import type { OfflineItemPriceRecord } from "../../offline/repositories/ItemPriceRepository";

export type ItemPriceResolutionSource =
	| "exact_uom"
	| "stock_uom_conversion"
	| "baseline_conversion";

export type ItemPriceResolution = {
	rate: number;
	source: ItemPriceResolutionSource;
	recordName: string | null;
};

export type ResolveItemPriceInput = {
	records: OfflineItemPriceRecord[];
	selectedUom: string;
	stockUom: string;
	conversionFactor: number;
	customer?: string | null;
	currency?: string | null;
	postingDate?: string | null;
	fallbackStockUnitRate?: number | null;
};

function normalizedText(value: unknown) {
	return String(value || "").trim();
}

function normalizedDate(value: unknown) {
	const text = normalizedText(value);
	return text ? text.slice(0, 10) : "";
}

function numericRate(value: unknown) {
	const numeric = Number.parseFloat(String(value ?? ""));
	return Number.isFinite(numeric) ? numeric : null;
}

function isApplicable(
	record: OfflineItemPriceRecord,
	input: ResolveItemPriceInput,
) {
	const postingDate = normalizedDate(input.postingDate);
	const validFrom = normalizedDate(record.valid_from);
	const validUpto = normalizedDate(record.valid_upto);
	if (postingDate && validFrom && validFrom > postingDate) {
		return false;
	}
	if (postingDate && validUpto && validUpto < postingDate) {
		return false;
	}

	const expectedCurrency = normalizedText(input.currency);
	const recordCurrency = normalizedText(record.currency);
	if (
		expectedCurrency &&
		recordCurrency &&
		recordCurrency !== expectedCurrency
	) {
		return false;
	}

	const customer = normalizedText(input.customer);
	const recordCustomer = normalizedText(record.customer);
	if (recordCustomer && recordCustomer !== customer) {
		return false;
	}

	return numericRate(record.price_list_rate) !== null;
}

function compareCandidates(
	left: OfflineItemPriceRecord,
	right: OfflineItemPriceRecord,
	customer: string,
) {
	const leftCustomerScore =
		normalizedText(left.customer) === customer && customer ? 1 : 0;
	const rightCustomerScore =
		normalizedText(right.customer) === customer && customer ? 1 : 0;
	if (leftCustomerScore !== rightCustomerScore) {
		return rightCustomerScore - leftCustomerScore;
	}

	const validFromDelta = normalizedDate(right.valid_from).localeCompare(
		normalizedDate(left.valid_from),
	);
	if (validFromDelta !== 0) {
		return validFromDelta;
	}

	const modifiedDelta = normalizedText(right.modified).localeCompare(
		normalizedText(left.modified),
	);
	if (modifiedDelta !== 0) {
		return modifiedDelta;
	}

	return normalizedText(left.name).localeCompare(normalizedText(right.name));
}

function selectCandidate(
	records: OfflineItemPriceRecord[],
	uom: string,
	stockUom: string,
	customer: string,
) {
	const expectedUom = normalizedText(uom);
	return records
		.filter((record) => {
			const recordUom =
				normalizedText(record.uom) || normalizedText(stockUom);
			return recordUom === expectedUom;
		})
		.sort((left, right) => compareCandidates(left, right, customer))[0];
}

export function resolveItemPrice(
	input: ResolveItemPriceInput,
): ItemPriceResolution | null {
	const selectedUom = normalizedText(input.selectedUom);
	const stockUom = normalizedText(input.stockUom);
	if (!selectedUom || !stockUom) {
		return null;
	}

	const conversionFactorRaw = Number(input.conversionFactor);
	const conversionFactor =
		Number.isFinite(conversionFactorRaw) && conversionFactorRaw > 0
			? conversionFactorRaw
			: 1;
	const customer = normalizedText(input.customer);
	const records = (input.records || []).filter((record) =>
		isApplicable(record, input),
	);

	const exactRecord = selectCandidate(
		records,
		selectedUom,
		stockUom,
		customer,
	);
	if (exactRecord) {
		return {
			rate: numericRate(exactRecord.price_list_rate) as number,
			source: "exact_uom",
			recordName: exactRecord.name,
		};
	}

	const stockRecord = selectCandidate(
		records,
		stockUom,
		stockUom,
		customer,
	);
	if (stockRecord) {
		return {
			rate:
				(numericRate(stockRecord.price_list_rate) as number) *
				conversionFactor,
			source: "stock_uom_conversion",
			recordName: stockRecord.name,
		};
	}

	const fallbackRate = numericRate(input.fallbackStockUnitRate);
	if (fallbackRate === null) {
		return null;
	}
	return {
		rate: fallbackRate * conversionFactor,
		source: "baseline_conversion",
		recordName: null,
	};
}
