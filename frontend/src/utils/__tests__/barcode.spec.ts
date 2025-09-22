import { describe, expect, it } from "vitest";
import { isValidEAN13, isValidEAN8, isValidUPCA, parseCandidate } from "@/utils/barcode";

describe("barcode checksum validators", () => {
        describe("isValidEAN13", () => {
                it("accepts valid codes", () => {
                        expect(isValidEAN13("4006381333931")).toBe(true);
                        expect(isValidEAN13("9780201379624")).toBe(true);
                });

                it("rejects invalid checksums", () => {
                        expect(isValidEAN13("4006381333932")).toBe(false);
                });

                it("rejects non-digit or wrong length input", () => {
                        expect(isValidEAN13("400638133393")).toBe(false);
                        expect(isValidEAN13("40063813339312")).toBe(false);
                        expect(isValidEAN13("40063813339A1")).toBe(false);
                });
        });

        describe("isValidEAN8", () => {
                it("accepts valid codes", () => {
                        expect(isValidEAN8("55123457")).toBe(true);
                        expect(isValidEAN8("12345670")).toBe(true);
                });

                it("rejects invalid checksums", () => {
                        expect(isValidEAN8("55123458")).toBe(false);
                });

                it("rejects non-digit or wrong length input", () => {
                        expect(isValidEAN8("5512345")).toBe(false);
                        expect(isValidEAN8("551234571")).toBe(false);
                        expect(isValidEAN8("5512345A")).toBe(false);
                });
        });

        describe("isValidUPCA", () => {
                it("accepts valid codes", () => {
                        expect(isValidUPCA("036000291452")).toBe(true);
                        expect(isValidUPCA("012345678905")).toBe(true);
                });

                it("rejects invalid checksums", () => {
                        expect(isValidUPCA("036000291453")).toBe(false);
                });

                it("rejects non-digit or wrong length input", () => {
                        expect(isValidUPCA("03600029145")).toBe(false);
                        expect(isValidUPCA("0360002914520")).toBe(false);
                        expect(isValidUPCA("03600029145A")).toBe(false);
                });
        });
});

describe("parseCandidate", () => {
        it("classifies known barcode types", () => {
                expect(parseCandidate("4006381333931")).toEqual({
                        type: "EAN13",
                        value: "4006381333931",
                        valid: true,
                });
                expect(parseCandidate("036000291452")).toEqual({
                        type: "UPCA",
                        value: "036000291452",
                        valid: true,
                });
                expect(parseCandidate("55123457")).toEqual({
                        type: "EAN8",
                        value: "55123457",
                        valid: true,
                });
        });

        it("flags invalid checksum for matched symbology", () => {
                expect(parseCandidate("036000291453")).toEqual({
                        type: "UPCA",
                        value: "036000291453",
                        valid: false,
                });
        });

        it("falls back to RAW for non-numeric input", () => {
                expect(parseCandidate("ABC123")).toEqual({
                        type: "RAW",
                        value: "ABC123",
                        valid: false,
                });
        });
});
