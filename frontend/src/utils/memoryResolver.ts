import type { BarcodeParseResult } from "@/utils/barcode";

const DIGIT_PATTERN = /^\d+$/;

export type MemoryResolverEntry = {
        item_id: string;
        uom?: string;
        pack_size?: number;
        price?: number;
};

export type MemoryResolvedItem = MemoryResolverEntry & {
        /**
         * Raw code that was provided by the scanner/user.
         */
        barcode: string;
        /**
         * Code that matched the in-memory map (may differ when normalization is applied).
         */
        resolvedBarcode: string;
        /**
         * Symbology that parseCandidate detected for the scan attempt.
         */
        symbology: BarcodeParseResult["type"];
};

export type MemoryResolverResult =
        | { found: true; item: MemoryResolvedItem }
        | { found: false; reason: "NOT_NUMERIC" | "NOT_FOUND" | "INVALID_CHECKSUM" };

export type MemoryResolverConfig = {
        normalizeUpcToEan13: boolean;
};

const DEFAULT_CONFIG: MemoryResolverConfig = {
        normalizeUpcToEan13: false,
};

type ConfigSource = {
        posa_normalize_upc_to_ean13?: unknown;
        normalize_upc_to_ean13?: unknown;
        normalizeUpcToEan13?: unknown;
};

function extractBoolean(value: unknown): boolean | undefined {
        if (typeof value === "boolean") {
                return value;
        }
        if (typeof value === "number") {
                return value !== 0;
        }
        if (typeof value === "string") {
                const normalized = value.trim().toLowerCase();
                if (!normalized) return undefined;
                if (["1", "true", "yes", "y"].includes(normalized)) {
                        return true;
                }
                if (["0", "false", "no", "n"].includes(normalized)) {
                        return false;
                }
        }
        return undefined;
}

function extractFromSource(source: unknown): boolean | undefined {
        if (!source || typeof source !== "object") {
                return undefined;
        }
        const candidate = source as ConfigSource;
        const value =
                candidate.posa_normalize_upc_to_ean13 ??
                candidate.normalize_upc_to_ean13 ??
                candidate.normalizeUpcToEan13;
        return extractBoolean(value);
}

function deriveInitialConfig(): MemoryResolverConfig {
        const globalContext = globalThis as { frappe?: { boot?: Record<string, unknown> } };
        const boot = globalContext.frappe?.boot;
        const sources = [boot?.pos_profile, boot?.pos_settings, boot?.posa_settings];
        for (const source of sources) {
                const derived = extractFromSource(source);
                if (typeof derived === "boolean") {
                        return { normalizeUpcToEan13: derived };
                }
        }
        return { ...DEFAULT_CONFIG };
}

function applySettings(
        config: MemoryResolverConfig,
        source: unknown,
): MemoryResolverConfig {
        const value = extractFromSource(source);
        if (typeof value === "boolean") {
                return { ...config, normalizeUpcToEan13: value };
        }
        return config;
}

export function createMemoryResolver(initial?: Partial<MemoryResolverConfig>) {
        const state = {
                config: { ...DEFAULT_CONFIG, ...deriveInitialConfig(), ...initial },
                table: new Map<string, MemoryResolverEntry>(),
        };

        function load(barcodeMap: Record<string, MemoryResolverEntry>) {
                state.table.clear();
                if (!barcodeMap || typeof barcodeMap !== "object") {
                        return;
                }
                for (const [rawKey, entry] of Object.entries(barcodeMap)) {
                        const key = String(rawKey ?? "").trim();
                        if (!key) {
                                continue;
                        }
                        if (!entry || typeof entry !== "object") {
                                continue;
                        }
                        state.table.set(key, { ...entry });
                }
        }

        function resolve(parsed: BarcodeParseResult): MemoryResolverResult {
                const rawValue = parsed.value.trim();

                if (parsed.type === "RAW" && !DIGIT_PATTERN.test(rawValue)) {
                        return { found: false, reason: "NOT_NUMERIC" };
                }

                if (parsed.type !== "RAW" && !parsed.valid) {
                        return { found: false, reason: "INVALID_CHECKSUM" };
                }

                const candidates: string[] = [rawValue];
                if (state.config.normalizeUpcToEan13 && parsed.type === "UPCA" && parsed.valid) {
                        candidates.unshift(`0${rawValue}`);
                }

                for (const candidate of candidates) {
                        const hit = state.table.get(candidate);
                        if (hit) {
                                return {
                                        found: true,
                                        item: {
                                                ...hit,
                                                barcode: rawValue,
                                                resolvedBarcode: candidate,
                                                symbology: parsed.type,
                                        },
                                };
                        }
                }

                return { found: false, reason: "NOT_FOUND" };
        }

        function configure(next: Partial<MemoryResolverConfig>) {
                if (next && typeof next.normalizeUpcToEan13 === "boolean") {
                        state.config.normalizeUpcToEan13 = next.normalizeUpcToEan13;
                }
        }

        function configureFromSettings(source: unknown) {
                state.config = applySettings(state.config, source);
        }

        function getConfig(): MemoryResolverConfig {
                return { ...state.config };
        }

        return {
                load,
                resolve,
                configure,
                configureFromSettings,
                getConfig,
        };
}

export const memoryResolver = createMemoryResolver();
