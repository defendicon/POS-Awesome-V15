import { computed, ref } from "vue";
import { resolveScannerConfig } from "./config.js";
import { guessSymbology, normalizeUpcToEan13, validateGtin } from "./checksum.js";
import { buildSyntheticTimeline } from "./synthetic.js";

let frameCounter = 0;
const CONTROL_KEYS = new Set([
	"Shift",
	"Control",
	"Alt",
	"Meta",
	"CapsLock",
	"NumLock",
	"ScrollLock",
	"Dead",
]);

const SPECIAL_KEY_CHARS = {
	Enter: "\n",
	Tab: "\t",
	ArrowUp: "",
	ArrowDown: "",
	ArrowLeft: "",
	ArrowRight: "",
};

function getTimestamp(event) {
	if (event && typeof event.timeStamp === "number") {
		return event.timeStamp;
	}
	if (typeof performance !== "undefined" && typeof performance.now === "function") {
		return performance.now();
	}
	return Date.now();
}

function eventToToken(event) {
	if (!event) {
		return null;
	}

	if (CONTROL_KEYS.has(event.key) || event.repeat) {
		return null;
	}

	if (event.ctrlKey || event.metaKey) {
		return null;
	}

	let char = null;
	if (event.key && event.key.length === 1) {
		char = event.key;
	} else if (Object.prototype.hasOwnProperty.call(SPECIAL_KEY_CHARS, event.key)) {
		char = SPECIAL_KEY_CHARS[event.key];
	}

	return {
		char,
		key: event.key,
		code: event.code,
	};
}

function tokensFromTerminator(value) {
	if (!value) {
		return [];
	}
	const tokens = [];
	const parts = Array.isArray(value) ? value : [value];
	parts.forEach((entry) => {
		if (!entry && entry !== 0) {
			return;
		}
		if (typeof entry === "string" && entry.length > 1 && entry in SPECIAL_KEY_CHARS) {
			tokens.push({ key: entry, char: SPECIAL_KEY_CHARS[entry] });
			return;
		}
		const normalized = typeof entry === "string" ? entry : String(entry);
		for (const ch of normalized) {
			if (Object.prototype.hasOwnProperty.call(SPECIAL_KEY_CHARS, ch)) {
				tokens.push({ key: ch, char: SPECIAL_KEY_CHARS[ch] });
			} else {
				tokens.push({ key: ch, char: ch });
			}
		}
	});
	return tokens;
}

function tokensEqual(a, b) {
	if (!a || !b) {
		return false;
	}
	if (a.key && b.key && a.key === b.key) {
		return true;
	}
	if (a.char && b.char && a.char === b.char) {
		return true;
	}
	return false;
}

function deriveCode(token) {
        if (!token) {
                return "KeyA";
        }
        const key = token.key || "";
        const char = token.char || "";
        if (key === "Enter" || char === "\n") {
                return "Enter";
        }
        if (key === "Tab" || char === "\t") {
                return "Tab";
        }
        if (key === "Backspace") {
                return "Backspace";
        }
        if (key === "Escape") {
                return "Escape";
        }
        const target = key && key.length === 1 ? key : char;
        if (!target) {
                return "KeyA";
        }
        if (/^[0-9]$/.test(target)) {
                return `Digit${target}`;
        }
        const upper = target.toUpperCase();
        if (/^[A-Z]$/.test(upper)) {
                return `Key${upper}`;
        }
        return key && key.length > 1 ? key : `Key${upper || "A"}`;
}

function wait(ms) {
        return new Promise((resolve) => {
                if (!Number.isFinite(ms) || ms <= 0) {
                        resolve();
                        return;
                }
                setTimeout(resolve, ms);
        });
}

