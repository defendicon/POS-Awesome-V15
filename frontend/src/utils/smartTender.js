
/**
 * Smart Tender Suggestions Utility
 *
 * This module provides intelligent cash tender suggestions based on the invoice total
 * and available currency denominations. It aims to offer the most reasonable payment
 * options to the cashier to speed up the checkout process.
 *
 * Logic:
 * 1. Round up to the nearest multiple of the smallest denomination.
 * 2. Suggest single large denominations that cover the total.
 * 3. Suggest combinations of large denominations for higher totals.
 *
 * Configuration:
 * - Denominations can be adjusted by passing a custom array.
 * - Max options can be limited.
 */

export const defaultDenominations = {
    PKR: [10, 20, 50, 100, 500, 1000, 5000],
    INR: [10, 20, 50, 100, 200, 500, 2000],
    USD: [1, 5, 10, 20, 50, 100],
    EUR: [5, 10, 20, 50, 100, 200, 500],
    GBP: [5, 10, 20, 50],
    AED: [5, 10, 20, 50, 100, 200, 500, 1000],
    SAR: [1, 5, 10, 50, 100, 500],
    QAR: [1, 5, 10, 50, 100, 500],
};

/**
 * Generates smart cash tender suggestions.
 *
 * @param {number} invoiceTotal - The total amount to be paid.
 * @param {number[]} denominations - Available currency denominations (e.g. [10, 50, 100]).
 * @param {number} [maxOptions=4] - Maximum number of suggestions to return.
 * @returns {number[]} - Sorted array of unique suggested tender amounts.
 */
export function getSmartTenderSuggestions(invoiceTotal, denominations, maxOptions = 4) {
    if (!invoiceTotal || invoiceTotal <= 0) return [];
    if (!denominations || !denominations.length) return [];

    // Ensure denominations are sorted unique
    const denoms = [...new Set(denominations)].sort((a, b) => a - b);
    const smallestDenom = denoms[0];
    const maxDenom = denoms[denoms.length - 1];

    // 1. Calculate Round Up Option
    let roundUpOption = null;
    const remainder = invoiceTotal % smallestDenom;
    if (remainder !== 0) {
        roundUpOption = invoiceTotal + (smallestDenom - remainder);
    } else {
        const potential = Math.ceil(invoiceTotal / smallestDenom) * smallestDenom;
        // If strict inequality preferred: if (potential > invoiceTotal) ...
        // But commonly, paying exact amount is a valid "tender".
        if (potential >= invoiceTotal) {
            roundUpOption = potential;
        }
    }

    // 2. Identify Singles (Simple options)
    const singles = new Set();
    for (const d of denoms) {
        if (d >= invoiceTotal) {
            singles.add(d);
        }
    }

    // 3. Identify Combos
    const combos = new Set();
    let highBase = 0;
    for (const d of denoms) {
        if (d <= invoiceTotal) {
            highBase = d;
        } else {
            break;
        }
    }

    if (highBase > 0) {
        for (const d of denoms) {
             const combo = highBase + d;
             if (combo >= invoiceTotal) {
                 combos.add(combo);
             }
        }
    }

    // Combine all valid options
    const allOptions = new Set();
    if (roundUpOption !== null) allOptions.add(roundUpOption);
    singles.forEach(d => allOptions.add(d));
    combos.forEach(d => allOptions.add(d));

    // Convert to sorted array
    let sortedOptions = [...allOptions]
        .filter(val => val >= invoiceTotal)
        .sort((a, b) => a - b);

    // If within limit, return
    if (sortedOptions.length <= maxOptions) {
        return sortedOptions;
    }

    // Trimming Logic with Prioritization
    const finalSet = new Set();

    // Priority 1: Round Up Option
    if (roundUpOption !== null && roundUpOption >= invoiceTotal) {
        finalSet.add(roundUpOption);
    }

    // Priority 2: Last Resort (Largest Single Denom)
    // Only if it covers the total
    if (maxDenom >= invoiceTotal) {
        finalSet.add(maxDenom);
    }

    // Fill remaining spots
    // We iterate through sortedOptions (which are sorted by value).
    // But we prefer Singles over Combos.

    // Split candidates into singles and others
    const candidateSingles = [];
    const candidateOthers = [];

    for (const opt of sortedOptions) {
        if (finalSet.has(opt)) continue; // Already added
        if (singles.has(opt)) {
            candidateSingles.push(opt);
        } else {
            candidateOthers.push(opt);
        }
    }

    // Fill from Singles first
    while (finalSet.size < maxOptions && candidateSingles.length > 0) {
        finalSet.add(candidateSingles.shift());
    }

    // Fill from Others (Combos)
    while (finalSet.size < maxOptions && candidateOthers.length > 0) {
        finalSet.add(candidateOthers.shift());
    }

    return [...finalSet].sort((a, b) => a - b);
}
