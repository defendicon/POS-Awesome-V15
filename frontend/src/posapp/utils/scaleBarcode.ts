/**
 * Utility functions for scale barcode manipulation and settings.
 */

/**
 * Interface for normalized scale barcode settings.
 */
export interface ScaleBarcodeSettings {
    prefix: string;
    prefix_included_or_not: number;
    no_of_prefix_characters: number;
}

/**
 * Normalizes raw scale barcode settings.
 * @param rawSettings Raw settings object
 * @returns Normalized ScaleBarcodeSettings
 */
export const normalizeScaleBarcodeSettings = (rawSettings: any = {}): ScaleBarcodeSettings => {
    const settings = rawSettings && typeof rawSettings === "object" ? rawSettings : {};
    const prefix = String(settings.prefix || "").trim();
    const prefixIncludedRaw = Number(settings.prefix_included_or_not);
    const prefixLengthRaw = Number(settings.no_of_prefix_characters);

    const prefixIncluded = Number.isFinite(prefixIncludedRaw) ? prefixIncludedRaw : 0;
    const prefixLength = Number.isFinite(prefixLengthRaw) ? prefixLengthRaw : 0;

    return {
        prefix,
        prefix_included_or_not: prefixIncluded,
        no_of_prefix_characters: prefixLength,
    };
};

/**
 * Parses the backend response for scale barcode settings.
 * @param response Raw backend response
 * @returns ScaleBarcodeSettings or null
 */
export const parseScaleBarcodeSettingsResponse = (response: any): ScaleBarcodeSettings | null => {
    const message = response && response.message ? response.message : null;
    if (!message) {
        return null;
    }

    if (message.settings) {
        return message.settings as ScaleBarcodeSettings;
    }

    if (typeof message === "object") {
        const hasKey = (obj: any, key: string) => Object.prototype.hasOwnProperty.call(obj, key);
        if (
            hasKey(message, "prefix") ||
            hasKey(message, "prefix_included_or_not") ||
            hasKey(message, "no_of_prefix_characters")
        ) {
            return message as ScaleBarcodeSettings;
        }
    }

    return null;
};

/**
 * Gets the scale barcode prefix from settings.
 * @param settings Scale barcode settings
 * @returns Prefix string
 */
export const getScaleBarcodePrefix = (settings: Partial<ScaleBarcodeSettings> = {}): string => {
    const prefix = settings?.prefix;
    return typeof prefix === "string" ? prefix.trim() : "";
};

/**
 * Checks if a value matches the scale barcode prefix.
 * @param settings Scale barcode settings
 * @param value Barcode value to check
 * @returns boolean
 */
export const scaleBarcodeMatches = (settings: Partial<ScaleBarcodeSettings> = {}, value: string | null | undefined): boolean => {
    const prefix = getScaleBarcodePrefix(settings);
    if (!prefix) {
        return false;
    }
    return String(value || "").startsWith(prefix);
};
