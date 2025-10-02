/**
 * Cart Validation Composable
 * Centralized validation logic for cart items to ensure data consistency
 * and proper stock validation before adding items to cart.
 *
 * When Allow Negative Stock is enabled in Stock Settings,
 * negative stock items can be added to the cart without restriction.
 */

import { ref } from 'vue';

import {
    parseBooleanSetting,
    formatNegativeStockWarning,
    formatStockShortageError,
} from '../utils/stock.js';
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
        showNegativeStockWarning = true
    ) {
        const result = await validateCartItems(
            [
                {
                    item,
                    qty: requestedQty,
                    suppressNegativeWarning: !showNegativeStockWarning,
                },
            ],
            posProfile,
            stockSettings,
            eventBus,
            blockSaleBeyondAvailableQty,
            showNegativeStockWarning,
            false,
        );

        return result.invalid.length === 0;
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

        // Simple negative stock check - only block if negative stock is not allowed
        if (item.actual_qty < 0 && !allowNegativeStock) {
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

        // Check if requested quantity exceeds available stock
        const exceedsAvailable = typeof item.actual_qty === 'number' && requestedQty > item.actual_qty;
        const blockSale = !allowNegativeStock && exceedsAvailable;
        if (blockSale) {
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

        if (allowNegativeStock && exceedsAvailable && eventBus && showNegativeStockWarning) {
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
        showNegativeStockWarning = true,
        aggregate = false
    ) {
        isValidating.value = true;
        validationError.value = null;

        const results = {
            valid: [],
            invalid: [],
            warnings: [],
            errors: [],
            hasErrors: false,
        };

        const aggregateNotifications = Boolean(aggregate);
        const allowNegativeStock = parseBooleanSetting(stockSettings?.allow_negative_stock);
        const serverCandidates = [];
        const candidatesMeta = [];

        try {
            for (const rawEntry of items) {
                const entry = {
                    ...(rawEntry || {}),
                };

                const item = entry.item || rawEntry;
                const requestedQty = Math.abs(entry.qty ?? entry.requestedQty ?? 1) || 1;

                if (!item || !item.item_code) {
                    const message = __('Invalid item data');
                    entry.item = item;
                    entry.qty = requestedQty;
                    entry.message = message;
                    results.invalid.push(entry);
                    results.errors.push(message);
                    continue;
                }

                entry.item = item;
                entry.qty = requestedQty;

                if (item.has_variants) {
                    const message = __("This is an item template. Please choose a variant.");
                    entry.message = message;
                    results.invalid.push(entry);
                    results.errors.push(message);
                    continue;
                }

                if (item.actual_qty === 0 && posProfile?.posa_display_items_in_stock) {
                    const message = __("No stock available for {0}", [item.item_name || item.item_code]);
                    entry.message = message;
                    results.invalid.push(entry);
                    results.errors.push(message);
                    if (!aggregateNotifications && eventBus) {
                        eventBus.emit("show_message", {
                            title: message,
                            color: "warning",
                        });
                    }
                    continue;
                }

                const exceedsAvailable =
                    typeof item.actual_qty === 'number' && requestedQty > item.actual_qty;
                const shouldBlock = !allowNegativeStock && exceedsAvailable;

                if (shouldBlock) {
                    const message = formatStockShortageError(
                        item.item_name || item.item_code,
                        item.actual_qty,
                        requestedQty
                    );
                    entry.message = message;
                    results.invalid.push(entry);
                    results.errors.push(message);
                    if (!aggregateNotifications && eventBus) {
                        eventBus.emit("show_message", {
                            title: message,
                            color: "error",
                        });
                    }
                    continue;
                }

                const serverPayload = {
                    item_code: item.item_code,
                    item_name: item.item_name,
                    warehouse: posProfile?.warehouse || item.warehouse,
                    qty: Math.abs(requestedQty),
                    stock_qty: Math.abs(requestedQty),
                    actual_qty: item.actual_qty,
                    uom: item.stock_uom || item.uom || 'Nos',
                };

                serverCandidates.push(serverPayload);
                candidatesMeta.push({
                    entry,
                    exceedsAvailable,
                });
            }

            if (!serverCandidates.length) {
                results.hasErrors = results.invalid.length > 0;
                return results;
            }

            let issues = [];

            try {
                const response = await frappe.call({
                    method: "posawesome.posawesome.api.invoices.validate_cart_items",
                    args: {
                        items: JSON.stringify(serverCandidates),
                        pos_profile: posProfile?.name,
                    },
                });

                if (Array.isArray(response?.message)) {
                    issues = response.message;
                }
            } catch (error) {
                console.error('Server stock validation failed:', error);
                validationError.value = error.message;

                for (const { entry } of candidatesMeta) {
                    const fallbackIsValid = performFallbackValidation(
                        entry.item,
                        entry.qty,
                        stockSettings,
                        aggregateNotifications ? null : eventBus,
                        blockSaleBeyondAvailableQty,
                        showNegativeStockWarning
                    );

                    if (fallbackIsValid) {
                        results.valid.push(entry);
                    } else {
                        const message = formatStockShortageError(
                            entry.item.item_name || entry.item.item_code,
                            entry.item.actual_qty,
                            entry.qty
                        );
                        entry.message = message;
                        results.invalid.push(entry);
                        results.errors.push(message);
                        if (!aggregateNotifications && eventBus) {
                            eventBus.emit("show_message", {
                                title: message,
                                color: "error",
                            });
                        }
                    }
                }

                results.hasErrors = results.invalid.length > 0;
                return results;
            }

            const issueMap = new Map();
            for (const issue of issues) {
                const key = `${issue.item_code || ''}::${issue.warehouse || ''}`;
                issueMap.set(key, issue);
            }

            candidatesMeta.forEach(({ entry, exceedsAvailable }, index) => {
                const payload = serverCandidates[index];
                const key = `${payload.item_code || ''}::${payload.warehouse || ''}`;
                const issue = issueMap.get(key);

                if (issue) {
                    const available = issue.available_qty ?? entry.item.actual_qty;
                    const requested = issue.requested_qty ?? entry.qty;
                    const message = formatStockShortageError(
                        issue.item_name || entry.item.item_name || payload.item_code,
                        available,
                        requested
                    );
                    entry.message = message;
                    entry.issue = issue;
                    results.invalid.push(entry);
                    results.errors.push(message);

                    if (!aggregateNotifications && eventBus) {
                        eventBus.emit("show_message", {
                            title: message,
                            color: "error",
                        });
                    }

                    return;
                }

                if (allowNegativeStock && exceedsAvailable) {
                    const warningMessage = formatNegativeStockWarning(
                        entry.item.item_name || entry.item.item_code,
                        entry.item.actual_qty,
                        entry.qty
                    );

                    if (!aggregateNotifications && eventBus && showNegativeStockWarning) {
                        eventBus.emit("show_message", {
                            title: warningMessage,
                            color: "warning",
                        });
                    } else if (showNegativeStockWarning) {
                        results.warnings.push({
                            ...entry,
                            message: warningMessage,
                        });
                    }
                }

                results.valid.push(entry);
            });

            results.hasErrors = results.invalid.length > 0;
            return results;
        } finally {
            isValidating.value = false;
        }
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
