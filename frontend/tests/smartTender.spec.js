
import { describe, it, expect } from "vitest";
import { getSmartTenderSuggestions } from "../src/utils/smartTender";

describe("getSmartTenderSuggestions", () => {
    const denomsPKR = [100, 500, 1000, 5000];
    const denomsSmall = [50, 100, 500, 1000, 5000];

    it("Example 1: Invoice 280, Denoms [100...]", () => {
        const result = getSmartTenderSuggestions(280, denomsPKR, 4);
        expect(result).toEqual([300, 500, 1000, 5000]);
    });

    it("Example 2: Invoice 540, Denoms [50...]", () => {
        const result = getSmartTenderSuggestions(540, denomsSmall, 4);
        expect(result).toEqual([550, 600, 1000, 5000]);
    });

    it("Example 3: Invoice 1080, Denoms [100...]", () => {
        const result = getSmartTenderSuggestions(1080, denomsPKR, 4);
        expect(result).toEqual([1100, 1500, 2000, 5000]);
    });

    it("Small Invoice: 50", () => {
        const denoms = [10, 20, 50, 100];
        const result = getSmartTenderSuggestions(50, denoms, 4);
        expect(result).toEqual([50, 60, 70, 100]);
    });

    it("Exact Match High Denom: 500", () => {
        const denoms = [100, 500, 1000];
        const result = getSmartTenderSuggestions(500, denoms, 4);
        expect(result).toEqual([500, 600, 1000, 1500]);
    });

    it("Handles empty inputs", () => {
        expect(getSmartTenderSuggestions(0, [])).toEqual([]);
        expect(getSmartTenderSuggestions(100, [])).toEqual([]);
    });
});
