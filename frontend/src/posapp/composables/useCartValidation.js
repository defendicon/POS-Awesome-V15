/**
 * Cart Validation Composable
 * Centralized validation logic for cart items to ensure data consistency
 * and proper stock validation before adding items to cart.
 *
 * When Allow Negative Stock is enabled in Stock Settings,
 * negative stock items can be added to the cart without restriction.
 */

import { ref } from "vue";

import { parseBooleanSetting, formatStockShortageError } from "../utils/stock.js";
export function useCartValidation() {
	const isValidating = ref(false);
	const validationError = ref(null);

	/**
	 * Validates if an item can be added to the cart
	 * @param {Object} item - The item to validate
	 * @param {number} requestedQty - The quantity requested
	 * @param {Object} posProfile - POS profile settings
	 * @param {Object} stockSettings - Stock settings
	 * @param {Object} eventBus - Event bus for notifications
	 * @param {boolean} blockSaleBeyondAvailableQty - Block sales beyond available quantity
	 * @returns {Promise<boolean>} - Returns true if item can be added, false otherwise
	 */
	async function validateCartItem(
		item,
		requestedQty = 1,
		posProfile,
		stockSettings,
		eventBus,
		blockSaleBeyondAvailableQty = false,
		showNegativeStockWarning = true,
	) {
		isValidating.value = true;
		validationError.value = null;

		try {
			// Step 1: Basic item validation
			if (!item || !item.item_code) {
				throw new Error("Invalid item data");
			}

			// Step 2: Check if item has variants (should not be added directly)
			if (item.has_variants) {
				if (eventBus) {
					eventBus.emit("show_message", {
						title: __("This is an item template. Please choose a variant."),
						color: "warning",
					});
				}
				return false;
			}

			// Step 3: Zero stock validation (if enabled)
			if (item.actual_qty === 0 && posProfile?.posa_display_items_in_stock) {
				if (eventBus) {
					eventBus.emit("show_message", {
						title: `No stock available for ${item.item_name}`,
						color: "error",
					});
				}
				return false;
			}

                        const isStockItem = parseBooleanSetting(item?.is_stock_item);

                        if (isStockItem) {
                                // Step 4: Client-side quantity validation (before server call)
                                // Allow negative stock items when Allow Negative Stock is enabled
                                // This overrides POS Profile's block setting when negative stock is explicitly allowed
                                const allowNegativeStock = parseBooleanSetting(stockSettings?.allow_negative_stock);
                                const exceedsAvailable =
                                        typeof item.actual_qty === "number" && requestedQty > item.actual_qty;
                                const blockSale = !allowNegativeStock && exceedsAvailable;

                                if (blockSale) {
                                        if (eventBus) {
                                                eventBus.emit("show_message", {
                                                        title: formatStockShortageError(
                                                                item.item_name || item.item_code,
                                                                item.actual_qty,
                                                                requestedQty,
                                                        ),
                                                        color: "error",
                                                });
                                        }
                                        return false;
                                }

                                // Step 5: Server-side stock validation
                                const stockValidationResult = await validateStockOnServer(item, requestedQty, posProfile);

                                if (!stockValidationResult.isValid) {
                                        if (eventBus) {
                                                eventBus.emit("show_message", {
                                                        title: formatStockShortageError(
                                                                stockValidationResult.data?.item_name ||
                                                                        item.item_name ||
                                                                        item.item_code,
                                                                stockValidationResult.data?.available_qty ?? item.actual_qty,
                                                                stockValidationResult.data?.requested_qty ?? requestedQty,
                                                        ),
                                                        color: "error",
                                                });
                                        }
                                        return false;
                                }
                        }
                        return true;
		} catch (error) {
			console.error("Cart validation error:", error);
			validationError.value = error.message;

			// Fallback validation for network/API errors
			return performFallbackValidation(
				item,
				requestedQty,
				stockSettings,
				eventBus,
				blockSaleBeyondAvailableQty,
				showNegativeStockWarning,
			);
		} finally {
			isValidating.value = false;
		}
	}

	/**
	 * Server-side stock validation using the validate_cart_items API
	 * @param {Object} item - The item to validate
	 * @param {number} requestedQty - The quantity requested
	 * @param {Object} posProfile - POS profile settings
	 * @returns {Promise<Object>} - Validation result object
	 */
	async function validateStockOnServer(item, requestedQty, posProfile) {
		try {
			// Prepare item for validation
			const testItem = {
				item_code: item.item_code,
				item_name: item.item_name,
				warehouse: posProfile?.warehouse || item.warehouse,
				qty: Math.abs(requestedQty),
				stock_qty: Math.abs(requestedQty),
				actual_qty: item.actual_qty,
				uom: item.stock_uom || item.uom || "Nos",
			};

			// Call server validation API
			const response = await frappe.call({
				method: "posawesome.posawesome.api.invoices.validate_cart_items",
				args: {
					items: JSON.stringify([testItem]),
					pos_profile: posProfile?.name,
				},
			});

			// Check if validation failed
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

	/**
	 * Fallback validation when server validation fails
	 * @param {Object} item - The item to validate
	 * @param {number} requestedQty - The quantity requested
	 * @param {Object} stockSettings - Stock settings
	 * @param {Object} eventBus - Event bus for notifications
	 * @param {boolean} blockSaleBeyondAvailableQty - Block sales beyond available quantity
	 * @returns {boolean} - Returns true if item can be added, false otherwise
	 */
	function performFallbackValidation(
		item,
		requestedQty,
		stockSettings,
		eventBus,
		blockSaleBeyondAvailableQty = false,
		showNegativeStockWarning = true,
	) {
		console.warn("Using fallback validation due to server validation failure");

                const isStockItem = parseBooleanSetting(item?.is_stock_item);

                if (isStockItem) {
                        // Allow negative stock items when Allow Negative Stock is enabled
                        const allowNegativeStock = parseBooleanSetting(stockSettings?.allow_negative_stock);

                        // Simple negative stock check - only block if negative stock is not allowed
                        if (item.actual_qty < 0 && !allowNegativeStock) {
                                if (eventBus) {
                                        eventBus.emit("show_message", {
                                                title: formatStockShortageError(
                                                        item.item_name || item.item_code,
                                                        item.actual_qty,
                                                        requestedQty,
                                                ),
                                                color: "error",
                                        });
                                }
                                return false;
                        }

                        // Check if requested quantity exceeds available stock
                        const exceedsAvailable =
                                typeof item.actual_qty === "number" && requestedQty > item.actual_qty;
                        const blockSale = !allowNegativeStock && exceedsAvailable;
                        if (blockSale) {
                                if (eventBus) {
                                        eventBus.emit("show_message", {
                                                title: formatStockShortageError(
                                                        item.item_name || item.item_code,
                                                        item.actual_qty,
                                                        requestedQty,
                                                ),
                                                color: "error",
                                        });
                                }
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
