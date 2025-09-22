/* global frappe */
import {
        getPrintTemplate,
        getTermsAndConditions,
        memoryInitPromise,
} from "./offline/index.js";
import nunjucks from "nunjucks";

function normaliseTemplate(template) {
        // Nunjucks doesn't understand Python-style triple quotes.
        // Convert any """multiline""" strings to standard JS strings so the
        // renderer can parse templates that include SQL or other blocks.
        if (!template) return template;
        return template.replace(/"""([\s\S]*?)"""/g, (_, str) => {
                const escaped = str
                        .replace(/\\/g, "\\\\")
                        .replace(/"/g, '\\"')
                        .replace(/\r?\n/g, "\\n");
                return `"${escaped}"`;
        });
}

function attachFormatter(obj) {
        if (!obj || typeof obj !== "object" || obj.get_formatted) return;
        // mimic Frappe's get_formatted by returning the raw field value
        obj.get_formatted = function (field) {
                return this?.[field];
        };
}

function defaultOfflineHTMLOld(invoice, terms = "") {
        if (!invoice) return "";

        const itemsRows = (invoice.items || [])
                .map((it) => {
                        const sn = it.serial_no
                                ? `<br><b>SR.No:</b><br>${it.serial_no.replace(/\n/g, ", ")}`
                                : "";
                        const marker =
                                invoice.posa_show_custom_name_marker_on_print && it.name_overridden
                                        ? " (custom)"
                                        : "";
                        return `<tr>
        <td>${it.item_code}${
                                it.item_name && it.item_name !== it.item_code
                                        ? `<br>${it.item_name}${marker}`
                                        : ""
                        }${sn}</td>
        <td style="text-align:right">${it.qty} ${it.uom || ""}<br>@ ${it.rate}</td>
        <td style="text-align:right">${it.amount}</td>
      </tr>`;
                })
                .join("");

        const taxesRows = (invoice.taxes || [])
                .map(
                        (row) => `<tr>
      <td class="text-right" style="width:70%">${row.description}@${row.rate}%</td>
      <td class="text-right">${row.tax_amount}</td>
    </tr>`,
                )
                .join("");

        const discountRow = invoice.discount_amount
                ? `<tr>
      <td class="text-right" style="width:75%">Discount</td>
      <td class="text-right">${invoice.discount_amount}</td>
    </tr>`
                : "";

        const changeRow = invoice.change_amount
                ? `<tr>
      <td class="text-right" style="width:75%">Change Amount</td>
      <td class="text-right">${invoice.change_amount}</td>
    </tr>`
                : "";

        const termsSection = terms
                ? `<div style="margin-top:5px;">${terms}</div>`
                : "";

        return `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>Invoice ${invoice.name || ""}</title>
    <style>
      table, tr, td, div, p { line-height:120%; vertical-align:middle; font-size:10px; }
      .print-format { width:3.5in; padding:0.1in; min-height:7in; }
      .text-right { text-align:right; }
    </style>
  </head>
  <body class="print-format">
    <div style="text-align:center; margin-bottom:0"><h5 style="margin:0; font-size:11px;">${invoice.is_duplicate ? "Duplicate" : "Original"}</h5></div>
    <p style="margin-top:0">
      <b>Invoice Status:</b> ${invoice.status || ""}<br>
      <b>Receipt No:</b> ${invoice.name || ""}<br>
      <b>Customer:</b> ${invoice.customer_name || invoice.customer || ""}<br>
      <b>Mobile:</b> ${invoice.contact_mobile || ""}<br>
      <b>Date:</b> ${invoice.posting_date || ""}
      <b>Time:</b> ${invoice.posting_time || ""}<br>
    </p>
    <p style="margin-top:3px;"><b>Additional Note:</b> <strong>${invoice.posa_notes || ""}</strong></p>
    <table cellpadding="0" cellspacing="0" style="width:100%">
      <thead>
        <tr><th width="50%"><b>Item</b></th><th width="25%" class="text-right"><b>Qty</b></th><th width="25%" class="text-right"><b>Amount</b></th></tr>
      </thead>
      <tbody>${itemsRows}</tbody>
    </table>
    <table cellpadding="0" cellspacing="0" style="width:100%">
      <tbody>
        <tr><td class="text-right" style="width:70%"><b>Total</b></td><td class="text-right">${invoice.total}</td></tr>
        ${taxesRows}
        ${discountRow}
        <tr><td class="text-right" style="width:70%"><b>Grand Total</b></td><td class="text-right">${invoice.grand_total}</td></tr>
        <tr><td class="text-right" style="width:75%"><b>Paid Amount</b></td><td class="text-right">${invoice.paid_amount}</td></tr>
        ${changeRow}
      </tbody>
    </table>
    ${termsSection}
    <p class="text-center" style="margin-top:3px;">Thank you, please visit again.</p>
  </body>
  </html>`;
}

function defaultOfflineHTML(invoice) {
    // Return an empty string if no invoice data is provided.
    if (!invoice) return "";

    let company = {};
    // Try to get the saved company details from localStorage.
    const company_json = localStorage.getItem('pos_offline_company_details');
    if (company_json) {
        try {
            // Parse the JSON string back into an object.
            company = JSON.parse(company_json);
        } catch(e) {
            console.error("Error parsing offline company details:", e);
        }
    }

    const posting_time = new Date().toLocaleTimeString();

    // Format items into table rows.
    const itemsRows = (invoice.items || [])
        .map(
            (item) => `
                <tr>
                    <td>${item.item_name || ""}</td>
                    <td style="text-align: center;">${item.qty || 0}</td>
                    <td style="text-align: center;">${(item.rate || 0)}</td>
                    <td style="text-align: right;">${(item.amount || 0)}</td>
                </tr>`
            )
            .join("");
    
    const paid_amount = invoice.payments && invoice.payments.reduce((sum, p) => sum + p.amount, 0);
    // Format items into table rows.
    const payments = (invoice.payments || [])
        .map(
            (item) => {
                if (item.amount !== 0) {
                    return `
                        <tr>
                            <td>${item.mode_of_payment}</td>
                            <td style="text-align: right;">${item.amount}</td>
                        </tr>`
                }}
            )
            .join("");
    
    // Calculate change amount, ensuring it's not negative.
    const change = (paid_amount || 0) - (invoice.grand_total || 0);
    const changeAmount = (change > 0 ? change : 0.0);

    // The main HTML structure, built using a template literal.
    return `<!DOCTYPE html>
        <html>
            <head>
                <meta charset="utf-8">
                <title>Tax Invoice ${invoice.name || ""}</title>
                <style>
                @media print {
                    @page {
                        size: auto; /* Let the browser decide height based on content */
                        margin: 0;  /* No default margins */
                    }
                    body {
                        margin: 0;
                        padding: 0;
                    }
                    .receipt {
                        width: 300px;
                        font-family: monospace;
                        font-size: 12px;
                        line-height: 1.3;
                        margin: auto;
                        padding-left: 10px;
                        padding-right: 10px;
                    }
                    table, tr, td, th {
                        page-break-inside: avoid; /* Prevent breaking inside rows/tables */
                    }
                    html, body {
                        height: auto !important;
                        overflow: visible !important;
                    }
                }
                /* Added styles for non-print view for better preview */
                body {
                    font-family: monospace;
                }
                .receipt {
                    width: 300px;
                    font-size: 12px;
                    line-height: 1.3;
                    margin: auto;
                    padding: 10px;
                    border: 1px solid #eee;
                }
                </style>
            </head>
            <body>
                <div class="receipt">
                    <div style="text-align: center;">
                        <strong>${invoice.company || ""}</strong><br>
                        ${company.registration_details || ""}<br>
                        Ph: ${company.phone_no || ""}<br>
                        ${company.website || ""}<br>
                        TRN: ${company.tax_id || "N/A"}<br>
                    </div>

                    <hr style="border-top: 1px dashed #000; margin: 6px 0;">

                    <div style="text-align: center; font-weight: bold;">
                            TAX INVOICE / فاتورة ضريبية
                    </div>

                    <table width="100%" style="margin-top: 6px; font-size: 11px;">
                        <tr>
                            <td>Date: ${invoice.posting_date}</td>
                            <td style="text-align: right;">Staff ID: ${invoice.staff_id || "53193"}</td>
                        </tr>
                        <tr>
                            <td>Time: ${posting_time}</td>
                            <td style="text-align: right;">POS ID: ${invoice.pos_profile || "P090B"}</td>
                        </tr>
                        <tr>
                            <td colspan="2">Tax Invoice No.: ${invoice.name || ""}</td>
                        </tr>
                    </table>

                    <hr style="border-top: 1px dashed #000; margin: 6px 0;">

                    <table width="100%" style="font-size: 11px;">
                        <thead>
                            <tr>
                                <th style="text-align: left;">Items</th>
                                <th style="text-align: center;">Qty.</th>
                                <th style="text-align: center;">Price</th>
                                <th style="text-align: right;">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsRows}
                        </tbody>
                    </table>

                    <hr style="border-top: 1px dashed #000; margin: 6px 0;">

                    <div style="text-align: center; font-weight: bold;">INVOICE SUMMARY</div>

                    <table width="100%" style="font-size: 11px; margin-top: 6px;">
                        <tr>
                            <td>Total w/o VAT</td>
                            <td style="text-align: center;">المجموع غير شامل الضريبة</td>
                            <td style="text-align: right;">${(invoice.net_total || 0)}</td>
                        </tr>
                        <tr>
                            <td>VAT</td>
                            <td style="text-align: center;">الضريبة</td>
                            <td style="text-align: right;">${(invoice.total_taxes_and_charges || 0)}</td>
                        </tr>
                        <tr>
                            <td>Total with VAT</td>
                            <td style="text-align: center;">المجموع شامل الضريبة</td>
                            <td style="text-align: right;">${(invoice.grand_total || 0)}</td>
                        </tr>
                    </table>

                    <hr style="border-top: 1px dashed #000; margin: 6px 0;">

                    <table width="100%" style="font-size: 12px;">
                        <tr>
                            <td><strong>Total | المجموع AED</strong></td>
                            <td style="text-align: right;"><strong>${(invoice.grand_total || 0)}</strong></td>
                        </tr>
                        ${payments}
                        ${paid_amount < invoice.grand_total && 
                            `<tr>
                                <td>Credit</td>
                                <td style="text-align: right;">${(invoice.grand_total - paid_amount || 0)}</td>
                            </tr>`
                        }
                        <tr>
                            <td>Change</td>
                            <td style="text-align: right;">${changeAmount}</td>
                        </tr>
                    </table>

                    <p style="margin-top: 6px; font-size: 12px;">
                        Number of Items: ${(invoice.items || []).length}
                    </p>

                    <p style="font-size: 10px; margin-top: 8px;text-align: center">
                        ** For more information on the Terms and Conditions, please visit our website **
                    </p>

                    <hr style="border-top: 1px dashed #000; margin: 6px 0;">
                    <p style="text-align: center; margin-top: 6px; font-size: 11px;">
                        Thank you for shopping with <br><strong>${invoice.company || ""}</strong><br>
                    </p>

                    <div style="text-align: center; margin-top: 10px;">
                        <img src="/files/nesto_qr.png" width="80">
                    </div>
                </div>
            </body>
        </html>`;
}

export default async function renderOfflineInvoiceHTML(invoice) {
    if (!invoice) return "";

    await memoryInitPromise;

    const template = normaliseTemplate(getPrintTemplate());
    const terms = getTermsAndConditions();
    const doc = {
        ...invoice,
        terms: invoice.terms || terms,
        terms_and_conditions: invoice.terms_and_conditions || terms,
    };
    attachFormatter(doc);
    (doc.items || []).forEach(attachFormatter);
    (doc.taxes || []).forEach(attachFormatter);

    if (!template) {
        console.warn("No offline print template cached; using fallback template");
        return defaultOfflineHTML(doc, doc.terms_and_conditions);
    }

    try {
        nunjucks.configure({ autoescape: false });
        const context = {
            doc,
            terms: doc.terms,
            terms_and_conditions: doc.terms_and_conditions,
            _: frappe?._ ? frappe._ : (t) => t,
            frappe: {
                db: { get_value: () => "", sql: () => [] },
                get_list: () => [],
            },
        };
        return nunjucks.renderString(template, context);
    } catch (e) {
        console.error("Failed to render offline invoice", e);
        return defaultOfflineHTML(doc, doc.terms_and_conditions);
    }
}
