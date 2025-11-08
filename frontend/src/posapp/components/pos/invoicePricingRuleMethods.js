/* global __, frappe, flt */

function parseAppliedRules(value) {
        if (!value) {
                return [];
        }
        if (Array.isArray(value)) {
                return value.filter(Boolean);
        }
        if (typeof value === "string") {
                try {
                        const parsed = JSON.parse(value);
                        if (Array.isArray(parsed)) {
                                return parsed.filter(Boolean);
                        }
                } catch (error) {
                        // Ignore JSON parse failures and treat as comma-separated
                        if (value.includes(",")) {
                                return value
                                        .split(",")
                                        .map((rule) => rule && rule.trim())
                                        .filter(Boolean);
                        }
                }
                return value ? [value] : [];
        }
        return [];
}

export default {
        buildPricingRuleContext() {
                const docType = this.invoiceType === "Quotation"
                        ? "Quotation"
                        : this.invoiceType === "Order" && this.pos_profile.posa_create_only_sales_order
                        ? "Sales Order"
                        : this.pos_profile.create_pos_invoice_instead_of_sales_invoice
                        ? "POS Invoice"
                        : "Sales Invoice";

                const childDoctype = `${docType} Item`;
                const transactionDate = this.posting_date || frappe.datetime.nowdate();
                const currency = this.selected_currency || this.pos_profile.currency;
                const conversionRate = this.conversion_rate || 1;
                const priceListCurrency = this.price_list_currency || currency;
                const plcConversionRate = this.exchange_rate || 1;
                const priceList = this.pos_profile.selling_price_list;

                const items = (this.items || []).map((item) => {
                        const key = item.posa_row_id || item.name || item.item_code;
                        const data = {
                                name: key,
                                item_code: item.item_code,
                                item_name: item.item_name,
                                item_group: item.item_group,
                                brand: item.brand,
                                qty: flt(item.qty),
                                stock_qty: flt(item.stock_qty || item.qty * (item.conversion_factor || 1)),
                                uom: item.uom,
                                stock_uom: item.stock_uom || item.uom,
                                warehouse: item.warehouse || this.pos_profile.warehouse,
                                price_list_rate: flt(item.base_price_list_rate || item.price_list_rate),
                                rate: flt(item.base_rate || item.rate),
                                discount_percentage: flt(item.discount_percentage),
                                discount_amount: flt(item.discount_amount || 0),
                                conversion_factor: flt(item.conversion_factor || 1),
                                serial_no: item.serial_no,
                                batch_no: item.batch_no,
                                pricing_rules: item.pricing_rules || "",
                                is_free_item: item.is_free_item,
                        };
                        return data;
                });

                const appliedRules = this.collectAppliedPricingRules(items);

                const context = {
                        doctype: docType,
                        child_doctype: childDoctype,
                        transaction_date: transactionDate,
                        customer: this.customer || null,
                        customer_group: this.customer_info?.customer_group || this.invoice_doc?.customer_group || null,
                        territory: this.customer_info?.territory || this.invoice_doc?.territory || null,
                        currency,
                        conversion_rate: conversionRate,
                        price_list: priceList,
                        price_list_currency: priceListCurrency,
                        plc_conversion_rate: plcConversionRate,
                        company: this.pos_profile.company,
                        campaign: this.invoice_doc?.campaign || this.pos_profile.campaign || null,
                        sales_partner: this.invoice_doc?.sales_partner || null,
                        ignore_pricing_rule: 0,
                        pos_profile: this.pos_profile.name,
                        coupon_code: this.invoice_doc?.coupon_code || null,
                        is_return: this.isReturnInvoice ? 1 : 0,
                        update_stock: this.invoice_doc?.update_stock || 0,
                        items,
                        applied_pricing_rules: appliedRules,
                        doc: {
                                doctype: docType,
                                company: this.pos_profile.company,
                                customer: this.customer || null,
                                currency,
                                conversion_rate: conversionRate,
                                price_list_currency: priceListCurrency,
                                plc_conversion_rate: plcConversionRate,
                                selling_price_list: priceList,
                                is_return: this.isReturnInvoice ? 1 : 0,
                                items: items.map((item) => ({
                                        doctype: childDoctype,
                                        name: item.name,
                                        item_code: item.item_code,
                                        item_name: item.item_name,
                                        item_group: item.item_group,
                                        brand: item.brand,
                                        qty: item.qty,
                                        stock_qty: item.stock_qty,
                                        uom: item.uom,
                                        stock_uom: item.stock_uom,
                                        warehouse: item.warehouse,
                                        price_list_rate: item.price_list_rate,
                                        rate: item.rate,
                                        discount_percentage: item.discount_percentage,
                                        discount_amount: item.discount_amount,
                                        conversion_factor: item.conversion_factor,
                                        serial_no: item.serial_no,
                                        batch_no: item.batch_no,
                                        pricing_rules: item.pricing_rules,
                                })),
                        },
                };

                return context;
        },

        collectAppliedPricingRules(items = null) {
                const source = Array.isArray(items) ? items : this.items || [];
                const ruleSet = new Set();
                source.forEach((item) => {
                        const values = parseAppliedRules(item.pricing_rules);
                        values.forEach((value) => {
                                if (value) {
                                        ruleSet.add(value);
                                }
                        });
                });
                return Array.from(ruleSet);
        },

        emitPricingRuleCounters(total = null) {
                if (total !== null && total !== undefined) {
                        this._pricingRulesTotal = total;
                }
                const applied = this.collectAppliedPricingRules();
                const effectiveTotal =
                        total !== null && total !== undefined
                                ? total
                                : this._pricingRulesTotal || 0;
                this.eventBus.emit("update_pricing_rules_counters", {
                        pricingRulesCount: effectiveTotal,
                        appliedPricingRulesCount: applied.length,
                });
        },

        handleRequestPricingRuleContext() {
                const context = this.buildPricingRuleContext();
                this.eventBus.emit("pricing_rule_context", context);
        },

        handleApplyPricingRuleUpdates(payload) {
                if (!payload || !Array.isArray(payload.updates)) {
                        return;
                }

                const updates = payload.updates;
                const baseCurrency = this.price_list_currency || this.pos_profile.currency;
                const selectedCurrency = this.selected_currency || baseCurrency;
                const exchangeRate = this.exchange_rate || 1;

                const itemMap = new Map();
                (this.items || []).forEach((item) => {
                        const key = item.posa_row_id || item.name || item.item_code;
                        itemMap.set(key, item);
                });

                updates.forEach((detail) => {
                        const rowId = detail.posa_row_id || detail.child_docname || detail.name || detail.item_code;
                        const item = itemMap.get(rowId);
                        if (!item) {
                                return;
                        }

                        if (detail.pricing_rules !== undefined) {
                                item.pricing_rules = detail.pricing_rules;
                        }
                        if (detail.discount_percentage !== undefined) {
                                item.discount_percentage = flt(detail.discount_percentage);
                        }
                        if (detail.discount_amount !== undefined) {
                                item.discount_amount = flt(detail.discount_amount);
                        }
                        if (detail.price_list_rate !== undefined) {
                                item.base_price_list_rate = flt(detail.price_list_rate);
                        }
                        if (detail.rate !== undefined) {
                                item.base_rate = flt(detail.rate);
                        }
                        if (detail.margin_type !== undefined) {
                                item.margin_type = detail.margin_type;
                        }
                        if (detail.margin_rate_or_amount !== undefined) {
                                item.margin_rate_or_amount = flt(detail.margin_rate_or_amount);
                        }

                        if (selectedCurrency !== baseCurrency) {
                                if (item.base_price_list_rate !== undefined) {
                                        item.price_list_rate = this.flt(
                                                item.base_price_list_rate / exchangeRate,
                                                this.currency_precision,
                                        );
                                }
                                if (item.base_rate !== undefined) {
                                        item.rate = this.flt(item.base_rate / exchangeRate, this.currency_precision);
                                }
                        } else {
                                if (item.base_price_list_rate !== undefined) {
                                        item.price_list_rate = item.base_price_list_rate;
                                }
                                if (item.base_rate !== undefined) {
                                        item.rate = item.base_rate;
                                }
                        }

                        this.calc_item_price(item);
                        item.amount = this.flt(item.qty * item.rate, this.currency_precision);
                        if (item.base_rate !== undefined) {
                                item.base_amount = this.flt(item.qty * item.base_rate, this.currency_precision);
                        }

                        if (detail.free_item_data && detail.free_item_data.length) {
                                this.eventBus.emit("show_message", {
                                        title: __("The selected pricing rule includes free items. Please review them manually."),
                                        color: "warning",
                                });
                        }
                });

                this.$forceUpdate();
        },

        handleResetPricingRules() {
                (this.items || []).forEach((item) => {
                        if (!item) {
                                return;
                        }
                        item.pricing_rules = "";
                        item.discount_percentage = 0;
                        item.discount_amount = 0;
                        if (item.base_price_list_rate !== undefined && item.base_price_list_rate !== null) {
                                item.price_list_rate = item.base_price_list_rate;
                        }
                        if (item.base_rate !== undefined && item.base_rate !== null) {
                                item.rate = item.base_rate;
                        } else {
                                item.rate = item.price_list_rate;
                        }
                        this.calc_item_price(item);
                        item.amount = this.flt(item.qty * item.rate, this.currency_precision);
                        item.base_amount = this.flt(
                                item.qty * (item.base_rate !== undefined ? item.base_rate : item.rate),
                                this.currency_precision,
                        );
                });

                this.$forceUpdate();
        },
};
