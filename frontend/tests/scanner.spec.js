import assert from "node:assert/strict";
import { computeGtinCheckDigit, normalizeUpcToEan13, validateGtin } from "../src/posapp/scanner/checksum.js";
import { resolveScannerConfig } from "../src/posapp/scanner/config.js";
import { buildSyntheticTimeline, parseSyntheticScript } from "../src/posapp/scanner/synthetic.js";

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

function run() {
        testComputeGtin();
        testValidateGtin();
        testNormalizeUpc();
        testResolveConfig();
        testSyntheticParser();
        testSyntheticTimeline();
        console.log("scanner.spec.js: all tests passed");
}

run();
