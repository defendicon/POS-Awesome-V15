import {
	getPrintTemplate,
	getTermsAndConditions,
	memoryInitPromise,
	db,
	checkDbHealth,
} from "./offline/index";
import nunjucks from "nunjucks";

declare const frappe: any;

function normaliseTemplate(template: string) {
	if (!template) return template;
	return template.replace(/"""([\s\S]*?)"""/g, (_, str) => {
		const escaped = str
			.replace(/\\/g, "\\\\")
			.replace(/"/g, '\\"')
			.replace(/\r?\n/g, "\\n");
		return `"${escaped}"`;
	});
}

function attachFormatter(obj: any) {
	if (!obj || typeof obj !== "object" || obj.get_formatted) return;
	obj.get_formatted = function (field: string) {
		return this?.[field];
	};
}

function computePaidAmount(doc: any) {
	if (!doc) return 0;

	const paymentsTotal = (doc.payments || []).reduce(
		(sum: number, p: any) => sum + Math.abs(parseFloat(p.amount) || 0),
		0,
	);

	const creditSale =
		doc.is_credit_sale === true ||
		doc.is_credit_sale === 1 ||
		doc.is_credit_sale === "1" ||
		String(doc.is_credit_sale).toLowerCase() === "yes";

	if (creditSale || paymentsTotal === 0) {
		return 0;
	}

	const base = doc.paid_amount ?? doc.grand_total ?? 0;
	return paymentsTotal || base;
}

// function defaultOfflineHTML(invoice: any, terms = "") {
// 	if (!invoice) return "";

// 	const itemsRows = (invoice.items || [])
// 		.map((it: any) => {
// 			const sn = it.serial_no
// 				? `<div class="serial">SR.No: ${it.serial_no.replace(/\n/g, ", ")}</div>`
// 				: "";
// 			const marker =
// 				invoice.posa_show_custom_name_marker_on_print &&
// 				it.name_overridden
// 					? " (custom)"
// 					: "";
// 			return `<tr>
//                 <td>${it.item_code}${
// 					it.item_name && it.item_name !== it.item_code
// 						? `<div class="item-name">${it.item_name}${marker}</div>`
// 						: ""
// 				}${sn}</td>
//                 <td class="qty">${it.qty} ${it.uom || ""}</td>
//                 <td class="rate">${it.rate}</td>
//                 <td class="amount">${it.amount}</td>
//             </tr>`;
// 		})
// 		.join("");

// 	const taxesRows = (invoice.taxes || [])
// 		.map(
// 			(row: any) => `<tr>
//                 <td style="width:60%">${row.description}@${row.rate}%</td>
//                 <td style="width:40%; text-align:right;">${row.tax_amount}</td>
//             </tr>`,
// 		)
// 		.join("");

// 	const discountRow = invoice.discount_amount
// 		? `<tr>
//                 <td style="width:60%">Discount</td>
//                 <td style="width:40%; text-align:right;">${invoice.discount_amount}</td>
//             </tr>`
// 		: "";

// 	const changeRow = invoice.change_amount
// 		? `<tr>
//                 <td style="width:60%">Change Amount</td>
//                 <td style="width:40%; text-align:right;">${invoice.change_amount}</td>
//             </tr>`
// 		: "";

// 	const termsSection = terms
// 		? `<div class="terms"><strong>Terms & Conditions</strong><div>${terms}</div></div>`
// 		: "";

// 	const paidAmount = computePaidAmount(invoice);

// 	return `<!DOCTYPE html>
// <html>
// <head>
//     <meta charset="utf-8">
//     <title>Invoice ${invoice.name || ""}</title>
//     <style>
//         body { font-family: Arial, sans-serif; width: 80mm; margin: 0 auto; padding: 5mm; }
//         .header { text-align: center; }
//         .header h2 { margin: 0; }
//         .info { margin-bottom: 4px; }
//         .info div { font-size: 12px; line-height: 1.2; }
//         table { width: 100%; border-collapse: collapse; }
//         th, td { font-size: 12px; padding: 4px 0; border-bottom: 1px dashed #ccc; }
//         th { text-align: left; }
//         td.qty, td.rate, td.amount { text-align: right; }
//         table.totals td { border-bottom: none; }
//         .terms { margin-top: 8px; font-size: 10px; }
//         .footer { text-align: center; margin-top: 8px; font-size: 11px; }
//     </style>
// </head>
// <body>
//     <div class="header">
//         <h2>${invoice.company || "Invoice"}</h2>
//         <p><strong>${invoice.is_duplicate ? "Duplicate" : "Original"}</strong></p>
//     </div>
//     <div class="info">
//         <div><strong>Invoice:</strong> ${invoice.name || ""}</div>
//         <div><strong>Date:</strong> ${invoice.posting_date || ""} ${invoice.posting_time || ""}</div>
//         <div><strong>Customer:</strong> ${invoice.customer_name || invoice.customer || ""}</div>
//         <div><strong>Mobile:</strong> ${invoice.contact_mobile || ""}</div>
//         <div><strong>Additional Note:</strong> ${invoice.posa_notes || ""}</div>
//         ${invoice.posa_authorization_code ? `<div><strong>Authorization Code:</strong> ${invoice.posa_authorization_code}</div>` : ""}
//     </div>
//     <table class="items">
//         <thead>
//             <tr>
//                 <th style="width:40%">Item</th>
//                 <th style="width:20%; text-align:right;">Qty</th>
//                 <th style="width:20%; text-align:right;">Rate</th>
//                 <th style="width:20%; text-align:right;">Amt</th>
//             </tr>
//         </thead>
//         <tbody>${itemsRows}</tbody>
//     </table>
//     <table class="totals">
//         <tbody>
//             ${taxesRows}
//             ${discountRow}
//             <tr>
//                 <td style="width:60%"><strong>Total</strong></td>
//                 <td style="width:40%; text-align:right;">${invoice.grand_total}</td>
//             </tr>
//             <tr>
//                 <td style="width:60%">Paid</td>
//                 <td style="width:40%; text-align:right;">${paidAmount}</td>
//             </tr>
//             ${changeRow}
//         </tbody>
//     </table>
//     ${termsSection}
//     <div class="footer">Thank you, please visit again.</div>
// </body>
// </html>`;
// }
async function defaultOfflineHTML(invoice: any, terms = "") {
    if (!invoice) return "";

	let company: Record<string, any> = {}; 
	const company_json = localStorage.getItem('pos_offline_company_details');
	if (company_json) {
		try {
			company = JSON.parse(company_json);
		} catch(e) {
			console.error("Error parsing offline company details:", e);
		}
	}
    // Internal helper for formatting numbers to 2 decimal places
    const fmt = (val: any) => 
        Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const paidAmount = computePaidAmount(invoice);

    const itemsRows = (invoice.items || [])
		.map((item: any, index: number) => {
			let barcode = "";
			// Safely check for it.barcode first, then fallback to it.item_barcode[0].barcode
			barcode = item.barcode || (item.item_barcode && item.item_barcode[0] && item.item_barcode[0].barcode) || "";
            // 2. Wrap it in HTML ONLY if a barcode actually exists
            const barcodeHtml = barcode ? `<br><small>(${barcode})</small>` : "";
			return `<div class="item-line">
				<span style="width: 8%;">${index + 1}</span>
				<span class="name" style="width: 40%;">
					${item.item_name} 
					${barcodeHtml}
				</span>
				<span style="width: 10%; text-align: center;">${Number(item.qty || 0).toFixed(0)}</span>
				<span style="width: 15%; text-align: center;">${fmt(item.rate)}</span>
				<span style="width: 22%; text-align: right;">${fmt(item.amount)}</span>
			</div>`;
		})
		.join("");
	
	console.log("Generated items HTML for offline invoice--------", itemsRows);
    // Calculate Payments safely from the invoice object
    const payments = invoice.payments || [];
    const cashTotal = payments
        .filter((p: any) => p.mode_of_payment === "Cash")
        .reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
    const cardTotal = payments
        .filter((p: any) => ["Credit Card", "Card"].includes(p.mode_of_payment))
        .reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
    const ccsTotal = payments
        .filter((p: any) => p.mode_of_payment === "Customer Credit")
        .reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

    let paymentHtml = "";
    if (cashTotal > 0) paymentHtml += `<div class="summary-line"><span>Cash</span><span>${fmt(cashTotal)}</span></div>`;
    if (cardTotal > 0) paymentHtml += `<div class="summary-line"><span>Card</span><span>${fmt(cardTotal)}</span></div>`;
    if (ccsTotal > 0) paymentHtml += `<div class="summary-line"><span>Customer Credit</span><span>${fmt(ccsTotal)}</span></div>`;
    
    // Fallback if payments array doesn't exist offline but paid amount does
    if (paymentHtml === "" && paidAmount > 0) {
        paymentHtml += `<div class="summary-line"><span>Paid</span><span>${fmt(paidAmount)}</span></div>`;
    }

    const changeAmount = paidAmount - (invoice.grand_total || 0);

    const termsSection = terms
        ? `<hr><div style="font-size: 12px; margin-top: 5px; text-align: left;"><strong>Terms & Conditions</strong><br>${terms}</div>`
        : "";

    // Format Headers Safely
    // const time = invoice.posting_time ? String(invoice.posting_time).substring(0, 8) : "";

	// --- 📅 FORMAT DATE (YYYY-MM-DD to DD-MM-YYYY) ---
    let formattedDate = invoice.posting_date;
    if (formattedDate && typeof formattedDate === "string" && formattedDate.includes("-")) {
        const parts = formattedDate.split("-");
        if (parts.length === 3) {
            formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`; 
        }
    }
    const invNo = invoice.name ? String(invoice.name).split('-').pop() : "";
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Invoice ${invoice.name || ""}</title>
    <style>
        @media print {
            @page { size: auto; margin: 0; }
            body { margin: 0; padding: 0; font-family: monospace; font-size: 12px; }
            .receipt { width: 320px; margin: auto; padding: 0 5px; }
            hr { border-top: 1px dashed #000; margin: 3px 0; }
            .info-block p, .summary-line, .item-line { margin: 0; padding: 0; display: flex; justify-content: space-between; line-height: 1.1; }
            .header-title { text-align: center; font-weight: bold; }
            .item-line span { display: inline-block; white-space: nowrap; }
            .item-line .name { flex: 1; white-space: normal; word-break: break-word; padding: 0 4px; }
            html, body { height: auto !important; overflow: visible !important; }
        }
        
        /* Non-print fallback view styling */
        body { font-family: monospace; font-size: 12px; background-color: #fff; margin: 0; padding: 0; }
        .receipt { width: 320px; margin: 20px auto; padding: 10px 5px; background-color: #fff; }
        hr { border-top: 1px dashed #000; margin: 3px 0; }
        .info-block p, .summary-line, .item-line { margin: 0; padding: 0; display: flex; justify-content: space-between; line-height: 1.1; }
        .header-title { text-align: center; font-weight: bold; }
        .item-line span { display: inline-block; white-space: nowrap; }
        .item-line .name { flex: 1; white-space: normal; word-break: break-word; padding: 0 4px; }
    </style>
</head>
<body>
    <div class="receipt">
        <div style="text-align: center; line-height: 1.1;">
            <strong style="font-size: 14px; font-weight: bold;">${invoice.company || "Company Name"}</strong><br>
            ${company.registration_details || ""}<br>
            Tel: ${company.phone_no || 'N/A'}<br>
            TRN: ${company.tax_id || 'N/A'}
        </div>
        
        <hr>

        <div class="header-title">TAX INVOICE / فاتورة ضريبية</div>

        <div class="info-block" style="margin-top: 2px;">
            <p><span>Date: ${formattedDate}</span><span>Time: ${invoice.posting_time || ""}</span></p>
            <p><span>Staff ID: ${invoice.owner || ""}</span><span>POS ID: ${invoice.pos_profile || ""}</span></p>
            <p><span>Invoice No.: ${invNo}</span></p>
        </div>

        <hr>

        <div class="item-line">
            <span style="width: 8%;"><strong>SL</strong></span>
            <span class="name" style="width: 40%;"><strong>Items</strong></span>
            <span style="width: 10%; text-align: center;"><strong>Qty</strong></span>
            <span style="width: 15%; text-align: center;"><strong>Price</strong></span>
            <span style="width: 22%; text-align: right;"><strong>Amount</strong></span>
        </div>
        <br>
        
        ${itemsRows}

        <hr style="border-top: 1px dashed #000; margin: 6px 0;">

        <div class="header-title">INVOICE SUMMARY</div>

        <div style="margin-top: 2px;">
            <div class="summary-line">
                <span>Total w/o VAT | المجموع غير شامل الضريبة</span>
                <span>${fmt(invoice.net_total)}</span>
            </div>
            <div class="summary-line">
                <span>VAT | الضريبة</span>
                <span>${fmt(invoice.total_taxes_and_charges)}</span>
            </div>
            <div class="summary-line" style="font-weight: bold;">
                <span>Total with VAT | المجموع شامل الضريبة</span>
                <span>${fmt(invoice.grand_total)}</span>
            </div>
        </div>

        <hr>

        <div style="margin-top: 1px;">
            <div class="summary-line" style="font-weight: bold;">
                <span>Total | المجموع AED</span>
                <span>${fmt(invoice.grand_total)}</span>
            </div>
            
            ${paymentHtml}

            <div class="summary-line">
                <span>Change</span>
                <span>${fmt(changeAmount)}</span>
            </div>
        </div>

        <p style="margin-top: 1px; font-size: 12px; text-align: left;">
            Number of Items: ${(invoice.items || []).length}
        </p>

        ${termsSection}
        <hr>  
		<p style="font-size: 12px; text-align: center; line-height: 1.1;">
			Exchange within 7 days with original bill and packing.<br>
			No exchange on under garments.
		</p>
		<p style="text-align: center; margin-top: 2px; font-size: 12px;">
			<strong>Thank you. Come again.</strong>
		</p> 
    </div>
</body>
</html>`; 
}

async function enrichItemsWithBarcodes(items: any[]) {
	if (!items || !items.length) return;
	try {
		await checkDbHealth();
		if (!db.isOpen()) await db.open();
		const itemCodes = items.map((it: any) => it.item_code).filter(Boolean);
		if (!itemCodes.length) return;
		const storedItems: any[] = await db.table("items").where("item_code").anyOf(itemCodes).toArray();
		const map = new Map(storedItems.map((it: any) => [it.item_code, it]));
		items.forEach((item: any) => {
			const hasBarcode = item.barcode || (Array.isArray(item.item_barcode) && item.item_barcode.length);
			if (!hasBarcode) {
				const stored = map.get(item.item_code);
				if (stored) {
					if (Array.isArray(stored.item_barcode) && stored.item_barcode.length) {
						item.item_barcode = stored.item_barcode;
					}
					if (!item.barcode && Array.isArray(stored.barcodes) && stored.barcodes.length) {
						item.barcode = stored.barcodes[0];
					}
				}
			}
		});
	} catch (e) {
		console.error("Failed to enrich items with barcodes", e);
	}
}

export default async function renderOfflineInvoiceHTML(invoice: any) {
	if (!invoice) return "";

	await memoryInitPromise;
	console.log("Rendering offline invoice with data:", invoice);
	console.log("Invoice items:", invoice.items);
	const template = normaliseTemplate(getPrintTemplate());
	const terms = getTermsAndConditions();
	const doc = {
		...invoice,
		terms: invoice.terms || terms,
		terms_and_conditions: invoice.terms_and_conditions || terms,
	};

	doc.paid_amount = computePaidAmount(doc);
	attachFormatter(doc);
	(doc.items || []).forEach(attachFormatter);
	(doc.taxes || []).forEach(attachFormatter);

	// Enrich invoice items with barcode data from the offline items DB if missing
	await enrichItemsWithBarcodes(doc.items || []);

	if (!template) {
		console.warn(
			"No offline print template cached; using fallback template",
		);
		return defaultOfflineHTML(doc, doc.terms_and_conditions);
	}

	try {
		const env = nunjucks.configure({ autoescape: false });
		env.addFilter("format_currency", (value: unknown, currency: string) => {
			const number =
				typeof value === "number" ? value : parseFloat(String(value));
			if (Number.isNaN(number)) return value;
			try {
				return new Intl.NumberFormat(undefined, {
					style: currency ? "currency" : "decimal",
					currency: currency || undefined,
				}).format(number);
			} catch {
				return currency ? `${currency} ${number}` : String(number);
			}
		});
		env.addFilter("currency", (value: unknown, currency: string) =>
			(env as any).filters.format_currency(value, currency),
		);
		(env as any).getFilter = function (name: string) {
			return (this as any).filters[name] || ((v: unknown) => v);
		};

		const context = {
			doc,
			terms: doc.terms,
			terms_and_conditions: doc.terms_and_conditions,
			_: frappe?._ ? frappe._ : (t: string) => t,
			frappe: {
				db: { get_value: () => "", sql: () => [] },
				get_list: () => [],
			},
		};
		return env.renderString(template, context);
	} catch (e) {
		console.error("Failed to render offline invoice", e);
		return defaultOfflineHTML(doc, doc.terms_and_conditions);
	}
}
