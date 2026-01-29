export const buildItemSelectionOption = ({
	item,
	index,
	currency,
	formatCurrency,
	ratePrecision,
	placeholderImage,
}) => {
	const price = formatCurrency(item.rate, currency, ratePrecision(item.rate));
	return `
	<div class="item-option item-selection-option p-3 mb-2 rounded cursor-pointer" data-item-index="${index}">
		<div class="d-flex align-items-center">
			<img
				class="item-selection-image"
				src="${item.image || placeholderImage}"
				alt="${item.item_name}"
			/>
			<div>
				<div class="font-weight-bold">${item.item_name}</div>
				<div class="text-muted small">${item.item_code}</div>
				<div class="text-primary">${price}</div>
			</div>
		</div>
	</div>
	`;
};

export const generateItemSelectionHTML = ({
	items,
	scannedCode,
	currency,
	formatCurrency,
	ratePrecision,
	placeholderImage,
}) => {
	let html = `<div class="mb-3"><strong>Scanned Code:</strong> ${scannedCode}</div>`;
	html += '<div class="item-selection-list">';

	items.forEach((item, index) => {
		html += buildItemSelectionOption({
			item,
			index,
			currency,
			formatCurrency,
			ratePrecision,
			placeholderImage,
		});
	});

	html += "</div>";
	return html;
};

export const openItemSelectionDialog = ({
	items,
	scannedCode,
	currency,
	formatCurrency,
	ratePrecision,
	placeholderImage,
	translate,
	onSelect,
}) => {
	const dialog = new frappe.ui.Dialog({
		title: translate("Multiple Items Found"),
		fields: [
			{
				fieldtype: "HTML",
				fieldname: "items_html",
				options: generateItemSelectionHTML({
					items,
					scannedCode,
					currency,
					formatCurrency,
					ratePrecision,
					placeholderImage,
				}),
			},
		],
		primary_action_label: translate("Cancel"),
		primary_action: () => dialog.hide(),
	});

	dialog.show();

	setTimeout(() => {
		items.forEach((item, index) => {
			const button = dialog.$wrapper.find(`[data-item-index="${index}"]`);
			button.on("click", () => {
				onSelect(item);
				dialog.hide();
			});
		});
	}, 100);

	return dialog;
};
