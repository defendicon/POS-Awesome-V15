import qz from "qz-tray";
import { ref } from "vue";
import { useUIStore } from "../stores/uiStore";

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
const MANUAL_DISCONNECT_STORAGE_KEY = "posa_qz_manual_disconnect";
const DEFAULT_PRINT_FORMAT = "Standard";
const PROFILE_PRINTER_FIELD = "posa_qz_printer_name";

export const qzConnected = ref(false);
export const qzConnecting = ref(false);
export const qzCertStatus = ref<QzCertStatus>("unknown");
export const qzPrinters = ref<string[]>([]);
export const selectedQzPrinter = ref(getSavedPrinterName());
export const qzCertReady = ref(loadCertReady());
export const qzReconnectPaused = ref(loadReconnectPaused());

let securityInitialized = false;
let cachedCertificate: string | null = null;
let certificateProvided = false;
let connectPromise: Promise<boolean> | null = null;
let certificateChecked = false;

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

function loadReconnectPaused() {
	try {
		return localStorage.getItem(MANUAL_DISCONNECT_STORAGE_KEY) === "1";
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

function saveReconnectPaused(value: boolean) {
	try {
		if (value) {
			localStorage.setItem(MANUAL_DISCONNECT_STORAGE_KEY, "1");
		} else {
			localStorage.removeItem(MANUAL_DISCONNECT_STORAGE_KEY);
		}
	} catch {
		// ignore localStorage errors
	}
}

function setReconnectPaused(value: boolean) {
	qzReconnectPaused.value = value;
	saveReconnectPaused(value);
}

function getProfileDefaultPrinterName() {
	try {
		const uiStore = useUIStore();
		const profile =
			uiStore?.posProfile && typeof uiStore.posProfile === "object" && "value" in uiStore.posProfile
				? uiStore.posProfile.value
				: uiStore?.posProfile;

		if (!profile || typeof profile !== "object") {
			return "";
		}

		const value = profile[PROFILE_PRINTER_FIELD];
		if (typeof value === "string" && value.trim()) {
			return value.trim();
		}
	} catch {
		// ignore store access issues outside app context
	}

	return "";
}

function setResolvedQzPrinter(name: string) {
	selectedQzPrinter.value = name || "";
}

function resolvePreferredPrinter(printers: string[]) {
	const saved = getSavedPrinterName();
	if (saved && printers.includes(saved)) {
		return saved;
	}

	const profileDefault = getProfileDefaultPrinterName();
	if (profileDefault && printers.includes(profileDefault)) {
		return profileDefault;
	}

	if (selectedQzPrinter.value && printers.includes(selectedQzPrinter.value)) {
		return selectedQzPrinter.value;
	}

	return printers[0] || "";
}

function setupSecurity() {
	if (securityInitialized) return;
	securityInitialized = true;

	qz.security.setCertificatePromise((resolve) => {
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

	qz.security.setSignatureAlgorithm("SHA512");
	qz.security.setSignaturePromise((toSign) => {
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
	setResolvedQzPrinter(name);
	savePrinterName(name);
}

export async function connectQzTray(options: { userInitiated?: boolean } = {}): Promise<boolean> {
	if (options.userInitiated) {
		setReconnectPaused(false);
	}

	if (qz.websocket.isActive()) {
		qzConnected.value = true;
		return true;
	}

	if (qzReconnectPaused.value) {
		qzConnected.value = false;
		qzConnecting.value = false;
		return false;
	}

	if (connectPromise) {
		return connectPromise;
	}

	connectPromise = (async () => {
		setupSecurity();
		qzConnecting.value = true;

		qz.websocket.setClosedCallbacks(() => {
			qzConnected.value = false;
			qzConnecting.value = false;
			qzCertStatus.value = "unknown";
		});

		try {
			await qz.websocket.connect();
			qzConnected.value = true;
			qz.printers.find().catch(() => undefined);
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

export async function disconnectQzTray(options: { manual?: boolean } = {}) {
	if (options.manual !== false) {
		setReconnectPaused(true);
	}

	if (!qz.websocket.isActive()) {
		qzConnected.value = false;
		qzConnecting.value = false;
		return;
	}

	try {
		await qz.websocket.disconnect();
	} catch (error) {
		console.warn("Unable to disconnect from QZ Tray", error);
	} finally {
		qzConnected.value = false;
		qzConnecting.value = false;
	}
}

export async function findQzPrinters(): Promise<string[]> {
	if (!qz.websocket.isActive()) {
		if (qzReconnectPaused.value) {
			qzConnected.value = false;
			return qzPrinters.value;
		}

		const connected = await connectQzTray();
		if (!connected) {
			return qzPrinters.value;
		}
	}

	try {
		const result = await qz.printers.find();
		const printers = Array.isArray(result)
			? result
			: result
				? [String(result)]
				: [];

		qzPrinters.value = printers;
		setResolvedQzPrinter(resolvePreferredPrinter(printers));

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

	if (!qz.websocket.isActive()) {
		const connected = await connectQzTray();
		if (!connected) {
			if (qzReconnectPaused.value) {
				throw new Error("QZ Tray is manually disconnected. Press Connect to enable it again.");
			}
			throw new Error("QZ Tray is not available.");
		}
	}

	let printer =
		options.printerName ||
		selectedQzPrinter.value ||
		getSavedPrinterName() ||
		getProfileDefaultPrinterName();
	if (!printer) {
		const printers = await findQzPrinters();
		const firstPrinter = printers[0];
		if (firstPrinter) {
			printer = firstPrinter;
			setResolvedQzPrinter(firstPrinter);
		}
	}

	if (!printer) {
		throw new Error("No QZ printer selected.");
	}

	const config = qz.configs.create(printer, {
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

	await qz.print(config, data);
}

export async function sendRawToQz(data: string, printerName?: string) {
  if (!qz.websocket.isActive()) {
    const connected = await connectQzTray();
    if (!connected) {
      if (qzReconnectPaused.value) {
        throw new Error("QZ Tray is manually disconnected. Press Connect to enable it again.");
      }
      throw new Error("QZ Tray is not available.");
    }
  }

  let printer = printerName || selectedQzPrinter.value || getSavedPrinterName() || getProfileDefaultPrinterName();
  if (!printer) {
    const printers = await findQzPrinters();
    if (printers[0]) {
      printer = printers[0];
      setResolvedQzPrinter(printers[0]);
    }
  }

  if (!printer) {
    throw new Error("No QZ printer selected.");
  }

  const config = qz.configs.create(printer);
  const printData = [
    {
      type: "raw",
      format: "plain",
      flavor: "command",
      data: data,
    },
  ];

  await qz.print(config, printData);
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
