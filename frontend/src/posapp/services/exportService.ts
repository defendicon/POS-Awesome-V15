import { useToastStore } from "../stores/toastStore";

declare const __: (_str: string, _args?: any[]) => string;

function openExportPopup(): Window | null {
	const win = window.open("", "_blank");
	if (!win) {
		useToastStore().show({ title: __("Popup blocked. Please allow popups."), color: "error" });
		return null;
	}
	return win;
}

function triggerDownload(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

export function exportPng(content: string, style: string, filename = "barcodes.png"): void {
	if (!content) return;
	const win = openExportPopup();
	if (!win) return;

	const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");

	win.document.write(`
<html>
<head>
	<title>${safeFilename}</title>
	<style>${style}</style>
	<script src="/assets/posawesome/dist/js/libs/html2pdf.bundle.min.js"><\/script>
	<script src="/assets/posawesome/dist/js/libs/JsBarcode.all.min.js"><\/script>
</head>
<body>
	<div id="print-content">${content}</div>
	<script>
		window.onload = function() {
			JsBarcode(".barcode").init();
			var checkInterval = setInterval(function() {
				var imgs = document.querySelectorAll('img.barcode');
				if (!imgs.length) { clearInterval(checkInterval); return; }
				var allLoaded = true;
				for (var i = 0; i < imgs.length; i++) {
					if (imgs[i].getAttribute('jsbarcode-format') && !imgs[i].complete) {
						allLoaded = false;
						break;
					}
				}
				if (allLoaded) {
					clearInterval(checkInterval);
					requestAnimationFrame(function() {
						requestAnimationFrame(function() {
							var element = document.getElementById('print-content');
							html2canvas(element, { scale: 2, useCORS: true }).then(function(canvas) {
								canvas.toBlob(function(blob) {
									var url = URL.createObjectURL(blob);
									var a = document.createElement('a');
									a.href = url;
									a.download = '${safeFilename}';
									document.body.appendChild(a);
									a.click();
									document.body.removeChild(a);
									URL.revokeObjectURL(url);
									setTimeout(function() { window.close(); }, 1000);
								}, 'image/png');
							}).catch(function() { window.close(); });
						});
					});
				}
			}, 50);
		}
	<\/script>
</body>
</html>`);
	win.document.close();
}

export function exportSvg(content: string, style: string, filename = "barcodes.svg"): void {
	if (!content) return;
	const win = openExportPopup();
	if (!win) return;

	const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
	const fallbackFilename = safeFilename.replace(/\.svg$/, ".png");

	win.document.write(`
<html>
<head>
	<title>${safeFilename}</title>
	<style>${style}</style>
	<script src="/assets/posawesome/dist/js/libs/html2pdf.bundle.min.js"><\/script>
	<script src="/assets/posawesome/dist/js/libs/JsBarcode.all.min.js"><\/script>
</head>
<body>
	<div id="print-content">${content}</div>
	<script>
		window.onload = function() {
			JsBarcode(".barcode").init();
			var checkInterval = setInterval(function() {
				var imgs = document.querySelectorAll('img.barcode');
				if (!imgs.length) { clearInterval(checkInterval); return; }
				var allLoaded = true;
				for (var i = 0; i < imgs.length; i++) {
					if (imgs[i].getAttribute('jsbarcode-format') && !imgs[i].complete) {
						allLoaded = false;
						break;
					}
				}
				if (allLoaded) {
					clearInterval(checkInterval);
					requestAnimationFrame(function() {
						requestAnimationFrame(function() {
							var element = document.getElementById('print-content');
							html2canvas(element, { scale: 2, useCORS: true }).then(function(canvas) {
								try {
									var dataUrl = canvas.toDataURL('image/png');
									var w = canvas.width;
									var h = canvas.height;
									var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">' +
										'<image width="' + w + '" height="' + h + '" href="' + dataUrl + '"/><\/svg>';
									var blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
									var url = URL.createObjectURL(blob);
									var a = document.createElement('a');
									a.href = url;
									a.download = '${safeFilename}';
									document.body.appendChild(a);
									a.click();
									document.body.removeChild(a);
									URL.revokeObjectURL(url);
								} catch(e) {
									canvas.toBlob(function(blob) {
										var url = URL.createObjectURL(blob);
										var a = document.createElement('a');
										a.href = url;
										a.download = '${fallbackFilename}';
										document.body.appendChild(a);
										a.click();
										document.body.removeChild(a);
										URL.revokeObjectURL(url);
									}, 'image/png');
								}
								setTimeout(function() { window.close(); }, 1000);
							}).catch(function() { window.close(); });
						});
					});
				}
			}, 50);
		}
	<\/script>
</body>
</html>`);
	win.document.close();
}

export function exportCsv(items: any[], filename = "barcodes.csv"): void {
	if (!items.length) return;

	const headers = ["item_code", "item_name", "barcode", "qty", "price", "uom", "batch_no", "serial_no", "warehouse"];

	const escapeCsv = (val: any): string => {
		const str = String(val ?? "");
		if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
			return '"' + str.replace(/"/g, '""') + '"';
		}
		return str;
	};

	const rows = items.map((item) =>
		[
			escapeCsv(item.item_code),
			escapeCsv(item.item_name),
			escapeCsv(item.barcode),
			item.qty || 1,
			item.price || 0,
			escapeCsv(item.uom),
			escapeCsv(item.batch_no || (item.batch_no_data?.[0]?.batch_no) || ""),
			escapeCsv(item.serial_no || (item.serial_no_data?.[0]?.serial_no) || ""),
			escapeCsv(item.warehouseLocation || ""),
		].join(",")
	);

	const csv = "\uFEFF" + headers.join(",") + "\n" + rows.join("\n");
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8;header=present" });
	triggerDownload(blob, filename);
}
