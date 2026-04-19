type MaybeRefLike<T> = T | { value: T } | (() => T);

type InvoiceRateInfo = {
	rate?: number;
	currency?: string;
	invoice?: string;
	uom?: string;
	posting_date?: string;
};

type BuyingRateInfo = {
	rate?: number;
	currency?: string;
	uom?: string;
	source?: string;
	invoice?: string;
	posting_date?: string;
	supplier?: string;
};

export type ItemRateInfoEntry = {
	key?: "sale" | "purchase" | "cost";
	visible: boolean;
	available: boolean;
	rowLabel: string;
	label: string;
	rate: number | null;
	currency: string | null;
	uom: string | null;
	source: string | null;
	sourceKey: string | null;
	date: string | null;
	meta: string | null;
};

export type ItemRateInfoPayload = {
	entries: ItemRateInfoEntry[];
	lastSale: ItemRateInfoEntry;
	lastPurchase: ItemRateInfoEntry;
	cost: ItemRateInfoEntry;
};

interface UseItemRateInfoContext {
	context?: MaybeRefLike<string>;
	pos_profile?: MaybeRefLike<{ currency?: string; company_currency?: string } | null>;
	is_pos_supervisor?: MaybeRefLike<boolean>;
	getLastInvoiceRate?: (item: any) => InvoiceRateInfo | null;
	getLastBuyingRate?: (item: any) => BuyingRateInfo | null;
}

const unwrapValue = <T>(source: MaybeRefLike<T> | undefined): T | undefined => {
	if (typeof source === "function") {
		return (source as () => T)();
	}
	if (source && typeof source === "object" && "value" in source) {
		return (source as { value: T }).value;
	}
	return source as T | undefined;
};

const buildEntry = (entry: Partial<ItemRateInfoEntry>): ItemRateInfoEntry => ({
	visible: true,
	available: false,
	rowLabel: "",
	label: "Not available",
	rate: null,
	currency: null,
	uom: null,
	source: null,
	sourceKey: null,
	date: null,
	meta: null,
	...entry,
});

const parseFiniteNumber = (value: unknown) => {
	if (value === null || value === undefined || value === "") {
		return null;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
};

export function useItemRateInfo(context: UseItemRateInfoContext = {}) {
	const getLastInvoiceRate = context.getLastInvoiceRate || (() => null);
	const getLastBuyingRate = context.getLastBuyingRate || (() => null);
	const isSupervisor = () => Boolean(unwrapValue(context.is_pos_supervisor));

	const resolveProfileCurrency = () => {
		const profile = unwrapValue(context.pos_profile);
		return profile?.company_currency || profile?.currency || null;
	};

	const buildSaleEntry = (item: any): ItemRateInfoEntry => {
		const row = getLastInvoiceRate(item);
		if (!row || row.rate == null) {
			return buildEntry({
				key: "sale",
				rowLabel: "Last Invoice Rate",
			});
		}
		return buildEntry({
			key: "sale",
			rowLabel: "Last Invoice Rate",
			available: true,
			rate: Number(row.rate),
			currency: row.currency || resolveProfileCurrency(),
			uom: row.uom || item?.stock_uom || null,
			source: row.invoice || null,
			sourceKey: "last_invoice_rate",
			date: row.posting_date || null,
			meta: null,
		});
	};

	const buildPurchaseEntry = (item: any): ItemRateInfoEntry => {
		const row = getLastBuyingRate(item);
		if (!row || row.rate == null) {
			return buildEntry({
				key: "purchase",
				rowLabel: "Last Purchase Rate",
				visible: isSupervisor(),
			});
		}

		const source =
			row.invoice ||
			(row.source === "price_list" ? "Supplier Price List" : null) ||
			row.source ||
			null;

		return buildEntry({
			key: "purchase",
			rowLabel: "Last Purchase Rate",
			visible: isSupervisor(),
			available: true,
			rate: Number(row.rate),
			currency: row.currency || resolveProfileCurrency(),
			uom: row.uom || item?.purchase_uom || item?.stock_uom || null,
			source,
			sourceKey: row.source || "last_buying_rate",
			date: row.posting_date || null,
			meta: row.supplier || null,
		});
	};

	const buildCostEntry = (item: any): ItemRateInfoEntry => {
		const profileCurrency = resolveProfileCurrency();
		const manufacturingCost = parseFiniteNumber(item?.manufacturing_cost);
		if (manufacturingCost !== null && String(item?.manufacturing_cost_source || "") === "bom") {
			return buildEntry({
				key: "cost",
				rowLabel: "Manufacturing Cost",
				visible: isSupervisor(),
				available: true,
				rate: manufacturingCost,
				currency: profileCurrency,
				uom: item?.stock_uom || null,
				source: item?.manufacturing_bom || "BOM",
				sourceKey: "bom",
				date: null,
				meta: null,
			});
		}

		const standardRate = parseFiniteNumber(item?.standard_rate);
		if (standardRate !== null) {
			return buildEntry({
				key: "cost",
				rowLabel: "Cost",
				visible: isSupervisor(),
				available: true,
				rate: standardRate,
				currency: profileCurrency,
				uom: item?.purchase_uom || item?.stock_uom || null,
				source: "Standard Rate",
				sourceKey: "standard_rate",
				date: null,
				meta: null,
			});
		}

		const valuationRate = parseFiniteNumber(item?.valuation_rate);
		if (valuationRate !== null) {
			return buildEntry({
				key: "cost",
				rowLabel: "Cost",
				visible: isSupervisor(),
				available: true,
				rate: valuationRate,
				currency: profileCurrency,
				uom: item?.stock_uom || null,
				source: "Valuation Rate",
				sourceKey: "valuation_rate",
				date: null,
				meta: null,
			});
		}

		return buildEntry({
			key: "cost",
			rowLabel: "Cost",
			visible: isSupervisor(),
		});
	};

	const getItemRateInfo = (item: any): ItemRateInfoPayload => {
		// Use BOM-derived unit cost for manufactured items when available; otherwise
		// fall back to existing item cost fields in descending order of confidence.
		const lastSale = buildSaleEntry(item);
		const lastPurchase = buildPurchaseEntry(item);
		const cost = buildCostEntry(item);
		return {
			entries: [lastSale, lastPurchase, cost].filter((entry) => entry.visible),
			lastSale,
			lastPurchase,
			cost,
		};
	};

	return {
		getItemRateInfo,
		resolveProfileCurrency,
		getContext: () => unwrapValue(context.context),
	};
}
