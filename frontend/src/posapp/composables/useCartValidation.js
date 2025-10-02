/**
 * Cart Validation Composable
 * Centralized validation logic for cart items to ensure data consistency
 * and proper stock validation before adding items to cart.
 *
 * When Allow Negative Stock is enabled in Stock Settings,
 * negative stock items can be added to the cart without restriction.
 */

import { ref } from 'vue';

import { isOffline, getLocalStock } from '../../offline/index.js';

import {
    parseBooleanSetting,
    formatNegativeStockWarning,
    formatStockShortageError,
} from '../utils/stock.js';
export function useCartValidation() {
    const isValidating = ref(false);
    const validationError = ref(null);
    const validationCache = new Map();
    const VALIDATION_CACHE_TTL = 5000;

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
        showNegativeStockWarning = true
    ) {
        isValidating.value = true;
        validationError.value = null;

        try {
            // Step 1: Basic item validation
            if (!item || !item.item_code) {
                throw new Error('Invalid item data');
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
                        color: "warning",
                    });
                }
                return false;
            }

            // Step 4: Client-side quantity validation (before server call)
            // Allow negative stock items when Allow Negative Stock is enabled
            // This overrides POS Profile's block setting when negative stock is explicitly allowed
            const allowNegativeStock = parseBooleanSetting(stockSettings?.allow_negative_stock);

            let availableQty = typeof item.actual_qty === 'number' ? item.actual_qty : null;

            if (availableQty === null && typeof item.available_qty === 'number') {
                availableQty = item.available_qty;
                item.actual_qty = availableQty;
            }

            if (availableQty === null) {
                const localStockQty = getLocalStock(item.item_code);
                if (localStockQty !== null) {
                    availableQty = localStockQty;
                    item.actual_qty = localStockQty;
                }
            }

            if (availableQty === null) {
                const cachedEntry = validationCache.get(item.item_code);
                if (cachedEntry && Date.now() - cachedEntry.timestamp < VALIDATION_CACHE_TTL) {
                    availableQty = cachedEntry.availableQty;
                }
            }

            if (availableQty !== null) {
                validationCache.set(item.item_code, {
                    availableQty,
                    timestamp: Date.now(),
                });
            }

            const exceedsAvailable = availableQty !== null && requestedQty > availableQty;
            const enforceStockLimit = blockSaleBeyondAvailableQty && !allowNegativeStock;

            if (enforceStockLimit && exceedsAvailable) {
                if (eventBus) {
                    eventBus.emit("show_message", {
                        title: formatStockShortageError(
                            item.item_name || item.item_code,
                            item.actual_qty,
                            requestedQty
                        ),
                        color: "error",
                    });
                }
                return false;
            }

            // Step 5: Server-side stock validation (only when enforcing limits and online)
            const shouldValidateOnServer = enforceStockLimit && !isOffline() && availableQty === null;

            if (shouldValidateOnServer) {
                const stockValidationResult = await validateStockOnServer(item, requestedQty, posProfile);

                if (!stockValidationResult.isValid) {
                    if (eventBus) {
                        eventBus.emit("show_message", {
                            title: formatStockShortageError(
                                stockValidationResult.data?.item_name || item.item_name || item.item_code,
                                stockValidationResult.data?.available_qty ?? item.actual_qty,
                                stockValidationResult.data?.requested_qty ?? requestedQty
                            ),
                            color: "error",
                        });
                    }
                    const failedAvailableQty =
                        typeof stockValidationResult.data?.available_qty === 'number'
                            ? stockValidationResult.data.available_qty
                            : null;

                    if (failedAvailableQty !== null) {
                        validationCache.set(item.item_code, {
                            availableQty: failedAvailableQty,
                            timestamp: Date.now(),
                        });
                        item.actual_qty = failedAvailableQty;
                    }
                    return false;
                }

                const serverAvailableQty =
                    typeof stockValidationResult.data?.available_qty === 'number'
                        ? stockValidationResult.data.available_qty
                        : availableQty;

                if (serverAvailableQty !== null) {
                    item.actual_qty = serverAvailableQty;
                    validationCache.set(item.item_code, {
                        availableQty: serverAvailableQty,
                        timestamp: Date.now(),
                    });
                }
            }

            if (!enforceStockLimit && exceedsAvailable && eventBus && showNegativeStockWarning) {
                eventBus.emit("show_message", {
                    title: formatNegativeStockWarning(
                        item.item_name || item.item_code,
                        item.actual_qty,
                        requestedQty
                    ),
                    color: "warning",
                });
            }

            return true;

        } catch (error) {
            console.error('Cart validation error:', error);
            validationError.value = error.message;

            // Fallback validation for network/API errors
            return performFallbackValidation(
                item,
                requestedQty,
                stockSettings,
                eventBus,
                blockSaleBeyondAvailableQty,
                showNegativeStockWarning
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
                uom: item.stock_uom || item.uom || 'Nos'
            };

            // Call server validation API
            const response = await frappe.call({
                method: "posawesome.posawesome.api.invoices.validate_cart_items",
                args: {
                    items: JSON.stringify([testItem]),
                    pos_profile: posProfile?.name
                },
            });

            // Check if validation failed
            if (response.message && response.message.length > 0) {
                const stockIssue = response.message[0];
                return {
                    isValid: false,
                    message: `${stockIssue.item_code}: Insufficient stock. Available: ${stockIssue.available_qty}, Requested: ${stockIssue.requested_qty}`,
                    data: stockIssue
                };
            }

            return {
                isValid: true,
                message: 'Stock validation passed',
                data: null
            };

        } catch (error) {
            console.error('Server stock validation failed:', error);
            throw new Error('Unable to validate stock on server');
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
        showNegativeStockWarning = true
    ) {
        console.warn('Using fallback validation due to server validation failure');

        // Allow negative stock items when Allow Negative Stock is enabled
        const allowNegativeStock = parseBooleanSetting(stockSettings?.allow_negative_stock);

        let availableQty = typeof item.actual_qty === 'number' ? item.actual_qty : null;

        if (availableQty === null && typeof item.available_qty === 'number') {
            availableQty = item.available_qty;
            item.actual_qty = availableQty;
        }

        if (availableQty === null) {
            const localStockQty = getLocalStock(item.item_code);
            if (localStockQty !== null) {
                availableQty = localStockQty;
                item.actual_qty = localStockQty;
            }
        }

        if (availableQty !== null) {
            validationCache.set(item.item_code, {
                availableQty,
                timestamp: Date.now(),
            });
        }

        const exceedsAvailable = availableQty !== null && requestedQty > availableQty;
        const enforceStockLimit = blockSaleBeyondAvailableQty && !allowNegativeStock;

        // Simple negative stock check - only block if negative stock is not allowed
        if (availableQty !== null && availableQty < 0 && enforceStockLimit) {
            if (eventBus) {
                eventBus.emit("show_message", {
                    title: formatStockShortageError(
                        item.item_name || item.item_code,
                        item.actual_qty,
                        requestedQty
                    ),
                    color: "error",
                });
            }
            return false;
        }

        if (enforceStockLimit && exceedsAvailable) {
            if (eventBus) {
                eventBus.emit("show_message", {
                    title: formatStockShortageError(
                        item.item_name || item.item_code,
                        item.actual_qty,
                        requestedQty
                    ),
                    color: "error",
                });
            }
            return false;
        }

        if (!enforceStockLimit && exceedsAvailable && eventBus && showNegativeStockWarning) {
            eventBus.emit("show_message", {
                title: formatNegativeStockWarning(
                    item.item_name || item.item_code,
                    item.actual_qty,
                    requestedQty
                ),
                color: "warning",
            });
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
        showNegativeStockWarning = true
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
                showNegativeStockWarning
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
            hasErrors: invalidItems.length > 0
        };
    }

    return {
        isValidating,
        validationError,
        validateCartItem,
        validateCartItems,
        validateStockOnServer,
        performFallbackValidation
    };
}
