/**
 * Cart Validation Composable
 * Centralized validation logic for cart items to ensure data consistency
 * and proper stock validation before adding items to cart.
 *
 * When Allow Negative Stock is enabled in Stock Settings,
 * negative stock items can be added to the cart without restriction.
 */

import { ref } from "vue";
import { useToastStore } from "../stores/toastStore.js";
import { parseBooleanSetting, formatStockShortageError } from "../utils/stock.js";

export function useCartValidation() {
	const isValidating = ref(false);
	const validationError = ref(null);
	const toastStore = useToastStore();

	async function validateCartItem(
		item,
		requestedQty = 1,
		posProfile,
		stockSettings,
		eventBus, // Kept for signature compatibility but ignored
		blockSaleBeyondAvailableQty = false,
		_showNegativeStockWarning = true,
		skipServerValidation = false,
	) {
		isValidating.value = true;
		validationError.value = null;

		try {
			// Step 1: Basic validation
			if (!item || !item.item_code) {
				throw new Error("Invalid item data");
			}

			// Step 2: Variants check
			if (item.has_variants) {
				toastStore.show({
					title: __("This is an item template. Please choose a variant."),
					color: "warning",
				});
				return false;
			}

			// Step 3: Zero stock check
			if (item.actual_qty === 0 && posProfile?.posa_display_items_in_stock) {
				toastStore.show({
					title: `No stock available for ${item.item_name}`,
					color: "error",
				});
				return false;
			}

			const isStockItem = parseBooleanSetting(item?.is_stock_item);

			if (isStockItem) {
				const allowNegativeStock =
					!blockSaleBeyondAvailableQty &&
					(parseBooleanSetting(stockSettings?.allow_negative_stock) ||
						parseBooleanSetting(item?.allow_negative_stock));
				const exceedsAvailable =
					typeof item.actual_qty === "number" && requestedQty > item.actual_qty;
				const blockSale = !allowNegativeStock && exceedsAvailable;

				if (blockSale) {
					toastStore.show({
						title: formatStockShortageError(
							item.item_name || item.item_code,
							item.actual_qty,
							requestedQty,
						),
						color: "error",
					});
					return false;
				}

				if (!skipServerValidation) {
					const stockValidationResult = await validateStockOnServer(item, requestedQty, posProfile);

					if (!stockValidationResult.isValid) {
						toastStore.show({
							title: formatStockShortageError(
								stockValidationResult.data?.item_name || item.item_name || item.item_code,
								stockValidationResult.data?.available_qty ?? item.actual_qty,
								stockValidationResult.data?.requested_qty ?? requestedQty,
							),
							color: "error",
						});
						return false;
					}
				}
			}
			return true;
		} catch (error) {
			console.error("Cart validation error:", error);
			validationError.value = error.message;
			return performFallbackValidation(
				item,
				requestedQty,
				stockSettings,
				eventBus,
				blockSaleBeyondAvailableQty,
				_showNegativeStockWarning,
			);
		} finally {
			isValidating.value = false;
		}
	}

	async function validateStockOnServer(item, requestedQty, posProfile) {
		try {
			const testItem = {
				item_code: item.item_code,
				item_name: item.item_name,
				warehouse: posProfile?.warehouse || item.warehouse,
				qty: Math.abs(requestedQty),
				stock_qty: Math.abs(requestedQty),
				actual_qty: item.actual_qty,
				uom: item.stock_uom || item.uom || "Nos",
			};

			const response = await frappe.call({
				method: "posawesome.posawesome.api.invoices.validate_cart_items",
				args: {
					items: JSON.stringify([testItem]),
					pos_profile: posProfile?.name,
				},
			});

			if (response.message && response.message.length > 0) {
				const stockIssue = response.message[0];
				return {
					isValid: false,
					message: `${stockIssue.item_code}: Insufficient stock. Available: ${stockIssue.available_qty}, Requested: ${stockIssue.requested_qty}`,
					data: stockIssue,
				};
			}

			return {
				isValid: true,
				message: "Stock validation passed",
				data: null,
			};
		} catch (error) {
			console.error("Server stock validation failed:", error);
			throw new Error("Unable to validate stock on server");
		}
	}

	function performFallbackValidation(
		item,
		requestedQty,
		stockSettings,
		eventBus,
		blockSaleBeyondAvailableQty = false,
		_showNegativeStockWarning = true,
	) {
		console.warn("Using fallback validation due to server validation failure");

		const isStockItem = parseBooleanSetting(item?.is_stock_item);

		if (isStockItem) {
			const allowNegativeStock =
				!blockSaleBeyondAvailableQty &&
				(parseBooleanSetting(stockSettings?.allow_negative_stock) ||
					parseBooleanSetting(item?.allow_negative_stock));

			if (item.actual_qty < 0 && !allowNegativeStock) {
				toastStore.show({
					title: formatStockShortageError(
						item.item_name || item.item_code,
						item.actual_qty,
						requestedQty,
					),
					color: "error",
				});
				return false;
			}

			const exceedsAvailable = typeof item.actual_qty === "number" && requestedQty > item.actual_qty;
			const blockSale = !allowNegativeStock && exceedsAvailable;
			if (blockSale) {
				toastStore.show({
					title: formatStockShortageError(
						item.item_name || item.item_code,
						item.actual_qty,
						requestedQty,
					),
					color: "error",
				});
				return false;
			}
		}

		return true;
	}

	/**
	 * Validates multiple items for batch operations
	 * @param {Array} items - Array of items to validate
	 * @param {Object} posProfile - POS profile settings
	 * @param {Object} stockSettings - Stock settings
	 * @param {Object} eventBus - Event bus for notifications
	 * @param {boolean} blockSaleBeyondAvailableQty - Block sales beyond available quantity
	 * @returns {Promise<Object>} - Validation result with valid/invalid items
	 */
	async function validateCartItems(
		items,
		posProfile,
		stockSettings,
		eventBus,
		blockSaleBeyondAvailableQty = false,
		showNegativeStockWarning = true,
	) {
		const validItems = [];
		const invalidItems = [];

		for (const item of items) {
			const isValid = await validateCartItem(
				item.item || item,
				item.qty || 1,
				posProfile,
				stockSettings,
				eventBus,
				blockSaleBeyondAvailableQty,
				showNegativeStockWarning,
			);

			if (isValid) {
				validItems.push(item);
			} else {
				invalidItems.push(item);
			}
		}

		return {
			valid: validItems,
			invalid: invalidItems,
			hasErrors: invalidItems.length > 0,
		};
	}

	return {
		isValidating,
		validationError,
		validateCartItem,
		validateCartItems,
		validateStockOnServer,
		performFallbackValidation,
	};
}
