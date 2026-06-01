import {
	bucketCount,
	startPerfMeasure,
	type PerfMetricName,
	type PerfTags,
} from "../utils/perf";

export interface CallOptions {
	freeze?: boolean;
	freeze_message?: string;
	async?: boolean;
	timeoutMs?: number;
	signal?: AbortSignal;
	[key: string]: any;
}

export interface FrappeResponse<T = any> {
	message?: T;
	exc?: string;
	_server_messages?: string;
	request_id?: string;
	server_time?: string;
	[key: string]: any;
}

export interface ApiErrorEnvelope {
	code: string;
	message: string;
	retryable: boolean;
}

export type ApiEnvelope<T = any> =
	| {
			ok: true;
			data: T;
			error: null;
			requestId: string;
			serverTime: string | null;
	  }
	| {
			ok: false;
			data: null;
			error: ApiErrorEnvelope;
			requestId: string;
			serverTime: string | null;
	  };

const DEFAULT_TIMEOUT_MS = 30_000;

const METHOD_METRICS: Array<[string, PerfMetricName]> = [
	["get_active_pos_profile", "pos.boot.profile_load"],
	["get_customer_names", "pos.customers.remote_search"],
	["get_customer_info", "pos.customers.select"],
	["get_customer_balance", "pos.customers.select"],
	["get_items_from_barcode", "pos.items.barcode_lookup"],
	["get_delta_items", "pos.items.delta_sync"],
	["get_items", "pos.items.remote_search"],
	["get_items_details", "pos.items.price_refresh"],
	["update_price_list_rate", "pos.items.price_refresh"],
	["get_active_pricing_rules", "pos.pricing.rules_load"],
	["reconcile_line_prices", "pos.pricing.calculate_cart"],
	["sync_items", "pos.items.delta_sync"],
	["sync_customers", "pos.customers.delta_sync"],
	["sync_payment_method_currencies", "pos.boot.payment_methods_load"],
	["sync_currencies", "pos.boot.currency_load"],
	["submit_invoice", "pos.payment.submit"],
	["create_sales_invoice", "pos.payment.submit"],
	["create_payment", "pos.payment.submit"],
];

function methodMetricName(method: string): PerfMetricName {
	const match = METHOD_METRICS.find(([needle]) => method.includes(needle));
	return match?.[1] || (`pos.api.${method.split(".").slice(-1)[0]}` as PerfMetricName);
}

function countPayload(value: unknown): number | null {
	if (Array.isArray(value)) return value.length;
	if (value && typeof value === "object") {
		const record = value as Record<string, any>;
		if (Array.isArray(record.data)) return record.data.length;
		if (Array.isArray(record.items)) return record.items.length;
		if (Array.isArray(record.customers)) return record.customers.length;
		if (Array.isArray(record.changes)) return record.changes.length;
		if (Array.isArray(record.updates)) return record.updates.length;
	}
	return null;
}

function safeMethodTags(method: string, args: Record<string, any>): PerfTags {
	const tags: PerfTags = {
		method: method.split(".").slice(-2).join("."),
		source: "server",
		online:
			typeof navigator === "undefined" ? true : Boolean(navigator.onLine),
	};
	if (args?.modified_after || args?.watermark || args?.since) {
		tags.source = "server_delta";
	}
	if (args?.limit || args?.limit_page_length) {
		tags.limit_bucket = bucketCount(args.limit || args.limit_page_length);
	}
	return tags;
}

export class ApiEnvelopeError<T = any> extends Error {
	envelope: ApiEnvelope<T>;
	code: string;
	retryable: boolean;
	requestId: string;

	constructor(envelope: ApiEnvelope<T>) {
		super(
			envelope.ok
				? "Unexpected API envelope error"
				: envelope.error.message,
		);
		this.name = "ApiEnvelopeError";
		this.envelope = envelope;
		this.code = envelope.ok ? "UNKNOWN" : envelope.error.code;
		this.retryable = envelope.ok ? false : envelope.error.retryable;
		this.requestId = envelope.requestId;
	}
}

export function isApiEnvelopeError(error: unknown): error is ApiEnvelopeError {
	return (
		error instanceof ApiEnvelopeError || Boolean((error as any)?.envelope)
	);
}

export function isApiEnvelope<T = any>(
	value: unknown,
): value is ApiEnvelope<T> {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as any).ok === "boolean" &&
		"requestId" in value
	);
}

export function unwrapApiResult<T>(result: T | ApiEnvelope<T>): T {
	if (!isApiEnvelope<T>(result)) {
		return result;
	}
	if (result.ok) {
		return result.data;
	}
	throw new ApiEnvelopeError<T>(result);
}

