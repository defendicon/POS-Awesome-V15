import type { BarcodePrintItem, LabelSize } from "./types";
import { escapeHtml, normalizeLabelQty } from "./utils";

export function getPrintStyles(size: LabelSize): string {
	if (size.type === "A4") {
		const cols = size.cols ?? 3;
		const rows = size.rows ?? 7;
		const availableHeight = 277;
		const totalGapSpace = (rows - 1) * 3;
		const rowHeight = Math.floor((availableHeight - totalGapSpace) / rows);

		return `
          @page { size: A4; margin: 10mm; }
          body { font-family: sans-serif; margin: 0; padding: 0; }
          .label-container {
            display: grid;
            grid-template-columns: repeat(${cols}, 1fr);
            gap: 3mm;
            page-break-after: always;
          }
          .label {
            border: 1px dashed #ccc;
            padding: 5px;
            text-align: center;
            height: ${rowHeight}mm;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            page-break-inside: avoid;
            box-sizing: border-box;
            overflow: hidden;
          }
          .item-name { 
              font-size: 11px; 
              font-weight: bold; 
              overflow: hidden; 
              white-space: nowrap; 
              text-overflow: ellipsis; 
              max-width: 95%;
              margin-bottom: 2px;
          }
          .barcode-container { margin: 2px 0; width: 100%; display: flex; justify-content: center; flex-grow: 1; align-items: center; overflow: hidden; }
          .barcode-text { font-size: 10px; }
          .price { font-size: 11px; font-weight: bold; margin-top: 2px; }
          .batch-serial { font-size: 9px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 95%; }
          img.barcode { max-width: 95%; height: auto; max-height: 100%; object-fit: contain; }
        `;
	}

	const width = size.width ?? 0;
	const height = size.height ?? 0;
	return `
          @page { size: ${width}mm ${height}mm; margin: 0; }
          body { font-family: sans-serif; margin: 0; padding: 0; width: ${width}mm; height: ${height}mm; overflow: hidden; }
          .label {
            width: ${width}mm;
            height: ${height}mm;
            text-align: center;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            page-break-after: always;
            overflow: hidden;
            box-sizing: border-box;
            padding: 1mm;
          }
          .item-name { 
              font-size: 11px; 
              font-weight: bold; 
              white-space: nowrap; 
              overflow: hidden; 
              text-overflow: ellipsis; 
              max-width: 95%; 
              line-height: 1.2; 
              margin-bottom: 2px;
          }
          .barcode-container { 
              flex-grow: 1; 
              display: flex; 
              align-items: center; 
              justify-content: center; 
              width: 100%; 
              overflow: hidden; 
              padding: 2px 0;
          }
          .price { 
              font-size: 11px; 
              font-weight: bold; 
              line-height: 1.2; 
              margin-top: 2px;
          }
          .batch-serial { font-size: 9px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 95%; }
          img.barcode { 
              max-width: 95%; 
              height: auto; 
              max-height: 100%;
              object-fit: contain; 
          }
        `;
}

export function generatePrintContent(
	items: BarcodePrintItem[],
	size: LabelSize,
	options: {
		includePrice: boolean;
		includeBatchSerial: boolean;
		formatCurrency: (_value: number) => string;
	},
): string {
	let html = "";
	if (size.type === "A4") {
		html += '<div class="label-container">';
	}

	items.forEach((item) => {
		const labelsCount = normalizeLabelQty(item.qty);
		const safeItemName = escapeHtml(item.item_name || item.item_code || "");
		const safeBarcode = escapeHtml(item.barcode || "");
		for (let i = 0; i < labelsCount; i++) {
			let batchSerialHtml = "";
			if (options.includeBatchSerial) {
				let text = "";
				if (item.batch_no) text += `Batch: ${item.batch_no} `;
				if (item.serial_no) text += `Serial: ${item.serial_no}`;
				if (!text) {
					if (item.batch_no_data?.length)
						text += `Batch: ${item.batch_no_data[0]?.batch_no || ""} `;
					if (item.serial_no_data?.length)
						text += `Serial: ${item.serial_no_data[0]?.serial_no || ""}`;
				}
				if (text.trim()) {
					batchSerialHtml = `<div class="batch-serial">${escapeHtml(text.trim())}</div>`;
				}
			}

			let priceHtml = "";
			if (options.includePrice) {
				priceHtml = `<div class="price">Price: ${escapeHtml(options.formatCurrency(item.price))}</div>`;
			}

			html += `
            <div class="label">
              <div class="item-name">${safeItemName}</div>
              <div class="barcode-container">
                 <img class="barcode"
                      jsbarcode-format="auto"
                      jsbarcode-value="${safeBarcode}"
                      jsbarcode-textmargin="0"
                      jsbarcode-fontoptions="bold"
                      jsbarcode-height="40"
                      jsbarcode-width="1.5"
                      jsbarcode-displayValue="true"
                      jsbarcode-fontSize="12">
              </div>
              ${batchSerialHtml}
              ${priceHtml}
            </div>
          `;
		}
	});

	if (size.type === "A4") {
		html += "</div>";
	}
	return html;
}

export function buildPrintWindowHtml(
	style: string,
	content: string,
	mode: "print" | "pdf",
	jsPdfOptions?: object,
) {
	if (mode === "print") {
		return `
        <html>
          <head>
            <title>Print Barcodes</title>
            <style>
              ${style}
            </style>
          </head>
          <body>
            ${content}
				<script src="/assets/posawesome/dist/js/libs/JsBarcode.all.min.js"></script>
            <script>
              window.onload = function() {
                JsBarcode(".barcode").init();
                setTimeout(() => {
                    window.print();
                    window.close();
                }, 500);
              }
				</script>
          </body>
        </html>
      `;
	}

	return `
        <html>
          <head>
            <title>Download PDF</title>
            <style>
			              ${style}
			              /* Adjustments for PDF generation if needed */
			            </style>
				<script src="/assets/posawesome/dist/js/libs/html2pdf.bundle.min.js"></script>
				<script src="/assets/posawesome/dist/js/libs/JsBarcode.all.min.js"></script>
          </head>
          <body>
            <div id="print-content">
                ${content}
            </div>
            <script>
              window.onload = function() {
                JsBarcode(".barcode").init();
                
                setTimeout(() => {
                    const element = document.getElementById('print-content');
                    const opt = {
                      margin:       0,
                      filename:     'barcodes.pdf',
                      image:        { type: 'jpeg', quality: 0.98 },
                      html2canvas:  { scale: 2, useCORS: true },
                      jsPDF:        ${JSON.stringify(jsPdfOptions || { unit: "mm", format: "a4", orientation: "portrait" })}
                    };

                    html2pdf().set(opt).from(element).save().then(() => {
                        // Optional: close window after download
                        // window.close();
                    });
                }, 800);
              }
				</script>
          </body>
        </html>
      `;
}
