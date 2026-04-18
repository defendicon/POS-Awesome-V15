/**
 * UI helpers for surfacing offline-prerequisite warnings to the operator.
 *
 * These functions are deliberately free of Vue reactivity — they operate on plain
 * objects so they can be used in both component code and unit tests.
 *
 * @module bootstrapWarnings
 */

type TranslateFn = (value: string) => string;

/**
 * Maps a prerequisite warning code to a translated human-readable message.
 *
 * Warning codes are produced by `resolveBootstrapRuntimeState` in
 * `offline/bootstrapSnapshot.ts`. The default `translate` identity function is used in
 * tests; production code passes the Frappe `__()` translator.
 *
 * @param code - A prerequisite key (e.g. `"pos_profile"`) or a mismatch reason
 *   (e.g. `"build_version_mismatch"`).
 * @param translate - Optional translation function; defaults to identity.
 * @returns Translated user-facing message string.
 */
export function formatBootstrapWarning(
	code: string,
	translate: TranslateFn = (value) => value,
) {
	switch (code) {
		case "snapshot_missing":
			return translate(
				"Offline bootstrap snapshot is missing. POS will stay open, but offline features may be limited until cache is refreshed online.",
			);
		case "build_version_mismatch":
			return translate("Cached offline data belongs to a different app build.");
		case "profile_name_mismatch":
			return translate("Cached offline data belongs to a different POS profile.");
		case "profile_modified_mismatch":
			return translate(
				"POS profile settings changed after the offline snapshot was captured.",
			);
		case "opening_shift_user_mismatch":
			return translate(
				"Cached opening shift belongs to another user and cannot be restored offline.",
			);
		case "pos_profile":
			return translate("POS profile cache is incomplete.");
		case "pos_opening_shift":
			return translate("POS opening shift cache is incomplete.");
		case "payment_methods":
			return translate("Offline payment methods are incomplete.");
		case "sales_persons":
			return translate("Offline sales persons cache is incomplete.");
		case "items_cache_ready":
			return translate("Offline item cache is incomplete.");
		case "customers_cache_ready":
			return translate("Offline customer cache is incomplete.");
		case "item_groups":
			return translate("Offline item groups cache is incomplete.");
		case "pricing_rules_snapshot":
			return translate("Offline pricing rules snapshot is missing.");
		case "pricing_rules_context":
			return translate("Offline pricing context is missing.");
		case "tax_inclusive":
			return translate("Offline tax inclusive setting is missing.");
		case "print_template":
			return translate("Offline print template is missing.");
		case "terms_and_conditions":
			return translate("Offline terms and conditions cache is missing.");
		case "offers_cache":
			return translate("Offline offers cache is missing.");
		case "coupons_cache":
			return translate("Offline coupons cache is missing.");
		case "stock_cache_ready":
			return translate("Offline stock cache is incomplete.");
		case "delivery_charges_cache":
			return translate("Offline delivery charges cache is incomplete.");
		case "currency_options_cache":
			return translate("Offline currency options cache is incomplete.");
		case "exchange_rate_cache":
			return translate("Offline exchange rate cache is incomplete.");
		case "price_list_meta_cache":
			return translate("Offline price list metadata cache is incomplete.");
		case "customer_addresses_cache":
			return translate("Offline customer addresses cache is incomplete.");
		case "payment_method_currency_cache":
			return translate(
				"Offline payment method currency cache is incomplete.",
			);
		default:
			return translate(
				`Offline prerequisite needs refresh: ${String(code || "").replace(/_/g, " ")}`,
			);
	}
}

/**
 * Returns `true` when the persisted bootstrap status warrants showing the offline warning
 * banner in the navbar.
 *
 * Only `"limited"` (blocking prerequisites missing) and `"invalid"` (wrong user session)
 * modes trigger the banner. A `"normal"` or `"confirmation_required"` mode returns `false`.
 *
 * @param status - The `bootstrapStatus` object stored in `DefaultLayout.vue`, typically
 *   read from `getBootstrapSnapshotStatus()`.
 */
export function shouldShowBootstrapBanner(status: Record<string, any> | null | undefined) {
	if (status?.primary_warning?.active) {
		return true;
	}
	const runtimeMode = status?.runtime_mode || status?.mode || "normal";
	return runtimeMode === "limited" || runtimeMode === "invalid";
}
