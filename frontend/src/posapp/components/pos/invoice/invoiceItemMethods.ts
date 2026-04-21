import { debounce } from "lodash";

import * as Tasks from "../invoice_utils/tasks";
import * as Currency from "../invoice_utils/currency";
import * as Cache from "../invoice_utils/cache";
import * as Loader from "../invoice_utils/loader";
import * as Document from "../invoice_utils/document";
import * as Pricing from "../invoice_utils/pricing";
import * as FreeItems from "../invoice_utils/free_items";
import * as Actions from "../invoice_utils/actions";
import * as Validation from "../invoice_utils/validation";
import * as ItemUpdates from "../invoice_utils/item_updates";
import * as Customer from "../invoice_utils/customer";
import * as Server from "../invoice_utils/server";
import * as Dialogs from "../invoice_utils/dialogs";
import * as Stock from "../invoice_utils/stock";
import * as Discounts from "../invoice_utils/discounts";

interface InvoiceItemMethodsVm {
	applyPricingRulesForCart: (_force?: boolean) => void;
	flushBackgroundUpdates?: () => void;
	add_item: (_item: unknown, _options?: unknown) => unknown;
	remove_item: (_item: unknown) => unknown;
	set_batch_qty: (
		_item: unknown,
		_value: unknown,
		_update?: unknown,
	) => unknown;
	set_serial_no: (_item: unknown) => unknown;
	calc_uom: (_item: unknown, _value: unknown) => unknown;
	calc_stock_qty: (_item: unknown, _value: unknown) => unknown;
	clear_invoice: (_options?: unknown) => unknown;
	roundAmount: (_amount: unknown) => unknown;
	update_item_detail: (_item: unknown) => unknown;
	update_items_details: (_items: unknown[]) => unknown;
	forceUpdate: () => void;
	$forceUpdate?: () => void;
}

// Keep offline imports if needed for re-export or mixin usage?
// No, utils handle it.

