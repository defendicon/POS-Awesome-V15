/**
 * Barcode checksum validators for EAN-13, EAN-8 and UPC-A symbologies.
 *
 * Each helper expects a string that already represents the full code (digits only).
 * It returns `true` if the string has the correct length, contains only digits and
 * its trailing check digit matches the modulo-10 checksum mandated by the
 * respective specification.
 */

const DIGIT_PATTERN = /^\d+$/;
const CHAR_CODE_ZERO = "0".charCodeAt(0);

function isDigits(value: string, expectedLength: number): boolean {
        return value.length === expectedLength && DIGIT_PATTERN.test(value);
}

function charCodeToDigit(code: number): number {
        return code - CHAR_CODE_ZERO;
}

function computeModulo10(base: string, weightForIndex: (index: number) => number): number {
        let sum = 0;
        for (let index = 0; index < base.length; index += 1) {
                const digit = charCodeToDigit(base.charCodeAt(index));
                sum += digit * weightForIndex(index);
        }
        return (10 - (sum % 10)) % 10;
}

function extractCheckDigit(value: string): number {
        return charCodeToDigit(value.charCodeAt(value.length - 1));
}

export type BarcodeSymbology = "EAN13" | "UPCA" | "EAN8";

export type BarcodeParseResult = {
        type: BarcodeSymbology | "RAW";
        value: string;
        valid: boolean;
};

type ParseCandidateOptions = {
        tryOrder?: BarcodeSymbology[];
};

const DEFAULT_TRY_ORDER: BarcodeSymbology[] = ["EAN13", "UPCA", "EAN8"];

const EXPECTED_LENGTH: Record<BarcodeSymbology, number> = {
        EAN13: 13,
        UPCA: 12,
        EAN8: 8,
};

const VALIDATORS: Record<BarcodeSymbology, (value: string) => boolean> = {
        EAN13: isValidEAN13,
        UPCA: isValidUPCA,
        EAN8: isValidEAN8,
};

export function isValidEAN13(value: string): boolean {
        if (!isDigits(value, 13)) {
                return false;
        }
        const expected = computeModulo10(value.slice(0, 12), (index) => (index % 2 === 0 ? 1 : 3));
        return expected === extractCheckDigit(value);
}

export function isValidEAN8(value: string): boolean {
        if (!isDigits(value, 8)) {
                return false;
        }
        const expected = computeModulo10(value.slice(0, 7), (index) => (index % 2 === 0 ? 3 : 1));
        return expected === extractCheckDigit(value);
}

export function isValidUPCA(value: string): boolean {
        if (!isDigits(value, 12)) {
                return false;
        }
        const expected = computeModulo10(value.slice(0, 11), (index) => (index % 2 === 0 ? 3 : 1));
        return expected === extractCheckDigit(value);
}

export function parseCandidate(
        raw: string,
        options: ParseCandidateOptions = {}
): BarcodeParseResult {
        const normalized = raw.trim();
        const { tryOrder = DEFAULT_TRY_ORDER } = options;

        if (!DIGIT_PATTERN.test(normalized)) {
                return { type: "RAW", value: normalized, valid: false };
        }

        for (const type of tryOrder) {
                const expectedLength = EXPECTED_LENGTH[type];
                if (expectedLength === normalized.length) {
                        const validator = VALIDATORS[type];
                        return {
                                type,
                                value: normalized,
                                valid: validator(normalized),
                        };
                }
        }

        return { type: "RAW", value: normalized, valid: false };
}
