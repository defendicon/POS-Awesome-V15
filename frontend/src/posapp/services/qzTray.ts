import { ref } from "vue";

declare const frappe: any;

export type QzCertStatus = "unknown" | "trusted" | "untrusted";

export interface QzPrintHtmlOptions {
	printerName?: string;
	widthMm?: number;
	orientation?: "portrait" | "landscape";
}

export interface QzPrintDocumentOptions extends QzPrintHtmlOptions {
	doctype: string;
	name: string;
	printFormat?: string;
	letterhead?: string | null;
	noLetterhead?: string | number | null;
}

const PRINTER_STORAGE_KEY = "posa_qz_printer_name";
const CERT_READY_STORAGE_KEY = "posa_qz_cert_ready";
const DEFAULT_PRINT_FORMAT = "Standard";
const QZ_SCRIPT_CANDIDATES = [
	"/assets/posawesome/dist/js/libs/qz-tray.js",
	"/assets/posawesome/dist/js/libs/qz-tray.min.js",
	"https://cdn.jsdelivr.net/npm/qz-tray@2.2.5/qz-tray.js",
];

export const qzConnected = ref(false);
export const qzConnecting = ref(false);
export const qzCertStatus = ref<QzCertStatus>("unknown");
export const qzPrinters = ref<string[]>([]);
export const selectedQzPrinter = ref(getSavedPrinterName());
export const qzCertReady = ref(loadCertReady());

let securityInitialized = false;
let cachedCertificate: string | null = null;
let certificateProvided = false;
let connectPromise: Promise<boolean> | null = null;
let certificateChecked = false;
let qzApi: any = null;
let qzLoadPromise: Promise<any> | null = null;

function extractMessage<T>(value: any): T {
	if (value && typeof value === "object" && "message" in value) {
		return value.message as T;
	}
	return value as T;
}

async function callServer<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
	const response = await frappe.call({
		method,
		args,
	});
	return extractMessage<T>(response);
}