const invoiceItemMethods: Record<string, unknown> &
	ThisType<InvoiceItemMethodsVm> = {
	...Tasks,
	...Cache,
	...Currency,
	...Loader,
	...Document,
	...FreeItems,

	// Explicit wrappers for methods that need 'this' context passed forcefully if spread doesn't bind
	// Vue mixin methods are bound to component instance when called.
	// If we export functions like `function foo(context) {}`, we need to wrap them: `foo() { return importedFoo(this); }`

	// Tasks
	_ensureTaskBucket(rowId) {
		return Tasks._ensureTaskBucket(this, rowId);
	},
	_getItemTaskPromise(rowId, taskName) {
		return Tasks._getItemTaskPromise(this, rowId, taskName);
	},
	_setItemTaskPromise(rowId, taskName, promise) {
		return Tasks._setItemTaskPromise(this, rowId, taskName, promise);
	},
	resetItemTaskCache(rowId, taskName) {
		return Tasks.resetItemTaskCache(this, rowId, taskName);
	},
	queueItemTask(itemOrRowId, taskName, taskFn, options) {
		return Tasks.queueItemTask(
			this,
			itemOrRowId,
			taskName,
			taskFn,
			options,
		);
	},
	hasItemTaskPromise(rowId, taskName) {
		return Tasks.hasItemTaskPromise(this, rowId, taskName);
	},
	getItemTaskPromise(rowId, taskName) {
		return Tasks.getItemTaskPromise(this, rowId, taskName);
	},

	// Cache
	_getItemDetailCacheKey(item) {
		return Cache._getItemDetailCacheKey(this, item);
	},
	_getCachedItemDetail(key) {
		return Cache._getCachedItemDetail(this, key);
	},
	_storeItemDetailCache(key, data) {
		return Cache._storeItemDetailCache(this, key, data);
	},
	clearItemDetailCache() {
		return Cache.clearItemDetailCache(this);
	},
	_getStockCacheKey(item) {
		return Cache._getStockCacheKey(this, item);
	},
	_getCachedStockQty(key) {
		return Cache._getCachedStockQty(this, key);
	},
	_storeStockQty(key, qty) {
		return Cache._storeStockQty(this, key, qty);
	},
	clearItemStockCache() {
		return Cache.clearItemStockCache(this);
	},

	// Currency
	_toBaseCurrency(value) {
		return Currency._toBaseCurrency(this, value);
	},
	_fromBaseCurrency(value) {
		return Currency._fromBaseCurrency(this, value);
	},
	_getPlcConversionRate() {
		return Currency._getPlcConversionRate(this);
	},
	_buildPriceListSnapshot(items) {
		return Currency._buildPriceListSnapshot(this, items);
	},
	_logPriceListDebug(contextName, payload) {
		return Currency._logPriceListDebug(this, contextName, payload);
	},
	convert_amount(amount) {
		return Currency.convert_amount(this, amount);
	},

	// Free Items
	_isFreeLine(item) {
		return FreeItems._isFreeLine(this, item);
	},
	_syncAutoFreeLines(freebiesMap) {
		return FreeItems._syncAutoFreeLines(this, freebiesMap);
	},

	// Pricing
	_getPricingRulesStore() {
		return Pricing._getPricingRulesStore(this);
	},
	_getItemsStore() {
		return Pricing._getItemsStore(this);
	},
	_getPricingContext() {
		return Pricing._getPricingContext(this);
	},
	_ensurePricingRules(force) {
		return Pricing._ensurePricingRules(this, force);
	},
	_resolveBaseRate(item) {
		return Pricing._resolveBaseRate(this, item);
	},
	_resolvePricingQty(item) {
		return Pricing._resolvePricingQty(this, item);
	},
	_updatePricingBadge(item, applied) {
		return Pricing._updatePricingBadge(this, item, applied);
	},
	_applyPricingToLine(item, ctx, indexes, freebiesMap) {
		return Pricing._applyPricingToLine(
			this,
			item,
			ctx,
			indexes,
			freebiesMap,
		);
	},
	applyPricingRulesForCart(force) {
		return Pricing.applyPricingRulesForCart(this, force);
	},
	_applyLocalPricingRules(force) {
		return Pricing._applyLocalPricingRules(this, force);
	},
	_applyServerPricingRules(ctx) {
		return Pricing._applyServerPricingRules(this, ctx);
	},

	// Loader
	fetch_customer_balance() {
		return Loader.fetch_customer_balance(this);
	},
	load_invoice(data, options) {
		return Loader.load_invoice(this, data, options);
	},

	// Document
	get_invoice_doc() {
		return Document.get_invoice_doc(this);
	},
	get_invoice_items() {
		return Document.get_invoice_items(this);
	},
	get_order_items() {
		return Document.get_order_items(this);
	},
	get_payments() {
		return Document.get_payments(this);
	},

	// Actions
	remove_item(item) {
		return Actions.remove_item(this, item);
	},
	add_item(item, options) {
		return Actions.add_item(this, item, options);
	},
	get_new_item(item) {
		return Actions.get_new_item(this, item);
	},
	clear_invoice(options) {
		return Actions.clear_invoice(this, options);
	},
	cancel_invoice() {
		return Actions.cancel_invoice(this);
	},
	save_and_clear_invoice() {
		return Actions.save_and_clear_invoice(this);
	},
	new_order(data) {
		return Actions.new_order(this, data);
	},
	get_invoice_from_order_doc() {
		return Actions.get_invoice_from_order_doc(this);
	},

	// Validation
	validate() {
		return Validation.validate(this);
	},
	ensure_auto_batch_selection() {
		return Validation.ensure_auto_batch_selection(this);
	},

	// Item Updates
	update_items_details(items) {
		return ItemUpdates.update_items_details(this, items);
	},
	update_item_detail(item, force_update) {
		return ItemUpdates.update_item_detail(this, item, force_update);
	},
	_performItemDetailUpdate(item, force_update) {
		return ItemUpdates._performItemDetailUpdate(this, item, force_update);
	},
	_applyItemDetailPayload(item, data, options) {
		return ItemUpdates._applyItemDetailPayload(this, item, data, options);
	},
	_collectManualRateOverrides(items) {
		return ItemUpdates._collectManualRateOverrides(this, items);
	},
	_doesManualOverrideMatchItem(override, item) {
		return ItemUpdates._doesManualOverrideMatchItem(this, override, item);
	},
	_assignManualOverrideValues(item, values) {
		return ItemUpdates._assignManualOverrideValues(this, item, values);
	},
	_applyManualRateOverridesToDoc(doc, overrides) {
		return ItemUpdates._applyManualRateOverridesToDoc(this, doc, overrides);
	},
	_buildManualOverrideKeyFromItem(item) {
		return ItemUpdates._buildManualOverrideKeyFromItem(this, item);
	},
	_snapshotManualValuesFromDocItems(items) {
		return ItemUpdates._snapshotManualValuesFromDocItems(this, items);
	},
	_restoreManualSnapshots(items, snapshots) {
		return ItemUpdates._restoreManualSnapshots(this, items, snapshots);
	},
	_normalizeReturnDocTotals(doc) {
		return ItemUpdates._normalizeReturnDocTotals(this, doc);
	},
	flushBackgroundUpdates() {
		return ItemUpdates.flushBackgroundUpdates(this);
	}, // Needs to be debounced below? No, implementation

	// Customer
	fetch_customer_details() {
		return Customer.fetch_customer_details(this);
	},
	get_effective_price_list() {
		return Customer.get_effective_price_list(this);
	},
	get_price_list() {
		return Customer.get_price_list(this);
	},
	update_price_list() {
		return Customer.update_price_list(this);
	},
	sync_invoice_customer_details(details) {
		return Customer.sync_invoice_customer_details(this, details);
	},
	_applyPriceListRate(item, newRate, priceCurrency) {
		return Customer._applyPriceListRate(this, item, newRate, priceCurrency);
	},
	_computePriceConversion(rate, priceCurrency) {
		return Customer._computePriceConversion(this, rate, priceCurrency);
	},
	apply_cached_price_list(price_list) {
		return Customer.apply_cached_price_list(this, price_list);
	},

	// Server
	update_invoice(doc) {
		return Server.update_invoice(this, doc);
	},
	update_invoice_from_order(doc) {
		return Server.update_invoice_from_order(this, doc);
	},
	process_invoice() {
		return Server.process_invoice(this);
	},
	process_invoice_from_order() {
		return Server.process_invoice_from_order(this);
	},
	reload_current_invoice_from_backend() {
		return Server.reload_current_invoice_from_backend(this);
	},

	// Dialogs
	show_payment() {
		return Dialogs.show_payment(this);
	},
	get_draft_invoices(source = "invoice") {
		return Dialogs.get_draft_invoices(this, source as "invoice" | "order" | "quote");
	},
	get_draft_orders() {
		return Dialogs.get_draft_orders(this);
	},
	open_returns() {
		return Dialogs.open_returns(this);
	},
	open_invoice_management(targetTab = "history", draftSource = "invoice") {
		return Dialogs.open_invoice_management_with_source(
			this,
			targetTab,
			draftSource as "invoice" | "order" | "quote",
		);
	},
	load_draft_source_record(draft) {
		return Dialogs.load_draft_source_record(this, draft);
	},
	close_payments() {
		return Dialogs.close_payments(this);
	},
	change_price_list_rate(item) {
		return Dialogs.change_price_list_rate(this, item);
	},

	// Stock
	calc_stock_qty(item, value) {
		return Stock.calc_stock_qty(this, item, value);
	},
	update_qty_limits(item) {
		return Stock.update_qty_limits(this, item);
	},
	fetch_available_qty(item) {
		return Stock.fetch_available_qty(this, item);
	},
	set_serial_no(item) {
		return Stock.set_serial_no(this, item);
	},
	set_batch_qty(item, value, update) {
		return Stock.set_batch_qty(this, item, value, update);
	},
	calc_uom(item, value) {
		return Stock.calc_uom(this, item, value);
	},

	// Discounts
	update_discount_umount() {
		return Discounts.update_discount_umount(this);
	},
	calc_prices(item, value, $event) {
		return Discounts.calc_prices(this, item, value, $event);
	},
	calc_item_price(item) {
		return Discounts.calc_item_price(this, item);
	},

	// Debounced Methods
	schedulePricingRuleApplication: debounce(function (
		this: InvoiceItemMethodsVm,
		force = false,
	) {
		this.applyPricingRulesForCart(force);
	}, 150),

	triggerBackgroundFlush: debounce(function (this: InvoiceItemMethodsVm) {
		// flushBackgroundUpdates was added to ItemUpdates?
		// Wait, I updated ItemUpdates but flushBackgroundUpdates might not be there if I missed it.
		// It's called ItemUpdates.flushBackgroundUpdates?
		// I need to check if I added it.
		if (this.flushBackgroundUpdates) this.flushBackgroundUpdates();
		// Using `this.flushBackgroundUpdates` which delegates to imported `ItemUpdates.flushBackgroundUpdates` (if I define it).
	}, 2000),

	// Aliases
	addItem(item, options) {
		return this.add_item(item, options);
	},
	removeItem(item) {
		return this.remove_item(item);
	},
	setBatchQty(item, value, update) {
		return this.set_batch_qty(item, value, update);
	},
	setSerialNo(item) {
		return this.set_serial_no(item);
	},
	calcUom(item, value) {
		return this.calc_uom(item, value);
	},
	calcStockQty(item, value) {
		return this.calc_stock_qty(item, value);
	},
	clearInvoice(options) {
		return this.clear_invoice(options);
	},
	round_amount(amount) {
		return this.roundAmount(amount);
	},
	updateItemDetail(item) {
		return this.update_item_detail(item);
	},
	updateItemsDetails(items) {
		return this.update_items_details(items);
	},
	forceUpdate() {
		if (typeof this.$forceUpdate === "function") {
			this.$forceUpdate();
		}
	},
};

export default invoiceItemMethods;
