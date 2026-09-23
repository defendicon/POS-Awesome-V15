const BLOCKED_ELEMENTS = [
	"script",
	"iframe",
	"object",
	"embed",
	"base",
	"link",
	"form",
	"input",
	"button",
	"textarea",
	"select",
	"template",
].join(",");

const URL_ATTRIBUTES = new Set([
	"action",
	"formaction",
	"href",
	"poster",
	"src",
	"xlink:href",
]);

const PRINT_CSP =
	"default-src 'none'; img-src data: blob: http: https:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function sanitizeCss(value: string) {
	return value
		.replace(/@import\s+[^;]+;?/gi, "")
		.replace(/expression\s*\([^)]*\)/gi, "")
		.replace(/(?:behavior|-moz-binding)\s*:[^;]+;?/gi, "")
		.replace(
			/url\s*\(\s*(['"]?)\s*(?:javascript|vbscript|data\s*:\s*text\/html)[^)]*\)/gi,
			"",
		);
}

function isSafeUrl(value: string) {
	const normalized = Array.from(value)
		.filter((character) => {
			const code = character.charCodeAt(0);
			return code > 32 && code !== 127;
		})
		.join("")
		.trim();
	if (!normalized || normalized.startsWith("#")) return true;
	if (/^(?:https?:|blob:|mailto:|tel:)/i.test(normalized)) return true;
	if (/^data:image\/(?:png|gif|jpeg|jpg|webp|bmp);base64,/i.test(normalized))
		return true;
	return !/^[a-z][a-z\d+.-]*:/i.test(normalized);
}

function addPrintCsp(doc: Document) {
	doc.head
		.querySelectorAll("meta[http-equiv]")
		.forEach((node) => node.remove());
	const meta = doc.createElement("meta");
	meta.setAttribute("http-equiv", "Content-Security-Policy");
	meta.setAttribute("content", PRINT_CSP);
	doc.head.prepend(meta);
}

function sanitizeWithDom(html: string) {
	const parser = new DOMParser();
	const doc = parser.parseFromString(html, "text/html");
	doc.querySelectorAll(BLOCKED_ELEMENTS).forEach((node) => node.remove());

	doc.querySelectorAll("*").forEach((element) => {
		for (const attribute of Array.from(element.attributes)) {
			const name = attribute.name.toLowerCase();
			if (
				name.startsWith("on") ||
				name === "srcdoc" ||
				name === "srcset"
			) {
				element.removeAttribute(attribute.name);
				continue;
			}
			if (name === "style") {
				const cleaned = sanitizeCss(attribute.value);
				if (cleaned) element.setAttribute(attribute.name, cleaned);
				else element.removeAttribute(attribute.name);
				continue;
			}
			if (URL_ATTRIBUTES.has(name) && !isSafeUrl(attribute.value)) {
				element.removeAttribute(attribute.name);
			}
		}
	});

	doc.querySelectorAll("style").forEach((element) => {
		element.textContent = sanitizeCss(element.textContent || "");
	});
	addPrintCsp(doc);
	return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
}

function sanitizeWithoutDom(html: string) {
	let cleaned = html
		.replace(
			/<(script|iframe|object|embed|base|link|form|input|button|textarea|select|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
			"",
		)
		.replace(
			/<(script|iframe|object|embed|base|link|form|input|button|textarea|select|template)\b[^>]*\/?\s*>/gi,
			"",
		)
		.replace(
			/\s(?:on[a-z\d_-]+|srcdoc|srcset)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
			"",
		)
		.replace(
			/\s(?:href|src|action|formaction|poster|xlink:href)\s*=\s*(["'])\s*(?:javascript|vbscript|data\s*:\s*text\/html)[\s\S]*?\1/gi,
			"",
		);
	cleaned = sanitizeCss(cleaned);
	const csp = `<meta http-equiv="Content-Security-Policy" content="${PRINT_CSP}">`;
	return /<head\b[^>]*>/i.test(cleaned)
		? cleaned.replace(/<head\b([^>]*)>/i, `<head$1>${csp}`)
		: `${csp}${cleaned}`;
}

export function sanitizePrintHtml(value: unknown) {
	const html = String(value ?? "");
	if (!html) return "";
	return typeof DOMParser === "function"
		? sanitizeWithDom(html)
		: sanitizeWithoutDom(html);
}