function generateRequestId() {
	const random =
		typeof crypto !== "undefined" && "randomUUID" in crypto
			? crypto.randomUUID()
			: `${Date.now()}-${Math.random().toString(16).slice(2)}`;
	return `posa-${random}`;
}

function getServerTime(response: any): string | null {
	return (
		response?.serverTime ||
		response?.server_time ||
		response?.message?.serverTime ||
		response?.message?.server_time ||
		null
	);
}

function extractServerMessage(payload: any): string | null {
	const serverMessages =
		payload?._server_messages || payload?.server_messages;
	if (!serverMessages) {
		return null;
	}

	try {
		const parsed = JSON.parse(serverMessages);
		if (Array.isArray(parsed) && parsed.length) {
			const first = parsed[0];
			if (typeof first === "string") {
				try {
					const messageObject = JSON.parse(first);
					return (
						messageObject.message || messageObject.title || first
					);
				} catch {
					return first;
				}
			}
			return first?.message || String(first);
		}
	} catch {
		return String(serverMessages);
	}

	return null;
}

function normalizeMessage(value: unknown, fallback: string) {
	if (typeof value === "string" && value.trim()) {
		return value.trim();
	}
	if (value instanceof Error && value.message) {
		return value.message;
	}
	return fallback;
}

function classifyBusinessCode(message: string, explicitCode?: string | null) {
	if (explicitCode) {
		return explicitCode;
	}

	const normalized = message.toLowerCase();
	if (
		normalized.includes(
			"document has been modified after you have opened it",
		) ||
		normalized.includes("timestampmismatcherror")
	) {
		return "TIMESTAMP_MISMATCH";
	}
	if (normalized.includes("amount must be negative")) {
		return "RETURN_PAYMENT_AMOUNT_SIGN";
	}
	if (
		normalized.includes("insufficient stock") ||
		normalized.includes('"errors"')
	) {
		return "INSUFFICIENT_STOCK";
	}
	return "BUSINESS_RULE";
}

function isRetryableTransportStatus(status: number | null) {
	return (
		status === null ||
		status === 0 ||
		status === 408 ||
		status === 429 ||
		status >= 500
	);
}

function errorEnvelope<T>(
	requestId: string,
	serverTime: string | null,
	error: ApiErrorEnvelope,
): ApiEnvelope<T> {
	return {
		ok: false,
		data: null,
		error,
		requestId,
		serverTime,
	};
}

function successEnvelope<T>(
	requestId: string,
	serverTime: string | null,
	data: T,
): ApiEnvelope<T> {
	return {
		ok: true,
		data,
		error: null,
		requestId,
		serverTime,
	};
}

function normalizeExistingEnvelope<T>(
	message: any,
	requestId: string,
	response: any,
): ApiEnvelope<T> | null {
	if (
		!message ||
		typeof message !== "object" ||
		typeof message.ok !== "boolean"
	) {
		return null;
	}

	const envelopeRequestId =
		typeof message.requestId === "string"
			? message.requestId
			: typeof message.request_id === "string"
				? message.request_id
				: requestId;
	const serverTime = getServerTime(message) || getServerTime(response);

	if (message.ok) {
		return successEnvelope<T>(envelopeRequestId, serverTime, message.data);
	}

	const rawError = message.error || {};
	return errorEnvelope<T>(envelopeRequestId, serverTime, {
		code: rawError.code || "BUSINESS_RULE",
		message: normalizeMessage(rawError.message, "Request failed"),
		retryable: Boolean(rawError.retryable),
	});
}

function normalizeBusinessFailure<T>(
	response: any,
	requestId: string,
): ApiEnvelope<T> {
	const message = response?.message;
	const rawError = message?.error || response?.error || {};
	const serverMessage =
		extractServerMessage(response) ||
		extractServerMessage(message) ||
		rawError.message ||
		message?.message ||
		response?.exc ||
		"Request failed";
	const resolvedMessage = normalizeMessage(serverMessage, "Request failed");

	return errorEnvelope<T>(requestId, getServerTime(response), {
		code: classifyBusinessCode(
			resolvedMessage,
			rawError.code || response?.error_code,
		),
		message: resolvedMessage,
		retryable: Boolean(rawError.retryable),
	});
}

