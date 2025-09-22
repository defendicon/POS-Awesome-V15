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
