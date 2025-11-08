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

function extractRuleIds(candidate) {
        if (!candidate) {
                return [];
        }
        if (Array.isArray(candidate)) {
                return candidate
                        .flatMap((entry) => extractRuleIds(entry))
                        .map((entry) => entry)
                        .filter(Boolean);
        }
        if (typeof candidate === "object") {
                const ref = candidate.pricing_rule || candidate.name || candidate.rule;
                return extractRuleIds(ref);
        }
        return parseAppliedRules(candidate);
}

function firstAppliedRule(...candidates) {
        for (const candidate of candidates) {
                const parsed = extractRuleIds(candidate);
                if (parsed.length) {
                        return parsed[0];
                }
        }
        return null;
}

export default {
        buildPricingRuleContext() {
                if (!this.pos_profile || typeof this.pos_profile !== "object" || !this.pos_profile.name) {
                        return null;
                }
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

                const transactionType = "selling";
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
                        transaction_type: transactionType,
                        is_pos: 1,
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
                                transaction_type: transactionType,
                                ignore_pricing_rule: 0,
                                is_pos: 1,
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

        rehydratePricingRuleFreebieState(options = {}) {
                const items = Array.isArray(this.items) ? this.items : [];
                if (!items.length) {
                        return;
                }

                const mergeDuplicates = options && options.mergeDuplicates !== false;
                const shouldEmitCounters = options && options.emitCounters !== false;
                const freebiesByKey = new Map();
                const duplicates = [];
                let mutated = false;

                items.forEach((item) => {
                        if (!item || !item.is_free_item) {
                                return;
                        }

                        const parsedRules = parseAppliedRules(item.pricing_rules);
                        const ruleIdRaw = firstAppliedRule(
                                item.posa_pricing_rule_freebie,
                                parsedRules,
                                item.pricing_rule,
                                item.rule,
                                item.applied_pricing_rule,
                                item.applied_pricing_rules,
                        );
                        const ruleId = ruleIdRaw ? `${ruleIdRaw}` : null;
                        if (!ruleId) {
                                return;
                        }

                        if (item.is_free_item !== 1) {
                                item.is_free_item = 1;
                                mutated = true;
                        }

                        if (item.posa_pricing_rule_freebie !== ruleId) {
                                item.posa_pricing_rule_freebie = ruleId;
                                mutated = true;
                        }

                        if (!parsedRules.length || !parsedRules.includes(ruleId)) {
                                item.pricing_rules = JSON.stringify([ruleId]);
                                mutated = true;
                        } else {
                                const serialized = JSON.stringify(parsedRules);
                                if (item.pricing_rules !== serialized) {
                                        item.pricing_rules = serialized;
                                        mutated = true;
                                }
                        }

                        const key = item.posa_pricing_rule_key || this.getPricingRuleFreebieKey(item, ruleId);
                        if (key && item.posa_pricing_rule_key !== key) {
                                item.posa_pricing_rule_key = key;
                                mutated = true;
                        }

                        if (!mergeDuplicates) {
                                return;
                        }

                        const compositeKey = key
                                ? `${ruleId}::${key}`
                                : [
                                          ruleId,
                                          item.item_code || "",
                                          item.batch_no || "",
                                          item.serial_no || "",
                                          item.uom || "",
                                          item.warehouse || "",
                                          item.conversion_factor !== undefined && item.conversion_factor !== null
                                                  ? `${flt(item.conversion_factor) || 1}`
                                                  : "",
                                  ].join("::");

                        const existing = freebiesByKey.get(compositeKey);
                        if (!existing) {
                                freebiesByKey.set(compositeKey, item);
                                return;
                        }

                        if (existing === item) {
                                return;
                        }

                        const qty = flt(existing.qty || 0) + flt(item.qty || 0);
                        const stockQty = flt(existing.stock_qty || 0) + flt(item.stock_qty || 0);
                        if (!Number.isNaN(qty)) {
                                existing.qty = qty;
                                mutated = true;
                        }
                        if (!Number.isNaN(stockQty)) {
                                existing.stock_qty = stockQty;
                                mutated = true;
                        }
                        if (!existing.conversion_factor && item.conversion_factor) {
                                existing.conversion_factor = item.conversion_factor;
                                mutated = true;
                        }
                        if (!existing.batch_no && item.batch_no) {
                                existing.batch_no = item.batch_no;
                                mutated = true;
                        }
                        if (!existing.serial_no && item.serial_no) {
                                existing.serial_no = item.serial_no;
                                mutated = true;
                        }
                        if (!existing.warehouse && item.warehouse) {
                                existing.warehouse = item.warehouse;
                                mutated = true;
                        }

                        existing.amount = this.flt(existing.qty * (existing.rate || 0), this.currency_precision);
                        const baseRate =
                                existing.base_rate !== undefined && existing.base_rate !== null
                                        ? existing.base_rate
                                        : existing.rate || 0;
                        existing.base_amount = this.flt(existing.qty * baseRate, this.currency_precision);
                        if (typeof this.calc_item_price === "function") {
                                this.calc_item_price(existing);
                        }

                        duplicates.push(item);
                });

                if (mergeDuplicates && duplicates.length && typeof this.remove_item === "function") {
                        duplicates.forEach((item) => this.remove_item(item));
                        mutated = true;
                }

                if (mutated) {
                        if (typeof this.$forceUpdate === "function") {
                                this.$forceUpdate();
                        }
                        if (shouldEmitCounters && typeof this.emitPricingRuleCounters === "function") {
                                this.emitPricingRuleCounters();
                        }
                } else if (options && options.emitCounters === true && typeof this.emitPricingRuleCounters === "function") {
                        this.emitPricingRuleCounters();
                }
        },

        handleRequestPricingRuleContext() {
                if (!this.pos_profile || typeof this.pos_profile !== "object" || !this.pos_profile.name) {
                        this.pricingRuleContextPending = true;
                        return;
                }
                const context = this.buildPricingRuleContext();
                if (!context) {
                        this.pricingRuleContextPending = true;
                        return;
                }
                this.pricingRuleContextPending = false;
                this.eventBus.emit("pricing_rule_context", context);
        },

        async handleApplyPricingRuleUpdates(payload) {
                if (!payload) {
                        return;
                }

                const updates = Array.isArray(payload.updates) ? payload.updates : [];
                const baseActiveRules = Array.isArray(payload.active_rule_ids)
                        ? payload.active_rule_ids
                        : [];
                const touchedRuleIds = new Set(
                        baseActiveRules
                                .map((ruleId) => (ruleId !== undefined && ruleId !== null ? `${ruleId}` : null))
                                .filter(Boolean),
                );
                const baseCurrency = this.price_list_currency || this.pos_profile.currency;
                const selectedCurrency = this.selected_currency || baseCurrency;
                const exchangeRate = this.exchange_rate || 1;
                const requestedRuleRaw = firstAppliedRule(payload?.pricing_rule);
                const requestedRule = requestedRuleRaw ? `${requestedRuleRaw}` : null;
                const shouldCleanupInactive = payload?.pricing_rule
                        ? payload.cleanup_inactive === true
                        : true;

                const itemMap = new Map();
                (this.items || []).forEach((item) => {
                        const key = item.posa_row_id || item.name || item.item_code;
                        itemMap.set(key, item);
                });

                const freebiesByRule = new Map();
                this._pricingRuleOriginals =
                        this._pricingRuleOriginals instanceof WeakMap ? this._pricingRuleOriginals : new WeakMap();

                updates.forEach((detail) => {
                        const rowId = detail.posa_row_id || detail.child_docname || detail.name || detail.item_code;
                        const item = itemMap.get(rowId);
                        if (!item) {
                                return;
                        }

                        if (!this._pricingRuleOriginals.has(item)) {
                                this._pricingRuleOriginals.set(item, {
                                        base_price_list_rate: item.base_price_list_rate,
                                        base_rate: item.base_rate,
                                        price_list_rate: item.price_list_rate,
                                        rate: item.rate,
                                        discount_percentage: item.discount_percentage,
                                        discount_amount: item.discount_amount,
                                });
                        }

                        const detailRuleIds = extractRuleIds(
                                detail.pricing_rule,
                                detail.pricing_rules,
                                detail.pricing_rule_name,
                                detail.rule,
                                detail.applied_pricing_rule,
                                detail.applied_pricing_rules,
                        );
                        detailRuleIds.forEach((ruleId) => {
                                if (ruleId) {
                                        touchedRuleIds.add(`${ruleId}`);
                                }
                        });

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
                        if (detail.is_free_item !== undefined) {
                                item.is_free_item = detail.is_free_item ? 1 : 0;
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

                        if (detail.free_item_data) {
                                let ruleId = firstAppliedRule(
                                        detail.pricing_rule,
                                        detail.pricing_rules,
                                        detail.pricing_rule_name,
                                        detail.rule,
                                        detail.free_item_data,
                                        payload.pricing_rule,
                                );
                                if (requestedRule) {
                                        const normalisedRuleId = ruleId ? `${ruleId}` : null;
                                        if (normalisedRuleId && normalisedRuleId !== requestedRule) {
                                                return;
                                        }
                                        ruleId = normalisedRuleId || requestedRule;
                                }
                                if (ruleId && !freebiesByRule.has(ruleId)) {
                                        freebiesByRule.set(ruleId, []);
                                }
                                if (ruleId) {
                                        const existing = freebiesByRule.get(ruleId) || [];
                                        const dataArray = Array.isArray(detail.free_item_data)
                                                ? detail.free_item_data
                                                : [];
                                        dataArray.forEach((entry) => {
                                                if (!entry) {
                                                        return;
                                                }
                                                existing.push({
                                                        ...entry,
                                                        source_row:
                                                                detail.posa_row_id ||
                                                                detail.child_docname ||
                                                                detail.name ||
                                                                detail.item_code,
                                                });
                                        });
                                        freebiesByRule.set(ruleId, existing);
                                }
                        }
                });

                if (requestedRule && !freebiesByRule.has(requestedRule)) {
                        freebiesByRule.set(requestedRule, []);
                }

                if (requestedRule) {
                        touchedRuleIds.add(requestedRule);
                }

                for (const [ruleId, freebies] of freebiesByRule.entries()) {
                        try {
                                await this.syncFreeItemsForPricingRule(ruleId, freebies);
                        } catch (error) {
                                console.error("Failed to synchronise free items for pricing rule", ruleId, error);
                        }
                }

                if (shouldCleanupInactive) {
                        this.cleanupInactivePricingRules(touchedRuleIds);
                }

                this.$forceUpdate();
                this.emitPricingRuleCounters();
        },

        cleanupInactivePricingRules(activeRuleIds = new Set(), options = {}) {
                const activeSet = activeRuleIds instanceof Set
                        ? new Set(Array.from(activeRuleIds).map((id) => `${id}`))
                        : new Set(
                                  (Array.isArray(activeRuleIds) ? activeRuleIds : [])
                                          .map((id) => (id !== undefined && id !== null ? `${id}` : null))
                                          .filter(Boolean),
                          );
                const shouldEmit = Boolean(options.emitCounters);

                const previouslyApplied = this.collectAppliedPricingRules();
                previouslyApplied.forEach((ruleId) => {
                        if (!activeSet.has(`${ruleId}`)) {
                                this.removePricingRuleFreeItems(ruleId);
                        }
                });

                (this.items || []).forEach((item) => {
                        if (!item) {
                                return;
                        }

                        const applied = parseAppliedRules(item.pricing_rules);
                        if (!applied.length) {
                                return;
                        }

                        const stillActive = applied.filter((ruleId) => activeSet.has(`${ruleId}`));

                        if (stillActive.length) {
                                item.pricing_rules = JSON.stringify(stillActive);
                                return;
                        }

                        item.pricing_rules = "";
                        const originalsMap = this._pricingRuleOriginals instanceof WeakMap ? this._pricingRuleOriginals : null;
                        const original = originalsMap ? originalsMap.get(item) : null;
                        const hasOriginal = original && typeof original === "object";

                        if (hasOriginal) {
                                if (original.base_price_list_rate !== undefined && original.base_price_list_rate !== null) {
                                        item.base_price_list_rate = original.base_price_list_rate;
                                }
                                if (original.base_rate !== undefined && original.base_rate !== null) {
                                        item.base_rate = original.base_rate;
                                }
                                if (original.price_list_rate !== undefined && original.price_list_rate !== null) {
                                        item.price_list_rate = original.price_list_rate;
                                }
                                if (original.rate !== undefined && original.rate !== null) {
                                        item.rate = original.rate;
                                } else if (original.base_rate !== undefined && original.base_rate !== null) {
                                        item.rate = original.base_rate;
                                }
                                item.discount_percentage =
                                        original.discount_percentage !== undefined &&
                                        original.discount_percentage !== null
                                                ? original.discount_percentage
                                                : 0;
                                item.discount_amount =
                                        original.discount_amount !== undefined && original.discount_amount !== null
                                                ? original.discount_amount
                                                : 0;
                        } else {
                                item.discount_percentage = 0;
                                item.discount_amount = 0;

                                if (item.base_price_list_rate !== undefined && item.base_price_list_rate !== null) {
                                        item.price_list_rate = item.base_price_list_rate;
                                }
                                if (item.base_rate !== undefined && item.base_rate !== null) {
                                        item.rate = item.base_rate;
                                } else if (item.price_list_rate !== undefined && item.price_list_rate !== null) {
                                        item.rate = item.price_list_rate;
                                        item.base_rate = item.price_list_rate;
                                }
                        }

                        this.calc_item_price(item);
                        item.amount = this.flt(item.qty * item.rate, this.currency_precision);
                        item.base_amount = this.flt(
                                item.qty * (item.base_rate !== undefined && item.base_rate !== null ? item.base_rate : item.rate),
                                this.currency_precision,
                        );
                        if (originalsMap) {
                                originalsMap.delete(item);
                        }
                });

                if (shouldEmit) {
                        this.emitPricingRuleCounters();
                }
        },

        handleResetPricingRules() {
                if (typeof this.remove_item === "function") {
                        const freebies = (this.items || []).filter(
                                (item) => item && item.is_free_item && item.posa_pricing_rule_freebie,
                        );
                        freebies.forEach((item) => {
                                this.remove_item(item);
                        });
                }

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

                this._pricingRuleOriginals = new WeakMap();

                this.$forceUpdate();
                this.emitPricingRuleCounters();
        },

        removePricingRuleFreeItems(ruleId) {
                if (!ruleId || typeof this.remove_item !== "function") {
                        return;
                }
                const removable = (this.items || []).filter(
                        (item) => item && item.is_free_item && item.posa_pricing_rule_freebie === ruleId,
                );
                removable.forEach((item) => {
                        this.remove_item(item);
                });
        },

        isPricingRuleRefreshSuppressed() {
                return Number.isFinite(this._pricingRuleRefreshSuppressCount)
                        ? this._pricingRuleRefreshSuppressCount > 0
                        : false;
        },

        suppressPricingRuleRefresh() {
                const count = Number.isFinite(this._pricingRuleRefreshSuppressCount)
                        ? this._pricingRuleRefreshSuppressCount
                        : 0;
                this._pricingRuleRefreshSuppressCount = count + 1;
        },

        resumePricingRuleRefresh(options = {}) {
                const { cancelPending = false, flushPending = true } = options || {};
                const count = Number.isFinite(this._pricingRuleRefreshSuppressCount)
                        ? this._pricingRuleRefreshSuppressCount
                        : 0;

                if (count > 0) {
                        this._pricingRuleRefreshSuppressCount = count - 1;
                } else {
                        this._pricingRuleRefreshSuppressCount = 0;
                }

                if (this.isPricingRuleRefreshSuppressed()) {
                        return;
                }

                if (cancelPending) {
                        this.cancelScheduledPricingRuleRefresh();
                        this._pricingRuleRefreshRequestedDuringSuppression = false;
                        this._pricingRuleRefreshSuppressedRows = null;
                        return;
                }

                const shouldFlush = flushPending !== false && this._pricingRuleRefreshRequestedDuringSuppression;
                const suppressedRows = this._pricingRuleRefreshSuppressedRows;
                this._pricingRuleRefreshRequestedDuringSuppression = false;
                this._pricingRuleRefreshSuppressedRows = null;

                if (shouldFlush) {
                        const rowIds = Array.isArray(suppressedRows)
                                ? suppressedRows
                                : suppressedRows instanceof Set
                                ? Array.from(suppressedRows)
                                : [];
                        this.schedulePricingRuleRefresh(rowIds);
                }
        },

        schedulePricingRuleRefresh(changedRowIds = []) {
                if (typeof changedRowIds === "boolean") {
                        changedRowIds = [];
                } else if (changedRowIds && typeof changedRowIds === "object" && !Array.isArray(changedRowIds)) {
                        const options = changedRowIds || {};
                        changedRowIds = Array.isArray(options.rowIds) ? options.rowIds : [];
                }

                if (this.isPricingRuleRefreshSuppressed()) {
                        this._pricingRuleRefreshRequestedDuringSuppression = true;
                        if (Array.isArray(changedRowIds) && changedRowIds.length) {
                                const existing = this._pricingRuleRefreshSuppressedRows;
                                if (existing instanceof Set) {
                                        changedRowIds.forEach((id) => existing.add(id));
                                } else {
                                        this._pricingRuleRefreshSuppressedRows = new Set(changedRowIds);
                                }
                        }
                        return;
                }

                if (this._pricingRuleAutoApplying) {
                        this._pricingRuleRefreshRequested = true;
                        return;
                }

                if (this._pricingRuleRefreshPending) {
                        return;
                }

                this._pricingRuleRefreshPending = true;
                const scheduler =
                        typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
                                ? window.requestAnimationFrame.bind(window)
                                : (cb) => setTimeout(cb, 16);

                this._pricingRuleRefreshHandle = scheduler(() => {
                        this._pricingRuleRefreshHandle = null;
                        this._pricingRuleRefreshPending = false;
                        this.processPendingPricingRuleRefresh();
                });
        },

        cancelScheduledPricingRuleRefresh() {
                if (this._pricingRuleRefreshHandle != null) {
                        if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
                                window.cancelAnimationFrame(this._pricingRuleRefreshHandle);
                        } else {
                                clearTimeout(this._pricingRuleRefreshHandle);
                        }
                        this._pricingRuleRefreshHandle = null;
                }

                this._pricingRuleRefreshPending = false;
                this._pricingRuleRefreshRequested = false;
                this._pricingRuleRefreshRequestedDuringSuppression = false;
                this._pricingRuleRefreshSuppressedRows = null;
        },

        async processPendingPricingRuleRefresh() {
                if (this.isPricingRuleRefreshSuppressed()) {
                        this._pricingRuleRefreshRequestedDuringSuppression = true;
                        return;
                }

                if (this._pricingRuleAutoApplying) {
                        this._pricingRuleRefreshRequested = true;
                        return;
                }

                const context = this.buildPricingRuleContext();
                if (!context || !this.pos_profile || !this.pos_profile.name) {
                        return;
                }

                const items = Array.isArray(context.items) ? context.items : [];
                if (!items.length) {
                        if (this._pricingRuleOriginals instanceof WeakMap) {
                                this._pricingRuleOriginals = new WeakMap();
                        }
                        this.cleanupInactivePricingRules(new Set(), { emitCounters: true });
                        this.$forceUpdate();
                        return;
                }

                this._pricingRuleAutoApplying = true;

                try {
                        const { message } = await frappe.call({
                                method: "posawesome.posawesome.api.pricing_rules.auto_apply_pos_pricing_rules",
                                args: { context: JSON.stringify(context) },
                        });

                        const response = message || {};
                        const updates = Array.isArray(response.updates) ? response.updates : [];
                        const activeRules = Array.isArray(response.active_pricing_rules)
                                ? response.active_pricing_rules
                                : [];

                        await this.handleApplyPricingRuleUpdates({
                                updates,
                                active_rule_ids: activeRules,
                        });
                } catch (error) {
                        console.error("Failed to auto apply pricing rules", error);
                } finally {
                        this._pricingRuleAutoApplying = false;
                }

                if (this._pricingRuleRefreshRequested) {
                        this._pricingRuleRefreshRequested = false;
                        this.schedulePricingRuleRefresh();
                }
        },

        async syncFreeItemsForPricingRule(ruleId, freebies = []) {
                if (!ruleId) {
                        return;
                }

                const aggregatedFreebies = this.aggregatePricingRuleFreebies(ruleId, freebies);

                const existingItems = (this.items || []).filter(
                        (item) => item && item.is_free_item && item.posa_pricing_rule_freebie === ruleId,
                );

                if (!aggregatedFreebies.length) {
                        if (typeof this.remove_item === "function") {
                                existingItems.forEach((item) => this.remove_item(item));
                        }
                        return;
                }

                const existingByKey = new Map();
                existingItems.forEach((item) => {
                        const key =
                                item.posa_pricing_rule_key || this.getPricingRuleFreebieKey(item, ruleId);
                        if (!key) {
                                return;
                        }

                        if (!existingByKey.has(key)) {
                                existingByKey.set(key, []);
                        }

                        existingByKey.get(key).push(item);
                });

                const retainedKeys = new Set();

                for (const detail of aggregatedFreebies) {
                        const key =
                                detail.posa_pricing_rule_key || this.getPricingRuleFreebieKey(detail, ruleId);
                        if (!key) {
                                continue;
                        }

                        const existingCandidates = existingByKey.get(key) || [];
                        const existingItem = existingCandidates.length ? existingCandidates[0] : null;
                        if (existingItem) {
                                try {
                                        this.updateFreeItemFromPricingRule(existingItem, detail, ruleId);
                                        retainedKeys.add(key);
                                } catch (error) {
                                        console.error("Failed to update free item from pricing rule", ruleId, error);
                                }
                                continue;
                        }

                        try {
                                await this.addFreeItemFromPricingRule(ruleId, detail);
                                retainedKeys.add(key);
                        } catch (error) {
                                console.error("Failed to add free item from pricing rule", ruleId, error);
                        }
                }

                if (typeof this.remove_item === "function" && existingByKey.size) {
                        existingByKey.forEach((items, key) => {
                                const shouldRetain = retainedKeys.has(key);

                                items.forEach((item, index) => {
                                        if (!shouldRetain || index > 0) {
                                                this.remove_item(item);
                                        }
                                });
                        });
                }
        },

        aggregatePricingRuleFreebies(ruleId, freebies = []) {
                if (!Array.isArray(freebies) || !freebies.length) {
                        return [];
                }

                const groups = new Map();

                freebies.forEach((candidate) => {
                        const normalized = this.normalizePricingRuleFreebie(ruleId, candidate);
                        if (!normalized) {
                                return;
                        }

                        const { key, detail, qty, stockQty } = normalized;
                        if (!groups.has(key)) {
                                groups.set(key, {
                                        detail,
                                        qty,
                                        stockQty,
                                        key,
                                });
                                return;
                        }

                        const entry = groups.get(key);
                        entry.qty += qty;

                        const nextStock =
                                (Number.isFinite(entry.stockQty) ? entry.stockQty : 0) +
                                (Number.isFinite(stockQty) ? stockQty : 0);
                        entry.stockQty = nextStock || entry.qty * (entry.detail.conversion_factor || 1);

                        entry.detail = {
                                ...entry.detail,
                                qty: entry.qty,
                        };

                        entry.key = key;

                        if (entry.detail.quantity !== undefined) {
                                entry.detail.quantity = entry.qty;
                        }
                        if (entry.detail.free_qty !== undefined) {
                                entry.detail.free_qty = entry.qty;
                        }

                        const effectiveStock = entry.stockQty;
                        if (entry.detail.stock_qty !== undefined) {
                                entry.detail.stock_qty = effectiveStock;
                        }
                        if (entry.detail.free_stock_qty !== undefined) {
                                entry.detail.free_stock_qty = effectiveStock;
                        }
                });

                return Array.from(groups.values()).map(({ detail, qty, stockQty, key }) => {
                        const aggregated = {
                                ...detail,
                                qty,
                        };

                        const detailKey = detail.posa_pricing_rule_key || key;
                        if (detailKey) {
                                aggregated.posa_pricing_rule_key = detailKey;
                        }

                        if (aggregated.quantity !== undefined) {
                                aggregated.quantity = qty;
                        }
                        if (aggregated.free_qty !== undefined) {
                                aggregated.free_qty = qty;
                        }

                        const effectiveStock =
                                Number.isFinite(stockQty) && stockQty !== null
                                        ? stockQty
                                        : qty * (aggregated.conversion_factor || 1);

                        aggregated.stock_qty = effectiveStock;
                        if (aggregated.free_stock_qty !== undefined) {
                                aggregated.free_stock_qty = effectiveStock;
                        }

                        return aggregated;
                });
        },

        normalizePricingRuleFreebie(ruleId, detail) {
                if (!detail) {
                        return null;
                }

                const itemCode =
                        detail.item_code || detail.free_item_code || detail.free_item || detail.item_code;
                if (!itemCode) {
                        return null;
                }

                const rawQty =
                        detail.qty !== undefined && detail.qty !== null
                                ? detail.qty
                                : detail.free_qty !== undefined && detail.free_qty !== null
                                ? detail.free_qty
                                : detail.quantity !== undefined && detail.quantity !== null
                                ? detail.quantity
                                : 0;

                const qty = Math.abs(flt(rawQty || 0));
                if (!qty) {
                        return null;
                }

                const conversionFactorRaw =
                        detail.conversion_factor !== undefined && detail.conversion_factor !== null
                                ? detail.conversion_factor
                                : detail.free_conversion_factor !== undefined && detail.free_conversion_factor !== null
                                ? detail.free_conversion_factor
                                : null;
                const conversionFactor = conversionFactorRaw ? flt(conversionFactorRaw) || 1 : 1;

                const stockCandidate =
                        detail.stock_qty !== undefined && detail.stock_qty !== null
                                ? detail.stock_qty
                                : detail.free_stock_qty !== undefined && detail.free_stock_qty !== null
                                ? detail.free_stock_qty
                                : null;
                const stockQty = stockCandidate !== null ? flt(stockCandidate) : qty * conversionFactor;

                const batchNo = detail.batch_no || detail.free_batch_no || "";
                const serialNo = detail.serial_no || detail.free_serial_no || "";
                const sourceRow =
                        detail.source_row ||
                        detail.child_docname ||
                        detail.parent_detail_docname ||
                        detail.posa_row_id ||
                        "";
                const warehouse = detail.warehouse || detail.free_warehouse || "";
                const uom = detail.uom || detail.free_uom || detail.stock_uom || "";
                const stockUom = detail.stock_uom || detail.free_stock_uom || uom || "";

                const normalizedDetail = {
                        ...detail,
                        item_code: itemCode,
                        qty,
                        stock_qty: stockQty,
                        conversion_factor: conversionFactor,
                };

                const key = this.getPricingRuleFreebieKey(
                        {
                                ...normalizedDetail,
                                item_code: itemCode,
                                qty,
                                stock_qty: stockQty,
                                conversion_factor: conversionFactor,
                        },
                        ruleId,
                );
                if (key) {
                        normalizedDetail.posa_pricing_rule_key = key;
                }

                if (detail.quantity !== undefined) {
                        normalizedDetail.quantity = qty;
                }
                if (detail.free_qty !== undefined) {
                        normalizedDetail.free_qty = qty;
                }
                if (detail.free_stock_qty !== undefined) {
                        normalizedDetail.free_stock_qty = stockQty;
                }
                if (detail.free_conversion_factor !== undefined) {
                        normalizedDetail.free_conversion_factor = conversionFactor;
                }
                if (uom) {
                        normalizedDetail.uom = uom;
                }
                if (stockUom) {
                        normalizedDetail.stock_uom = stockUom;
                }
                if (batchNo) {
                        normalizedDetail.batch_no = batchNo;
                }
                if (serialNo) {
                        normalizedDetail.serial_no = serialNo;
                }
                if (warehouse) {
                        normalizedDetail.warehouse = warehouse;
                }
                if (sourceRow) {
                        normalizedDetail.source_row = sourceRow;
                        normalizedDetail.posa_pricing_rule_source_row = sourceRow;
                }

                return {
                        key,
                        detail: normalizedDetail,
                        qty,
                        stockQty,
                        conversionFactor,
                };
        },

        getPricingRuleFreebieKey(detail = {}, ruleId = "") {
                if (!detail) {
                        return "";
                }

                const itemCode =
                        detail.item_code || detail.free_item_code || detail.free_item || detail.item_code;
                if (!itemCode) {
                        return "";
                }

                const batchNo = detail.batch_no || detail.free_batch_no || "";
                const serialNo = detail.serial_no || detail.free_serial_no || "";
                const uom = detail.uom || detail.free_uom || detail.stock_uom || "";
                const warehouse = detail.warehouse || detail.free_warehouse || "";
                const conversionFactorRaw =
                        detail.conversion_factor !== undefined && detail.conversion_factor !== null
                                ? detail.conversion_factor
                                : detail.free_conversion_factor !== undefined && detail.free_conversion_factor !== null
                                ? detail.free_conversion_factor
                                : null;
                const conversionFactor = conversionFactorRaw ? flt(conversionFactorRaw) || 1 : 1;

                const resolvedRuleId =
                        firstAppliedRule(
                                ruleId,
                                detail.posa_pricing_rule_freebie,
                                detail.pricing_rule,
                                detail.rule,
                                detail.pricing_rules,
                        ) || "";

                const parts = [
                        resolvedRuleId || "",
                        itemCode,
                        batchNo || "",
                        serialNo || "",
                        uom || "",
                        warehouse || "",
                        `${conversionFactor || 1}`,
                ];

                return parts.join("::");
        },

        async addFreeItemFromPricingRule(ruleId, detail) {
                if (!ruleId || !detail || !detail.item_code) {
                        return null;
                }

                const quantity = flt(detail.qty || detail.free_qty || detail.quantity || 0);
                const qty = quantity ? Math.abs(quantity) : 0;
                if (!qty) {
                        return null;
                }

                const rawStockQty =
                        detail.stock_qty !== undefined ? detail.stock_qty : detail.free_stock_qty || detail.stock_qty;
                const stockQtyValue = rawStockQty !== undefined ? flt(rawStockQty) : null;
                const conversionFactorRaw = detail.conversion_factor || detail.free_conversion_factor;
                const conversionFactor = conversionFactorRaw ? flt(conversionFactorRaw) || 1 : 1;
                const stockQty = stockQtyValue !== null ? stockQtyValue : qty * conversionFactor;

                const beforeIds = new Set(
                        (this.items || [])
                                .filter((item) => item && item.posa_pricing_rule_freebie === ruleId)
                                .map((item) => item.posa_row_id),
                );

                const key = detail.posa_pricing_rule_key || this.getPricingRuleFreebieKey(detail, ruleId);

                let baseItem = null;
                if (typeof this.resolveOfferItem === "function") {
                        try {
                                baseItem = await this.resolveOfferItem(detail.item_code);
                        } catch (error) {
                                console.error("Failed to resolve pricing rule free item", detail.item_code, error);
                        }
                }

                const payload = baseItem ? { ...baseItem } : { item_code: detail.item_code };
                payload.item_name =
                        detail.item_name || detail.free_item_name || payload.item_name || detail.item_code;
                payload.description = detail.description || payload.description || payload.item_name;
                payload.qty = qty;
                payload.stock_qty = stockQty;
                payload.uom = detail.uom || payload.uom || detail.stock_uom || payload.stock_uom;
                payload.stock_uom = detail.stock_uom || payload.stock_uom || payload.uom;
                payload.conversion_factor = conversionFactor || 1;
                payload.warehouse = detail.warehouse || payload.warehouse || this.pos_profile?.warehouse;

                const baseRate = flt(
                        detail.rate !== undefined
                                ? detail.rate
                                : detail.base_rate !== undefined
                                ? detail.base_rate
                                : 0,
                );
                const baseCurrency = this.price_list_currency || this.pos_profile.currency;
                const exchangeRate = this.exchange_rate || 1;
                const isForeignCurrency = this.selected_currency && baseCurrency && this.selected_currency !== baseCurrency;
                const displayRate = isForeignCurrency
                        ? this.flt(baseRate * exchangeRate, this.currency_precision)
                        : baseRate;

                payload.base_rate = baseRate;
                payload.base_price_list_rate = baseRate;
                payload.rate = displayRate;
                payload.price_list_rate = displayRate;
                payload.discount_amount = 0;
                payload.discount_percentage = 0;
                payload.pricing_rules = JSON.stringify([ruleId]);
                payload.posa_is_offer = 1;
                payload.posa_is_replace = payload.posa_is_replace || "";
                payload.is_free_item = 1;
                payload.posa_pricing_rule_freebie = ruleId;
                payload.posa_pricing_rule_source_row =
                        detail.source_row || detail.child_docname || detail.parent_detail_docname || null;
                if (key) {
                        payload.posa_pricing_rule_key = key;
                }

                if (detail.batch_no) {
                        payload.batch_no = detail.batch_no;
                        payload.has_batch_no = 1;
                }
                if (detail.serial_no) {
                        payload.serial_no = detail.serial_no;
                }

                const originalNewLine = this.new_line;
                try {
                        this.new_line = true;
                        await this.add_item(payload, { skipNotification: true });
                } finally {
                        this.new_line = originalNewLine;
                }

                const addedItem = (this.items || []).find((item) => {
                        if (!item || item.posa_pricing_rule_freebie !== ruleId) {
                                return false;
                        }
                        if (beforeIds.has(item.posa_row_id)) {
                                return false;
                        }
                        if (payload.posa_pricing_rule_source_row) {
                                return item.posa_pricing_rule_source_row === payload.posa_pricing_rule_source_row;
                        }
                        return true;
                });

                if (addedItem) {
                        addedItem.is_free_item = 1;
                        addedItem.pricing_rules = JSON.stringify([ruleId]);
                        addedItem.posa_pricing_rule_freebie = ruleId;
                        addedItem.posa_pricing_rule_source_row = payload.posa_pricing_rule_source_row;
                        if (key) {
                                addedItem.posa_pricing_rule_key = key;
                        }
                        addedItem.discount_amount = 0;
                        addedItem.discount_percentage = 0;
                        addedItem.base_rate = baseRate;
                        addedItem.base_price_list_rate = baseRate;
                        addedItem.rate = displayRate;
                        addedItem.price_list_rate = displayRate;
                        addedItem.amount = this.flt(addedItem.qty * addedItem.rate, this.currency_precision);
                        addedItem.base_amount = this.flt(
                                addedItem.qty * (addedItem.base_rate !== undefined ? addedItem.base_rate : addedItem.rate),
                                this.currency_precision,
                        );
                        if (detail.batch_no && this.setBatchQty) {
                                this.setBatchQty(addedItem, detail.batch_no, false);
                        }
                        this.calc_item_price(addedItem);
                }

                return addedItem || null;
        },

        updateFreeItemFromPricingRule(item, detail, ruleId) {
                if (!item || !detail) {
                        return;
                }

                const quantity = flt(detail.qty || detail.free_qty || detail.quantity || 0);
                const qty = quantity ? Math.abs(quantity) : 0;
                if (!qty) {
                        if (typeof this.remove_item === "function") {
                                this.remove_item(item);
                        }
                        return;
                }

                const rawStockQty =
                        detail.stock_qty !== undefined ? detail.stock_qty : detail.free_stock_qty || detail.stock_qty;
                const stockQtyValue = rawStockQty !== undefined ? flt(rawStockQty) : null;
                const conversionFactorRaw = detail.conversion_factor || detail.free_conversion_factor;
                const conversionFactor = conversionFactorRaw ? flt(conversionFactorRaw) || 1 : 1;
                const stockQty = stockQtyValue !== null ? stockQtyValue : qty * conversionFactor;

                const key = detail.posa_pricing_rule_key || this.getPricingRuleFreebieKey(detail, ruleId);

                const baseRate = flt(
                        detail.rate !== undefined
                                ? detail.rate
                                : detail.base_rate !== undefined
                                ? detail.base_rate
                                : item.base_rate !== undefined
                                ? item.base_rate
                                : 0,
                );
                const baseCurrency = this.price_list_currency || this.pos_profile?.currency;
                const exchangeRate = this.exchange_rate || 1;
                const isForeignCurrency =
                        this.selected_currency && baseCurrency && this.selected_currency !== baseCurrency;
                const displayRate = isForeignCurrency
                        ? this.flt(baseRate * exchangeRate, this.currency_precision)
                        : baseRate;

                item.qty = qty;
                item.stock_qty = stockQty;
                item.conversion_factor = conversionFactor || 1;
                item.uom = detail.uom || item.uom || detail.stock_uom || item.stock_uom;
                item.stock_uom = detail.stock_uom || item.stock_uom || item.uom;
                item.warehouse = detail.warehouse || item.warehouse || this.pos_profile?.warehouse;
                item.batch_no = detail.batch_no || item.batch_no || "";
                if (item.batch_no) {
                        item.has_batch_no = 1;
                }
                item.serial_no = detail.serial_no || item.serial_no || "";
                item.is_free_item = 1;
                item.pricing_rules = JSON.stringify([ruleId]);
                item.posa_pricing_rule_freebie = ruleId;
                item.posa_pricing_rule_source_row =
                        detail.source_row || detail.child_docname || detail.parent_detail_docname || item.posa_pricing_rule_source_row || null;
                if (key) {
                        item.posa_pricing_rule_key = key;
                }

                item.base_rate = baseRate;
                item.base_price_list_rate = baseRate;
                item.rate = displayRate;
                item.price_list_rate = displayRate;
                item.discount_amount = 0;
                item.discount_percentage = 0;
                item.amount = this.flt(item.qty * item.rate, this.currency_precision);
                item.base_amount = this.flt(
                        item.qty * (item.base_rate !== undefined ? item.base_rate : item.rate),
                        this.currency_precision,
                );

                if (detail.batch_no && this.setBatchQty) {
                        this.setBatchQty(item, detail.batch_no, false);
                }

                this.calc_item_price(item);
        },
};
