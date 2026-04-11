import { useBundles } from "../useBundles";
import { useStockUtils } from "../../shared/useStockUtils";

export function useItemBundles() {
	const { getBundleComponents } = useBundles();
	const { calcStockQty } = useStockUtils();

	const expandBundle = async (parent: any, context: any) => {
		const components = await getBundleComponents(parent.item_code);
		if (!components || !components.length) {
			return;
		}
		parent.is_bundle = 1;
		parent.is_bundle_parent = 1;
		parent.is_stock_item = 0;
		parent.warehouse = null;
		parent.stock_qty = 0;
		parent.bundle_id = context.makeid
			? context.makeid(10)
			: Math.random().toString(36).substr(2, 10);
		// Force update logic is handled by store reactivity usually, but here we modify parent properties.
		// Since 'parent' is reactive from store, changes reflect.

		for (const comp of components) {
			const isStockItem = comp.is_stock_item ?? 1;
			const child = {
				parent_item: parent.item_code,
				bundle_id: parent.bundle_id,
				item_code: comp.item_code,
				item_name: comp.item_name || comp.item_code,
				qty: (parent.qty || 1) * comp.qty,
				stock_qty: (parent.qty || 1) * comp.qty,
				uom: comp.uom,
				rate: 0,
				child_qty_per_bundle: comp.qty,
				warehouse: context.pos_profile.warehouse,
				is_stock_item: isStockItem ? 1 : 0,
				has_batch_no: comp.is_batch,
				has_serial_no: comp.is_serial,
				posa_row_id: context.makeid
					? context.makeid(20)
					: Math.random().toString(36).substr(2, 20),
				posa_offers: JSON.stringify([]),
				posa_offer_applied: 0,
				posa_is_offer: 0,
				_needs_update: true, // Mark for background update
			};
			context.packed_items.push(child);

			// Schedule explicit calc_stock_qty if needed, or rely on update
			calcStockQty(child, child.qty);
		}
		// Trigger background flush if available
		if (context.triggerBackgroundFlush) context.triggerBackgroundFlush();
	};

	return {
		expandBundle,
	};
}