export function useScanner(profileSettings = {}) {
	const listeners = new Set();
	const isScanning = ref(false);
	const diagnostics = ref({
		lastFrame: null,
		queueDepth: 0,
		histogram: [],
	});

	let overrides = {};
	let config = resolveScannerConfig(profileSettings, overrides);
	let prefixTokens = tokensFromTerminator(config.prefix);
	let suffixTokens = tokensFromTerminator(config.suffix);
	let prefixBuffer = [];
	let frame = null;
	let idleTimer = null;
	let lastEventEntry = null;
	let lastFrameHash = "";
	let lastFrameTime = 0;
	let attached = false;
	let pendingHistogram = [];
	let currentProfileSettings = profileSettings || {};

	function debug(...args) {
		if (typeof window !== "undefined") {
			const flag = window.DEBUG_SCANNER || window.localStorage?.getItem("DEBUG_SCANNER");
			if (flag) {
				console.debug("[scanner]", ...args);
			}
		}
	}

	function resetFrame(reason = "reset") {
		if (idleTimer) {
			clearTimeout(idleTimer);
			idleTimer = null;
		}
                if (frame && frame.events.length && reason !== "finalized") {
                        debug("Frame discarded", reason, frame.raw);
                }
                frame = null;
                prefixBuffer = [];
                pendingHistogram = [];
                lastEventEntry = null;
                if (isScanning.value) {
                        isScanning.value = false;
                }
        }

	function ensureIdleTimer() {
		if (!frame) {
			return;
		}
		if (idleTimer) {
			clearTimeout(idleTimer);
		}
		idleTimer = setTimeout(() => {
			finalizeFrame("idle_timeout");
		}, config.idleCloseMs);
	}

	function flushPendingSuffix() {
		if (!frame || !frame.pendingSuffix.length) {
			return;
		}
		frame.tokens.push(...frame.pendingSuffix);
		frame.pendingSuffix = [];
		frame.raw = frame.tokens.map((token) => token.char || "").join("");
	}

	function addTokenToFrame(entry) {
		if (!frame) {
			return;
		}
		const token = entry.token;
		if (!token) {
			return;
		}

		frame.events.push({
			ts: entry.timestamp,
			key: token.key,
			char: token.char,
			delta: entry.delta,
		});

		if (suffixTokens.length) {
			const expect = suffixTokens[frame.suffixProgress];
			if (tokensEqual(token, expect)) {
				frame.pendingSuffix.push(token);
				frame.suffixProgress += 1;
				if (frame.suffixProgress >= suffixTokens.length) {
					finalizeFrame("terminator");
				}
				return;
			}
			if (frame.pendingSuffix.length) {
				flushPendingSuffix();
			}
			frame.suffixProgress = tokensEqual(token, suffixTokens[0]) ? 1 : 0;
			if (frame.suffixProgress) {
				frame.pendingSuffix = [token];
				if (frame.suffixProgress >= suffixTokens.length) {
					finalizeFrame("terminator");
				}
				return;
			}
		}

		frame.tokens.push(token);
		frame.raw = frame.tokens.map((t) => t.char || "").join("");
	}

	function computeFrameHash(raw) {
		return raw;
	}

	function finalizeFrame(reason = "completed") {
		if (!frame) {
			return;
		}

		if (idleTimer) {
			clearTimeout(idleTimer);
			idleTimer = null;
		}

		flushPendingSuffix();

		const raw = frame.tokens.map((token) => token.char || "").join("");
		frame.raw = raw;
		frame.completedAt = Date.now();
		frame.reason = reason;

		if (!raw) {
			resetFrame("empty");
			return;
		}

		const now = Date.now();
                const hash = computeFrameHash(raw);
                const elapsed = frame.completedAt - frame.startedAt;
                const suspiciousDuration =
                        elapsed <= Math.max(Number(config.timeGapScannerMs) || 0, 10);
                if (
                        config.dedupCooldownMs > 0 &&
                        hash &&
                        hash === lastFrameHash &&
                        now - lastFrameTime < config.dedupCooldownMs &&
                        suspiciousDuration
                ) {
                        debug("Deduplicated scan", raw);
                        resetFrame("dedup");
                        return;
                }
                lastFrameHash = hash;
                lastFrameTime = now;

                const symbology = guessSymbology(raw);
		const gtinValid = config.enableChecksumValidation ? validateGtin(raw) : true;
		const normalized =
			config.normalizeUpcToEan13 && symbology === "UPC-A" ? normalizeUpcToEan13(raw) : raw;

		const payload = {
			id: frame.id,
			code: normalized,
			raw,
			startedAt: frame.startedAt,
			completedAt: frame.completedAt,
			durationMs: elapsed,
			meta: {
				reason,
				events: frame.events,
				symbology,
				gtinValid,
				originalSymbology: symbology,
			},
		};

		diagnostics.value = {
			lastFrame: {
				...payload,
				histogram: pendingHistogram.slice(),
			},
			queueDepth: diagnostics.value.queueDepth,
			histogram: pendingHistogram.slice(),
		};

                listeners.forEach((callback) => {
                        try {
                                callback(payload);
                        } catch (error) {
                                console.error("Scanner listener failed", error);
                        }
                });

                debug("Frame emitted", payload);
                frame = null;
                prefixBuffer = [];
                pendingHistogram = [];
                lastEventEntry = null;
                isScanning.value = false;
        }

	function startFrame(initialEntries = []) {
		const timestamp = Date.now();
		frame = {
			id: ++frameCounter,
			tokens: [],
			pendingSuffix: [],
			suffixProgress: 0,
			startedAt: timestamp,
			events: [],
			raw: "",
			completedAt: null,
			reason: "",
		};
		isScanning.value = true;
		prefixBuffer = [];
		pendingHistogram = [];
		initialEntries.forEach((entry) => addTokenToFrame(entry));
		ensureIdleTimer();
	}

	function handlePrefix(entry) {
		if (!prefixTokens.length) {
			return false;
		}
		prefixBuffer.push(entry.token);
		if (prefixBuffer.length > prefixTokens.length) {
			prefixBuffer.shift();
		}
		if (prefixBuffer.length < prefixTokens.length) {
			return true;
		}
		for (let i = 0; i < prefixTokens.length; i += 1) {
			if (!tokensEqual(prefixBuffer[i], prefixTokens[i])) {
				return true;
			}
		}
		startFrame();
		return true;
	}

	function onKeydown(event) {
		if (!config.enabled) {
			return;
		}
		const token = eventToToken(event);
		const timestamp = getTimestamp(event);
		const delta = lastEventEntry ? timestamp - lastEventEntry.timestamp : Infinity;
		const entry = { token, timestamp, delta };

		if (frame) {
			if (delta >= config.timeGapHumanMs) {
				finalizeFrame("gap_timeout");
			}
		}

		if (!token) {
			lastEventEntry = entry;
			return;
		}

                if (frame) {
                        if (config.feedbackToasts) {
                                event.preventDefault();
                                event.stopPropagation();
                        }
                        addTokenToFrame(entry);
                        ensureIdleTimer();
                        if (Number.isFinite(delta)) {
                                pendingHistogram.push(delta);
                        }
                        lastEventEntry = frame ? entry : null;
                        return;
                }

		if (handlePrefix(entry)) {
			if (frame) {
				event.preventDefault();
				event.stopPropagation();
				ensureIdleTimer();
			}
			lastEventEntry = entry;
			return;
		}

		if (delta <= config.timeGapScannerMs && lastEventEntry && lastEventEntry.token) {
			startFrame([lastEventEntry, entry]);
			event.preventDefault();
			event.stopPropagation();
			if (Number.isFinite(delta)) {
				pendingHistogram.push(delta);
			}
			lastEventEntry = entry;
			return;
		}

		lastEventEntry = entry;
	}

	function start() {
		if (attached) {
			return;
		}
		window.addEventListener("keydown", onKeydown, true);
		attached = true;
	}

	function stop() {
		if (!attached) {
			return;
		}
		window.removeEventListener("keydown", onKeydown, true);
		attached = false;
		resetFrame("stopped");
	}

	function onScan(callback) {
		if (typeof callback !== "function") {
			return () => {};
		}
		listeners.add(callback);
		return () => listeners.delete(callback);
	}

	function configure(next = {}) {
		if (next && typeof next === "object" && next.profile) {
			currentProfileSettings = next.profile;
		}
		if (next && typeof next === "object" && next.overrides) {
			overrides = { ...overrides, ...next.overrides };
		} else if (next && typeof next === "object" && !next.profile) {
			overrides = { ...overrides, ...next };
		}
		config = resolveScannerConfig(currentProfileSettings, overrides);
		prefixTokens = tokensFromTerminator(config.prefix);
		suffixTokens = tokensFromTerminator(config.suffix);
		resetFrame("reconfigure");
		return config;
	}

        function updateDiagnosticsQueueDepth(depth) {
                diagnostics.value = {
                        ...diagnostics.value,
                        queueDepth: depth,
                };
        }

        async function simulateText(script, options = {}) {
                if (typeof window === "undefined") {
                        return;
                }
                const timeline = buildSyntheticTimeline(script, {
                        msPerKey: options.msPerKey,
                        humanDelayMs: options.humanDelayMs,
                        includePrefix: options.includePrefix,
                        includeSuffix: options.includeSuffix,
                        prefixTokens,
                        suffixTokens,
                });
                if (!timeline.length) {
                        return;
                }
                const baseDelay = Number.isFinite(options.initialDelayMs) ? options.initialDelayMs : 0;
                const nowProvider =
                        typeof performance !== "undefined" && typeof performance.now === "function"
                                ? () => performance.now()
                                : () => Date.now();
                let syntheticTimestamp = nowProvider();
                if (baseDelay > 0) {
                        await wait(baseDelay);
                        syntheticTimestamp += baseDelay;
                }
                for (const entry of timeline) {
                        const delay = Number.isFinite(entry.delay) ? entry.delay : 0;
                        if (delay > 0) {
                                await wait(delay);
                                syntheticTimestamp += delay;
                        }
                        const token = entry.token || {};
                        const key = token.key || token.char || "";
                        const event = {
                                key,
                                code: deriveCode(token),
                                ctrlKey: false,
                                metaKey: false,
                                repeat: false,
                                timeStamp: syntheticTimestamp,
                                preventDefault() {},
                                stopPropagation() {},
                        };
                        onKeydown(event);
                }
        }

        const currentConfig = computed(() => ({ ...config }));

        return {
                start,
                stop,
                configure,
                onScan,
                isScanning,
                diagnostics,
                updateDiagnosticsQueueDepth,
                simulateText,
                config: currentConfig,
        };
}