function buildPrintHtml(html: string, style: string): string {
	return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>${style || ""}</style>
</head>
<body>${html}</body>
</html>`;
}

function loadCertReady() {
	try {
		return localStorage.getItem(CERT_READY_STORAGE_KEY) === "1";
	} catch {
		return false;
	}
}

function saveCertReady(value: boolean) {
	try {
		if (value) {
			localStorage.setItem(CERT_READY_STORAGE_KEY, "1");
		} else {
			localStorage.removeItem(CERT_READY_STORAGE_KEY);
		}
	} catch {
		// ignore localStorage errors
	}
}

function loadExternalScript(src: string): Promise<void> {
	return new Promise((resolve, reject) => {
		if (typeof document === "undefined") {
			reject(new Error("Document is unavailable."));
			return;
		}
		const existing = document.querySelector(`script[data-qz-src="${src}"]`) as HTMLScriptElement | null;
		if (existing) {
			if (existing.dataset.loaded === "1") {
				resolve();
				return;
			}
			existing.addEventListener("load", () => resolve(), { once: true });
			existing.addEventListener("error", () => reject(new Error(`Failed to load script: ${src}`)), {
				once: true,
			});
			return;
		}

		const script = document.createElement("script");
		script.src = src;
		script.async = true;
		script.defer = true;
		script.dataset.qzSrc = src;
		script.addEventListener(
			"load",
			() => {
				script.dataset.loaded = "1";
				resolve();
			},
			{ once: true },
		);
		script.addEventListener(
			"error",
			() => {
				reject(new Error(`Failed to load script: ${src}`));
			},
			{ once: true },
		);
		document.head.appendChild(script);
	});
}

async function resolveQzApi() {
	if (qzApi) {
		return qzApi;
	}
	const globalQz = (window as any)?.qz;
	if (globalQz) {
		qzApi = globalQz;
		return qzApi;
	}

	if (qzLoadPromise) {
		return qzLoadPromise;
	}

	qzLoadPromise = (async () => {
		for (const src of QZ_SCRIPT_CANDIDATES) {
			try {
				await loadExternalScript(src);
				const loaded = (window as any)?.qz;
				if (loaded) {
					qzApi = loaded;
					return qzApi;
				}
			} catch {
				// try next candidate
			}
		}
		throw new Error("QZ Tray browser library was not found.");
	})();

	try {
		return await qzLoadPromise;
	} finally {
		qzLoadPromise = null;
	}
}

function setupSecurity(qzClient: any) {
	if (securityInitialized) return;
	securityInitialized = true;

	qzClient.security.setCertificatePromise((resolve: (value?: string) => void) => {
		if (cachedCertificate) {
			certificateProvided = true;
			resolve(cachedCertificate);
			return;
		}

		callServer<string>("posawesome.posawesome.api.qz.get_certificate")
			.then((certificate) => {
				if (certificate) {
					cachedCertificate = certificate;
					certificateProvided = true;
					qzCertReady.value = true;
					saveCertReady(true);
				} else {
					certificateProvided = false;
					qzCertStatus.value = "untrusted";
				}
				resolve(certificate || undefined);
			})
			.catch((error) => {
				console.warn("Unable to fetch QZ certificate", error);
				certificateProvided = false;
				qzCertStatus.value = "untrusted";
				resolve(undefined);
			});
	});

	qzClient.security.setSignatureAlgorithm("SHA512");
	qzClient.security.setSignaturePromise((toSign: string) => {
		return (resolve) => {
			callServer<string>("posawesome.posawesome.api.qz.sign_message", {
				message: toSign,
			})
				.then((signature) => {
					if (signature && certificateProvided) {
						qzCertStatus.value = "trusted";
						qzCertReady.value = true;
						saveCertReady(true);
					} else {
						qzCertStatus.value = "untrusted";
					}
					resolve(signature || undefined);
				})
				.catch((error) => {
					console.warn("Unable to sign QZ payload", error);
					qzCertStatus.value = "untrusted";
					resolve(undefined);
				});
		};
	});
}

export function getSavedPrinterName() {
	try {
		return localStorage.getItem(PRINTER_STORAGE_KEY) || "";
	} catch {
		return "";
	}
}

export function savePrinterName(name: string) {
	try {
		if (name) {
			localStorage.setItem(PRINTER_STORAGE_KEY, name);
		} else {
			localStorage.removeItem(PRINTER_STORAGE_KEY);
		}
	} catch {
		// ignore localStorage errors
	}
}

export function setSelectedQzPrinter(name: string) {
	selectedQzPrinter.value = name || "";
	savePrinterName(name);
}

export async function connectQzTray(): Promise<boolean> {
	let qzClient: any;
	try {
		qzClient = await resolveQzApi();
	} catch (error) {
		console.warn("QZ Tray JS bridge is not available", error);
		qzConnected.value = false;
		return false;
	}

	if (qzClient.websocket.isActive()) {
		qzConnected.value = true;
		return true;
	}

	if (connectPromise) {
		return connectPromise;
	}

	connectPromise = (async () => {
		setupSecurity(qzClient);
		qzConnecting.value = true;

		qzClient.websocket.setClosedCallbacks(() => {
			qzConnected.value = false;
			qzConnecting.value = false;
			qzCertStatus.value = "unknown";
		});

		try {
			await qzClient.websocket.connect();
			qzConnected.value = true;
			qzClient.printers.find().catch(() => undefined);
			return true;
		} catch (error) {
			console.warn("Unable to connect to QZ Tray", error);
			qzConnected.value = false;
			return false;
		} finally {
			qzConnecting.value = false;
		}
	})();

	try {
		return await connectPromise;
	} finally {
		connectPromise = null;
	}
}

export async function disconnectQzTray() {
	let qzClient: any;
	try {
		qzClient = await resolveQzApi();
	} catch {
		qzConnected.value = false;
		return;
	}

	if (!qzClient.websocket.isActive()) {
		qzConnected.value = false;
		return;
	}

	try {
		await qzClient.websocket.disconnect();
	} catch (error) {
		console.warn("Unable to disconnect from QZ Tray", error);
	} finally {
		qzConnected.value = false;
	}
}

export async function findQzPrinters(): Promise<string[]> {
	let qzClient: any;
	try {
		qzClient = await resolveQzApi();
	} catch (error) {
		console.warn("QZ Tray JS bridge is not available", error);
		qzPrinters.value = [];
		return [];
	}

	if (!qzClient.websocket.isActive()) {
		const connected = await connectQzTray();
		if (!connected) {
			return [];
		}
	}

	try {
		const result = await qzClient.printers.find();
		const printers = Array.isArray(result)
			? result
			: result
				? [String(result)]
				: [];

		qzPrinters.value = printers;
		const saved = getSavedPrinterName();

		if (saved && printers.includes(saved)) {
			setSelectedQzPrinter(saved);
		} else if (selectedQzPrinter.value && printers.includes(selectedQzPrinter.value)) {
			setSelectedQzPrinter(selectedQzPrinter.value);
		} else if (printers.length > 0) {
			const firstPrinter = printers[0];
			if (firstPrinter) {
				setSelectedQzPrinter(firstPrinter);
			}
		} else {
			setSelectedQzPrinter("");
		}

		return printers;
	} catch (error) {
		console.error("Unable to load QZ printers", error);
		qzPrinters.value = [];
		return [];
	}
}

export async function checkQzCertificateOnce() {
	if (certificateChecked) {
		return qzCertReady.value;
	}

	certificateChecked = true;
	if (qzCertReady.value) {
		return true;
	}

	try {
		const certificate = await callServer<string>("posawesome.posawesome.api.qz.get_certificate");
		if (certificate) {
			cachedCertificate = certificate;
			qzCertReady.value = true;
			saveCertReady(true);
		}
	} catch {
		// certificate may not exist yet
	}

	return qzCertReady.value;
}

export async function setupQzCertificate() {
	const result = await callServer<{
		status: "exists" | "created";
		message?: string;
		cert_path?: string;
	}>("posawesome.posawesome.api.qz.setup_qz_certificate");

	qzCertReady.value = true;
	saveCertReady(true);
	return result;
}

export async function getQzCertificateDownload() {
	const result = await callServer<{ pem?: string; company?: string }>(
		"posawesome.posawesome.api.qz.get_certificate_download",
	);
	if (!result?.pem) {
		throw new Error("QZ certificate is not available.");
	}
	qzCertReady.value = true;
	saveCertReady(true);
	return result;
}

export function getQzCertificateFilename(company?: string | null) {
	const clean = (company || "").replace(/[^a-zA-Z0-9_\- ]/g, "").trim();
	return clean ? `${clean}.crt` : "certificate.crt";
}

export async function printHtmlViaQz(html: string, options: QzPrintHtmlOptions = {}) {
	if (!html) {
		throw new Error("Nothing to print.");
	}

	const qzClient = await resolveQzApi();
	if (!qzClient.websocket.isActive()) {
		const connected = await connectQzTray();
		if (!connected) {
			throw new Error("QZ Tray is not available.");
		}
	}

	let printer = options.printerName || selectedQzPrinter.value || getSavedPrinterName();
	if (!printer) {
		const printers = await findQzPrinters();
		const firstPrinter = printers[0];
		if (firstPrinter) {
			printer = firstPrinter;
			setSelectedQzPrinter(firstPrinter);
		}
	}

	if (!printer) {
		throw new Error("No QZ printer selected.");
	}

	const config = qzClient.configs.create(printer, {
		size: {
			width: options.widthMm || 80,
			height: null,
		},
		units: "mm",
		orientation: options.orientation || "portrait",
		margins: { top: 0, right: 0, bottom: 0, left: 0 },
		colorType: "grayscale",
		interpolation: "nearest-neighbor",
	});

	const data = [
		{
			type: "pixel",
			format: "html",
			flavor: "plain",
			data: html,
		},
	];

	await qzClient.print(config, data);
}

export async function printDocumentViaQz(options: QzPrintDocumentOptions) {
	if (!options?.doctype || !options?.name) {
		throw new Error("Invalid print document details.");
	}

	const printFormat = options.printFormat || DEFAULT_PRINT_FORMAT;
	const noLetterhead =
		options.letterhead && String(options.letterhead).trim() ? 0 : options.noLetterhead ?? 1;

	const response = await frappe.call({
		method: "frappe.www.printview.get_html_and_style",
		args: {
			doc: options.doctype,
			name: options.name,
			print_format: printFormat,
			no_letterhead: noLetterhead,
			letterhead: options.letterhead || undefined,
		},
	});

	const html = response?.html || response?.message?.html;
	const style = response?.style || response?.message?.style || "";

	if (!html) {
		throw new Error("Unable to load print HTML from server.");
	}

	await printHtmlViaQz(buildPrintHtml(html, style), options);
}
