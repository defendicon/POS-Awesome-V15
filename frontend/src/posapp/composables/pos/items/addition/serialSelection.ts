export function collectUsedSerialsForItem(item: any, context: any) {
	const used = new Set<string>();
	const lines = Array.isArray(context?.items) ? context.items : [];

	lines.forEach((line: any) => {
		if (!line || line.posa_row_id === item?.posa_row_id) return;
		if (line.item_code !== item?.item_code) return;
		if (
			item?.has_batch_no &&
			item?.batch_no &&
			line.batch_no &&
			line.batch_no !== item.batch_no
		) {
			return;
		}

		if (Array.isArray(line.serial_no_selected)) {
			line.serial_no_selected.forEach((serial: any) => {
				const normalized = String(serial || "").trim();
				if (normalized) used.add(normalized);
			});
			return;
		}

		if (line.serial_no) {
			String(line.serial_no)
				.split("\n")
				.map((serial) => String(serial || "").trim())
				.filter(Boolean)
				.forEach((serial) => used.add(serial));
		}
	});

	return used;
}
