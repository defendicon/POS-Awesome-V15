import type { Item } from "../../../src/posapp/types/models";

const ITEM_GROUPS = [
	"Products", "Raw Materials", "Consumables", "Sub Assemblies",
	"Services", "All Item Groups",
];

const UOMS = ["Nos", "Kgs", "Ltrs", "Box", "Pcs", "Mtrs"];

const BRANDS = [
	"AlphaBrand", "BetaMfg", "GammaCorp", "DeltaInc",
	"", "", "",
];

function padIndex(i: number, total: number): string {
	const width = String(total).length;
	return String(i).padStart(width, "0");
}

export function generateItems(count: number, startIndex = 1): Item[] {
	return Array.from({ length: count }, (_, idx) => {
		const i = startIndex + idx;
		const id = padIndex(i, count + startIndex);
		const group = ITEM_GROUPS[idx % ITEM_GROUPS.length];
		const uom = UOMS[idx % UOMS.length];
		const brand = BRANDS[idx % BRANDS.length];
		return {
			item_code: `ITEM-${id}`,
			item_name: `Benchmark Item ${id}`,
			description: `Performance test item ${id} in group ${group}`,
			stock_qty: (idx % 100) + 10,
			standard_rate: 10 + (idx % 991),
			uom,
			item_group: group,
			brand,
			actual_qty: (idx % 50) + 5,
			is_stock_item: 1,
			has_serial_no: idx % 20 === 0 ? 1 : 0,
			has_batch_no: idx % 30 === 0 ? 1 : 0,
			conversion_factor: 1,
			barcode: `BARCODE-${id}`,
			image: idx % 10 === 0 ? `/files/item_${id}.png` : undefined,
		};
	});
}

export function generateItemCodes(count: number, startIndex = 1): string[] {
	return Array.from(
		{ length: count },
		(_, idx) => `ITEM-${padIndex(startIndex + idx, count + startIndex)}`,
	);
}

export const CATALOG_SIZES = [10_000, 50_000, 100_000] as const;
export type CatalogSize = (typeof CATALOG_SIZES)[number];
