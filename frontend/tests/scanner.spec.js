import assert from "node:assert/strict";
import { setTimeout as wait } from "node:timers/promises";
import { computeGtinCheckDigit, normalizeUpcToEan13, validateGtin } from "../src/posapp/scanner/checksum.js";
import { resolveScannerConfig } from "../src/posapp/scanner/config.js";
import { buildSyntheticTimeline, parseSyntheticScript } from "../src/posapp/scanner/synthetic.js";
import { useScanner } from "../src/posapp/scanner/useScanner.js";

const windowListeners = new Map();

function setupScannerEnvironment() {
        windowListeners.clear();
        globalThis.window = {
                addEventListener(type, handler) {
                        windowListeners.set(type, handler);
                },
                removeEventListener(type) {
                        windowListeners.delete(type);
                },
                dispatchEvent(event) {
                        const handler = windowListeners.get(event.type);
                        if (handler) {
                                handler(event);
                        }
                },
                localStorage: {
                        getItem() {
                                return null;
                        },
                        setItem() {},
                        removeItem() {},
                },
        };
        if (!globalThis.performance) {
                        globalThis.performance = { now: () => Date.now() };
        }
}

function createTestScanner() {
        setupScannerEnvironment();
        const scanner = useScanner();
        scanner.start();
        return scanner;
}

function testComputeGtin() {
	assert.equal(computeGtinCheckDigit("400638133393"), 1, "EAN-13 checksum");
	assert.equal(computeGtinCheckDigit("03600029145"), 2, "UPC-A checksum");
	assert.equal(computeGtinCheckDigit("1234567"), 0, "EAN-8 checksum");
}

function testValidateGtin() {
	assert.ok(validateGtin("4006381333931"), "Valid EAN-13");
	assert.ok(!validateGtin("4006381333932"), "Invalid EAN-13");
	assert.ok(validateGtin("036000291452"), "Valid UPC-A");
	assert.ok(!validateGtin("036000291453"), "Invalid UPC-A");
	assert.ok(validateGtin("12345670"), "Valid EAN-8");
}

function testNormalizeUpc() {
	assert.equal(normalizeUpcToEan13("036000291452"), "0036000291452");
	assert.equal(normalizeUpcToEan13("123456789012"), "0123456789012");
	assert.equal(normalizeUpcToEan13("ABC"), "ABC", "Non-numeric untouched");
}

function testResolveConfig() {
        const cfg = resolveScannerConfig(
                { scanner: { suffix: "\r", enableChecksumValidation: false } },
                {
                        timeGapScannerMs: 15,
			feedbackToasts: false,
		},
	);
	assert.equal(cfg.suffix, "\r");
	assert.equal(cfg.timeGapScannerMs, 15);
	assert.equal(cfg.enableChecksumValidation, false);
        assert.equal(cfg.feedbackToasts, false);
        assert.equal(cfg.enabled, true);
}

function testSyntheticParser() {
        const segments = parseSyntheticScript("123{AB}45\\n");
        assert.deepEqual(segments, [
                { type: "scanner", text: "123" },
                { type: "human", text: "AB" },
                { type: "scanner", text: "45\n" },
        ]);
        const escaped = parseSyntheticScript("\\{12\\}");
        assert.equal(escaped.length, 1);
        assert.equal(escaped[0].text, "{12}");
}

function testSyntheticTimeline() {
        const timeline = buildSyntheticTimeline("12{AB}", {
                msPerKey: 2,
                humanDelayMs: 100,
                includePrefix: true,
                includeSuffix: true,
                prefixTokens: [{ key: "^", char: "^" }],
                suffixTokens: [{ key: "Enter", char: "\n" }],
        });
        assert.equal(timeline.length, 6);
        assert.equal(timeline[0].token.char, "^");
        assert.equal(timeline[timeline.length - 1].token.char, "\n");
        assert.equal(timeline[1].delay, 2);
        assert.equal(timeline[2].delay, 2);
        assert.equal(timeline[3].delay, 100);
        assert.equal(timeline[4].delay, 100);
}

async function testSequentialFrames() {
        const scanner = createTestScanner();
        const frames = [];
        const detach = scanner.onScan((frame) => frames.push(frame));
        await scanner.simulateText("123456789012", { msPerKey: 6 });
        await scanner.simulateText("987654321098", { msPerKey: 6, initialDelayMs: 5 });
        await wait(10);
        detach();
        scanner.stop();
        assert.equal(frames.length, 2, "Distinct scans should enqueue separately");
        assert.equal(frames[0].code.trim(), "123456789012");
        assert.equal(frames[1].code.trim(), "987654321098");
}

async function testRapidDuplicateFramesAllowed() {
        const scanner = createTestScanner();
        const frames = [];
        const detach = scanner.onScan((frame) => frames.push(frame));
        await scanner.simulateText("555555555555", { msPerKey: 8 });
        await scanner.simulateText("555555555555", { msPerKey: 8, initialDelayMs: 8 });
        await wait(10);
        detach();
        scanner.stop();
        assert.equal(frames.length, 2, "Intentional repeat scans should pass through");
        frames.forEach((frame) => {
                assert.equal(frame.code.trim(), "555555555555");
        });
}

async function testEchoDeduplication() {
        const scanner = createTestScanner();
        const frames = [];
        const detach = scanner.onScan((frame) => frames.push(frame));
        await scanner.simulateText("ABC123", { msPerKey: 1 });
        await scanner.simulateText("ABC123", { msPerKey: 1, initialDelayMs: 1 });
        await wait(5);
        detach();
        scanner.stop();
        assert.equal(frames.length, 1, "Spurious echo scans should be deduplicated");
        assert.equal(frames[0].code.trim(), "ABC123");
}

async function run() {
        testComputeGtin();
        testValidateGtin();
        testNormalizeUpc();
        testResolveConfig();
        testSyntheticParser();
        testSyntheticTimeline();
        await testSequentialFrames();
        await testRapidDuplicateFramesAllowed();
        await testEchoDeduplication();
        console.log("scanner.spec.js: all tests passed");
}

run().catch((error) => {
        console.error(error);
        process.exitCode = 1;
});
