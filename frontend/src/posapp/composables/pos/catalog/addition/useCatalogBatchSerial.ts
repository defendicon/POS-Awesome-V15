import { nextTick } from "vue";

declare const frappe: any;
declare const __: (_text: string) => string;

export function useItemBatchSerial() {
	const shouldAutoSetBatch = (context: any, item: any) => {
		if (
			!context?.setBatchQty ||
			!context?.pos_profile?.posa_auto_set_batch
		) {
			return false;
		}
		if (!item?.has_batch_no || item.batch_no) {
			return false;
		}
		return (
			Array.isArray(item.batch_no_data) && item.batch_no_data.length > 0
		);
	};

	const showBatchDialog = (item: any, context: any) => {
		const opts =
			Array.isArray(item.batch_no_data) && item.batch_no_data.length > 0
				? item.batch_no_data
				: null;
		if (opts) {
			const dialog = new frappe.ui.Dialog({
				title: __("Select Batch"),
				fields: [
					{
						fieldtype: "Select",
						fieldname: "batch",
						label: __("Batch"),
						options: opts
							.map((b) => `${b.batch_no} | ${b.batch_qty}`)
							.join("\n"),
						reqd: !context.pos_profile.posa_allow_free_batch_return,
					},
				],
				primary_action_label: __("Select"),
				primary_action(values) {
					const selected = values.batch
						? values.batch.split("|")[0].trim()
						: null;
					context.setBatchQty(item, selected, false);
					dialog.hide();
				},
			});
			dialog.onhide = () => {
				if (!item.batch_no) {
					context.setBatchQty(item, null, false);
				}
			};
			dialog.show();
		} else {
			context.setBatchQty(item, null, false);
		}
	};

	const handleItemExpansion = (item: any, context: any) => {
		if (!item || !context?.pos_profile) {
			return;
		}

		if (
			(!context.pos_profile.posa_auto_set_batch && item.has_batch_no) ||
			item.has_serial_no
		) {
			nextTick(() => {
				if (!item.posa_row_id) {
					return;
				}

				if (Array.isArray(context.expanded)) {
					context.expanded.push(item.posa_row_id);
				} else {
					context.expanded = [item.posa_row_id];
				}
			});
		}
	};

	return {
		shouldAutoSetBatch,
		showBatchDialog,
		handleItemExpansion,
	};
}
