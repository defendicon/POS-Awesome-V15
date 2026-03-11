import type { App } from "vue";
import {
	isDynamicImportFailure,
	recoverFromChunkLoadError,
} from "./chunkLoadRecovery";

type ErrorKind = "window_error" | "unhandled_rejection" | "vue_error";

interface ClientErrorPayload {
	kind: ErrorKind;
	message: string;
	stack?: string;
	filename?: string;
	lineno?: number;
	colno?: number;
	info?: string;
	route?: string;
	userAgent?: string;
	url?: string;
	timestamp: string;
}

const ERROR_LOG_METHOD = "posawesome.posawesome.api.utilities.log_client_error";
const DEDUPE_WINDOW_MS = 10000;
const MAX_STRING_LENGTH = 2000;

const recentErrors = new Map<string, number>();

declare global {
	// eslint-disable-next-line no-unused-vars
	interface Window {
		__posaGlobalErrorHandlersInstalled?: boolean;
	}
}

function clip(value: unknown, maxLength: number = MAX_STRING_LENGTH): string {
	const text = String(value ?? "");
	return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function getRoutePath(): string {
	if (typeof window === "undefined") {
		return "";
	}
	return clip(window.location.pathname + window.location.search, 500);
}

function cleanupRecentErrors(now: number) {
	for (const [key, timestamp] of recentErrors.entries()) {
		if (now - timestamp > DEDUPE_WINDOW_MS) {
			recentErrors.delete(key);
		}
	}
}

function shouldDropAsDuplicate(signature: string): boolean {
	const now = Date.now();
	cleanupRecentErrors(now);
	const previous = recentErrors.get(signature);
	if (previous && now - previous < DEDUPE_WINDOW_MS) {
		return true;
	}
	recentErrors.set(signature, now);
	return false;
}

function toPayload(
	kind: ErrorKind,
	data: Partial<ClientErrorPayload>,
): ClientErrorPayload {
	return {
		kind,
		message: clip(data.message || "Unknown client error"),
		stack: data.stack ? clip(data.stack, 8000) : undefined,
		filename: data.filename ? clip(data.filename, 1000) : undefined,
		lineno: data.lineno,
		colno: data.colno,
		info: data.info ? clip(data.info, 1000) : undefined,
		route: getRoutePath(),
		userAgent:
			typeof navigator !== "undefined"
				? clip(navigator.userAgent, 500)
				: undefined,
		url:
			typeof window !== "undefined"
				? clip(window.location.href, 1000)
				: undefined,
		timestamp: new Date().toISOString(),
	};
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === "string") {
		return error;
	}
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}

function getErrorStack(error: unknown): string | undefined {
	if (error instanceof Error) {
		return error.stack;
	}
	return undefined;
}

function submitClientError(payload: ClientErrorPayload) {
	const args = { payload: JSON.stringify(payload) };
	if (typeof frappe !== "undefined" && typeof frappe.call === "function") {
		void frappe
			.call({
				method: ERROR_LOG_METHOD,
				args,
				quiet: true,
				async: true,
			})
			.catch(() => undefined);
		return;
	}

	if (typeof fetch === "function") {
		void fetch(`/api/method/${ERROR_LOG_METHOD}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			credentials: "same-origin",
			body: JSON.stringify(args),
		}).catch(() => undefined);
	}
}

export function isBenignGlobalError(
	error: unknown,
	message?: string,
	filename?: string,
): boolean {
	const normalizedMessage = clip(
		message || getErrorMessage(error),
		500,
	).toLowerCase();
	const normalizedFilename = clip(filename || "", 500).toLowerCase();

	return (
		normalizedMessage.includes("remove_last_divider") ||
		(normalizedMessage.includes("offsetwidth") &&
			normalizedFilename.includes("shortcut.js"))
	);
}

function reportGlobalError(
	kind: ErrorKind,
	payloadData: Partial<ClientErrorPayload>,
) {
	if (
		isBenignGlobalError(
			undefined,
			payloadData.message,
			payloadData.filename,
		)
	) {
		return;
	}

	const payload = toPayload(kind, payloadData);
	const signature = `${payload.kind}|${payload.message}|${payload.filename || ""}|${payload.lineno || 0}`;

	if (shouldDropAsDuplicate(signature)) {
		return;
	}

	submitClientError(payload);
}

export function installGlobalErrorHandlers(app: App) {
	if (typeof window === "undefined") {
		return;
	}

	if (window.__posaGlobalErrorHandlersInstalled) {
		return;
	}

	window.__posaGlobalErrorHandlersInstalled = true;

	const previousWindowOnError = window.onerror;
	window.onerror = (message, source, lineno, colno, error) => {
		if (
			isBenignGlobalError(
				error,
				typeof message === "string" ? message : String(message || ""),
				typeof source === "string" ? source : "",
			)
		) {
			return true;
		}

		if (typeof previousWindowOnError === "function") {
			return previousWindowOnError(message, source, lineno, colno, error);
		}

		return false;
	};

	window.addEventListener("error", (event) => {
		if (isBenignGlobalError(event.error, event.message, event.filename)) {
			event.preventDefault();
			return;
		}

		reportGlobalError("window_error", {
			message: event.message || getErrorMessage(event.error),
			stack: getErrorStack(event.error),
			filename: event.filename,
			lineno: event.lineno,
			colno: event.colno,
		});
	}, { capture: true });

	window.addEventListener("unhandledrejection", (event) => {
		const reason = event.reason;
		if (isDynamicImportFailure(reason)) {
			event.preventDefault();
			void recoverFromChunkLoadError(reason, "unhandled-rejection");
			return;
		}
		reportGlobalError("unhandled_rejection", {
			message: getErrorMessage(reason),
			stack: getErrorStack(reason),
		});
	});

	const previousErrorHandler = app.config.errorHandler;
	app.config.errorHandler = (err, instance, info) => {
		reportGlobalError("vue_error", {
			message: getErrorMessage(err),
			stack: getErrorStack(err),
			info,
			filename: instance?.$?.type?.__file,
		});

		if (typeof previousErrorHandler === "function") {
			previousErrorHandler(err, instance, info);
		}
	};
}