function normalizeTransportFailure<T>(
	error: any,
	requestId: string,
): ApiEnvelope<T> {
	const status =
		Number(error?.status || error?.httpStatus || error?.xhr?.status || 0) ||
		null;
	const statusText =
		error?.statusText ||
		error?.xhr?.statusText ||
		error?.message ||
		error?.responseJSON?.message;
	const message = normalizeMessage(
		statusText,
		status ? `HTTP ${status}` : "Network request failed",
	);

	return errorEnvelope<T>(requestId, getServerTime(error), {
		code: status ? "HTTP_ERROR" : "TRANSPORT_ERROR",
		message,
		retryable: isRetryableTransportStatus(status),
	});
}

function normalizeTimeoutFailure<T>(requestId: string): ApiEnvelope<T> {
	return errorEnvelope<T>(requestId, null, {
		code: "TIMEOUT",
		message: "Request timed out",
		retryable: true,
	});
}

function normalizeAbortFailure<T>(requestId: string): ApiEnvelope<T> {
	return errorEnvelope<T>(requestId, null, {
		code: "ABORTED",
		message: "Request was cancelled",
		retryable: false,
	});
}

function withoutInternalOptions(options: CallOptions) {
	const { timeoutMs: _timeoutMs, signal: _signal, ...forwarded } = options;
	return forwarded;
}

const api = {
	callEnvelope<T = any>(
		method: string,
		args: Record<string, any> = {},
		options: CallOptions = {},
	): Promise<ApiEnvelope<T>> {
		const metric = startPerfMeasure(methodMetricName(method), safeMethodTags(method, args));
		const requestId = String(args.request_id || generateRequestId());
		const timeoutMs = Math.max(
			1,
			Number(options.timeoutMs || DEFAULT_TIMEOUT_MS),
		);
		const callArgs = {
			...args,
			request_id: requestId,
		};

		return new Promise((resolve) => {
			let settled = false;
			let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
			const handleAbort = () =>
				settle(normalizeAbortFailure<T>(requestId));

			const settle = (envelope: ApiEnvelope<T>) => {
				if (settled) {
					return;
				}
				settled = true;
				const count = countPayload(envelope.ok ? envelope.data : null);
				metric.finish(envelope.ok ? "success" : "failure", {
					result_count_bucket: count === null ? "unknown" : bucketCount(count),
					retryable: envelope.ok ? false : envelope.error.retryable,
					error_code: envelope.ok ? null : envelope.error.code,
				});
				if (timeoutHandle) {
					clearTimeout(timeoutHandle);
					timeoutHandle = null;
				}
				options.signal?.removeEventListener("abort", handleAbort);
				resolve(envelope);
			};

			if (options.signal?.aborted) {
				settle(normalizeAbortFailure<T>(requestId));
				return;
			}

			options.signal?.addEventListener("abort", handleAbort, {
				once: true,
			});
			timeoutHandle = setTimeout(() => {
				settle(normalizeTimeoutFailure<T>(requestId));
			}, timeoutMs);

			try {
				frappe.call({
					method,
					args: callArgs,
					freeze: options.freeze || false,
					freeze_message: options.freeze_message,
					async: options.async !== false,
					...withoutInternalOptions(options),
					callback: (response: FrappeResponse<T>) => {
						const existingEnvelope = normalizeExistingEnvelope<T>(
							response?.message,
							requestId,
							response,
						);
						if (existingEnvelope) {
							settle(existingEnvelope);
							return;
						}

						if (
							response?.exc ||
							(response?.message &&
								(response.message as any).error)
						) {
							settle(
								normalizeBusinessFailure<T>(
									response,
									requestId,
								),
							);
							return;
						}

						settle(
							successEnvelope<T>(
								requestId,
								getServerTime(response),
								response?.message as T,
							),
						);
					},
					error: (error: any) => {
						settle(normalizeTransportFailure<T>(error, requestId));
					},
				});
			} catch (error) {
				settle(normalizeTransportFailure<T>(error, requestId));
			}
		});
	},

	async call<T = any>(
		method: string,
		args: Record<string, any> = {},
		options: CallOptions = {},
	): Promise<T> {
		const envelope = await this.callEnvelope<T>(method, args, options);
		if (envelope.ok) {
			return envelope.data;
		}
		throw new ApiEnvelopeError<T>(envelope);
	},

	getDoc<T = any>(doctype: string, name: string): Promise<T> {
		return this.call("frappe.client.get", { doctype, name });
	},

	setValue<T = any>(
		doctype: string,
		name: string,
		fieldname: string | Record<string, any>,
		value?: any,
	): Promise<T> {
		const args: any = { doctype, name };
		if (typeof fieldname === "string") {
			args.fieldname = fieldname;
			args.value = value;
		} else {
			args.values = fieldname;
		}
		return this.call("frappe.client.set_value", args);
	},
};

export default api;
