import { describe, expect, it, beforeEach } from "vitest";
import { parseCandidate } from "@/utils/barcode";
import { createMemoryResolver, type MemoryResolverEntry } from "@/utils/memoryResolver";

describe("memoryResolver", () => {
        const baseMap: Record<string, MemoryResolverEntry> = {
                "4006381333931": { item_id: "ITEM-001", price: 5.75 },
                "55123457": { item_id: "ITEM-002", uom: "Box", pack_size: 10 },
        };

        let resolver = createMemoryResolver({ normalizeUpcToEan13: false });

        beforeEach(() => {
                resolver = createMemoryResolver({ normalizeUpcToEan13: false });
                resolver.load(baseMap);
        });

        it("resolves known barcodes from the loaded map", () => {
                const parsed = parseCandidate("4006381333931");
                const result = resolver.resolve(parsed);
                expect(result).toEqual({
                        found: true,
                        item: {
                                item_id: "ITEM-001",
                                price: 5.75,
                                barcode: "4006381333931",
                                resolvedBarcode: "4006381333931",
                                symbology: "EAN13",
                        },
                });
        });

        it("keeps optional UOM metadata in the result", () => {
                const parsed = parseCandidate("55123457");
                const result = resolver.resolve(parsed);
                expect(result).toEqual({
                        found: true,
                        item: {
                                item_id: "ITEM-002",
                                uom: "Box",
                                pack_size: 10,
                                barcode: "55123457",
                                resolvedBarcode: "55123457",
                                symbology: "EAN8",
                        },
                });
        });

        it("returns NOT_FOUND when lookup fails", () => {
                const parsed = parseCandidate("9780201379624");
                const result = resolver.resolve(parsed);
                expect(result).toEqual({ found: false, reason: "NOT_FOUND" });
        });

        it("returns NOT_NUMERIC for raw non-digit input", () => {
                const parsed = parseCandidate("HELLO");
                const result = resolver.resolve(parsed);
                expect(result).toEqual({ found: false, reason: "NOT_NUMERIC" });
        });

        it("returns INVALID_CHECKSUM when checksum fails", () => {
                const parsed = parseCandidate("036000291453");
                const result = resolver.resolve(parsed);
                expect(result).toEqual({ found: false, reason: "INVALID_CHECKSUM" });
        });

        it("normalizes UPC-A to EAN-13 when configured", () => {
                const withNormalization = createMemoryResolver({ normalizeUpcToEan13: true });
                withNormalization.load({
                        "0036000291452": { item_id: "UPC-TO-EAN", price: 2.99 },
                });
                const parsed = parseCandidate("036000291452");
                const result = withNormalization.resolve(parsed);
                expect(result).toEqual({
                        found: true,
                        item: {
                                item_id: "UPC-TO-EAN",
                                price: 2.99,
                                barcode: "036000291452",
                                resolvedBarcode: "0036000291452",
                                symbology: "UPCA",
                        },
                });
        });

        it("allows updating config from POS settings shape", () => {
                const parsed = parseCandidate("036000291452");
                const resultBefore = resolver.resolve(parsed);
                expect(resultBefore).toEqual({ found: false, reason: "NOT_FOUND" });

                resolver.load({
                        "0036000291452": { item_id: "CONFIG-UPC" },
                });

                resolver.configureFromSettings({ posa_normalize_upc_to_ean13: 1 });
                const resultAfter = resolver.resolve(parsed);
                expect(resultAfter).toEqual({
                        found: true,
                        item: {
                                item_id: "CONFIG-UPC",
                                barcode: "036000291452",
                                resolvedBarcode: "0036000291452",
                                symbology: "UPCA",
                        },
                });
        });
});
