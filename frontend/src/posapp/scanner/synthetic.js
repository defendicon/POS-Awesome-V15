const ESCAPE_MAP = {
        n: "\n",
        t: "\t",
        r: "\r",
        "0": "\0",
        "\\": "\\",
        "{": "{",
        "}": "}",
};

function decodeEscape(char) {
        if (char in ESCAPE_MAP) {
                return ESCAPE_MAP[char];
        }
        return char;
}

function pushSegment(segments, buffer, mode) {
        if (!buffer) {
                        return;
        }
        segments.push({ type: mode, text: buffer });
}

export function parseSyntheticScript(script = "") {
        if (typeof script !== "string" || !script) {
                return [];
        }
        const segments = [];
        let buffer = "";
        let mode = "scanner";
        let escaping = false;
        for (const char of script) {
                if (escaping) {
                        buffer += decodeEscape(char);
                        escaping = false;
                        continue;
                }
                if (char === "\\") {
                        escaping = true;
                        continue;
                }
                if (char === "{" && mode === "scanner") {
                        pushSegment(segments, buffer, mode);
                        buffer = "";
                        mode = "human";
                        continue;
                }
                if (char === "}" && mode === "human") {
                        pushSegment(segments, buffer, mode);
                        buffer = "";
                        mode = "scanner";
                        continue;
                }
                buffer += char;
        }
        pushSegment(segments, buffer, mode);
        return segments.filter((segment) => segment.text);
}

function normalizeToken(entry) {
        if (!entry) {
                return null;
        }
        if (typeof entry === "string") {
                if (entry === "Enter") {
                        return { key: "Enter", char: "\n" };
                }
                if (entry === "Tab") {
                        return { key: "Tab", char: "\t" };
                }
                if (entry.length === 1) {
                        return { key: entry, char: entry };
                }
                return { key: entry, char: entry };
        }
        const key = entry.key || entry.char || "";
        if (!key) {
                return null;
        }
        const char = entry.char ?? (key === "Enter" ? "\n" : key === "Tab" ? "\t" : key);
        return { key: entry.key || key, char };
}

function tokenFromChar(char) {
        if (char === "\n") {
                return { key: "Enter", char };
        }
        if (char === "\t") {
                return { key: "Tab", char };
        }
        return { key: char, char };
}

export function buildSyntheticTimeline(script, options = {}) {
        const segments = Array.isArray(script) ? script : parseSyntheticScript(script);
        const msPerKey = Math.max(1, Number(options.msPerKey) || 5);
        const humanDelay = Math.max(msPerKey, Number(options.humanDelayMs) || 120);
        const includePrefix = options.includePrefix !== false;
        const includeSuffix = options.includeSuffix !== false;
        const timeline = [];

        if (includePrefix && Array.isArray(options.prefixTokens)) {
                        options.prefixTokens.forEach((entry) => {
                                const token = normalizeToken(entry);
                                if (token) {
                                        timeline.push({ token, delay: msPerKey });
                                }
                        });
        }

        segments.forEach((segment) => {
                const delay = segment.type === "human" ? humanDelay : msPerKey;
                if (!segment.text) {
                        return;
                }
                for (const char of segment.text) {
                        const token = tokenFromChar(char);
                        timeline.push({ token, delay });
                }
        });

        if (includeSuffix && Array.isArray(options.suffixTokens)) {
                options.suffixTokens.forEach((entry) => {
                        const token = normalizeToken(entry);
                        if (token) {
                                timeline.push({ token, delay: msPerKey });
                        }
                });
        }

        return timeline;
}
