export function parseScaleBarcode(rawCode, rawPrefix) {
        const code = typeof rawCode === "string" ? rawCode.trim() : "";
        const prefix = typeof rawPrefix === "string" ? rawPrefix.trim() : "";

        if (!code) {
                return { isScale: false, baseCode: "", quantity: null, checkDigit: "" };
        }

        if (!prefix || !code.startsWith(prefix)) {
                return { isScale: false, baseCode: code, quantity: null, checkDigit: "" };
        }

        const remainder = code.slice(prefix.length);
        const payloadLength = 6; // 5 digits for quantity + 1 check digit
        const hasPayload = remainder.length >= payloadLength;
        const itemCodePart = hasPayload ? remainder.slice(0, remainder.length - payloadLength) : remainder;
        const baseCode = `${prefix}${itemCodePart}`;

        if (!hasPayload) {
                return { isScale: true, baseCode, quantity: null, checkDigit: remainder.slice(-1) };
        }

        const payload = remainder.slice(-payloadLength);
        const quantityDigits = payload.slice(0, payloadLength - 1);
        const checkDigit = payload.slice(-1);

        let quantityString = null;
        if (/^\d{5}$/.test(quantityDigits)) {
                if (quantityDigits.startsWith("0000")) {
                        quantityString = `0.00${quantityDigits.slice(4)}`;
                } else if (quantityDigits.startsWith("000")) {
                        quantityString = `0.0${quantityDigits.slice(3)}`;
                } else if (quantityDigits.startsWith("00")) {
                        quantityString = `0.${quantityDigits.slice(2)}`;
                } else if (quantityDigits.startsWith("0")) {
                        quantityString = `${quantityDigits.slice(1, 2)}.${quantityDigits.slice(2)}`;
                } else {
                        quantityString = `${quantityDigits.slice(0, 2)}.${quantityDigits.slice(2)}`;
                }
        }

        let quantity = null;
        if (quantityString !== null) {
                const parsed = parseFloat(quantityString);
                if (!Number.isNaN(parsed)) {
                        quantity = parsed;
                }
        }

        return { isScale: true, baseCode, quantity, checkDigit };
}
