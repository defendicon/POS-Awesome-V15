// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { sanitizePrintHtml } from "../src/posapp/utils/sanitizePrintHtml";

describe("sanitizePrintHtml", () => {
	it("keeps printable markup while removing active content", () => {
		const html = sanitizePrintHtml(`<!DOCTYPE html><html><head>
			<style>@import url(https://evil.test/a.css); .safe { color: green } .bad { behavior:url(x) }</style>
		</head><body onload="alert(1)">
			<script>alert(1)</script>
			<iframe srcdoc="<script>alert(2)</script>"></iframe>
			<link rel="stylesheet" href="https://evil.test/a.css">
			<a href="java\nscript:alert(3)">bad</a>
			<img src="data:image/png;base64,AAAA" srcset="https://evil.test/a.png 2x" onerror="alert(4)">
			<strong class="safe">Receipt</strong>
		</body></html>`);

		expect(html).not.toMatch(
			/<script|<iframe|<link|onload=|onerror=|srcset=|javascript:|@import|behavior\s*:/i,
		);
		expect(html).toContain('<strong class="safe">Receipt</strong>');
		expect(html).toContain("data:image/png;base64,AAAA");
		expect(html).toContain("Content-Security-Policy");
	});
});
