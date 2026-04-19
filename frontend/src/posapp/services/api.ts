/**
 * Options forwarded to `frappe.call()` in addition to the standard method/args pair.
 * Any extra keys are spread directly onto the Frappe call options object, so Frappe-native
 * flags (e.g. `btn`, `type`) can be passed through unchanged.
 *
 * Note: `callback` and `error` are **not** forwarded — `api.call` manages them internally
 * to wrap the result in a Promise.
 */
export interface CallOptions {
  /** Show the Frappe freeze overlay while the request is in flight. Default: `false`. */
  freeze?: boolean;
  /** Message to display inside the freeze overlay. Ignored when `freeze` is `false`. */
  freeze_message?: string;
  /**
   * Whether the request should be asynchronous. Default: `true`.
   * Setting this to `false` makes the call synchronous — avoid in most contexts.
   */
  async?: boolean;
  [key: string]: any;
}

/**
 * Raw response envelope returned by `frappe.call()` before unwrapping.
 * `message` carries the whitelisted Python return value; `exc` is set when the
 * server raised an exception.
 */
export interface FrappeResponse<T = any> {
  /** The return value of the whitelisted Python method. `undefined` on failure. */
  message?: T;
  /**
   * Stringified Python traceback when the server threw an exception.
   * Its presence indicates a server-side error regardless of HTTP status.
   */
  exc?: string;
  [key: string]: any;
}

/**
 * Thin Promise-based wrapper over `frappe.call()` and common Frappe client methods.
 *
 * Import the default export:
 * ```ts
 * import api from "@/posapp/services/api";
 * const result = await api.call("posawesome.api.pos.get_pos_data", { profile });
 * ```
 */
const api = {
  /**
   * Calls a whitelisted Frappe Python method and returns a Promise that resolves with
   * `response.message`.
   *
   * **Rejection conditions** — the Promise rejects when:
   * 1. `response.exc` is truthy (server-side Python exception).
   * 2. `response.message.error` is truthy (the method returned an error object).
   * 3. The `frappe.call` `error` callback fires (network failure or HTTP error).
   *
   * In all rejection cases the full raw `FrappeResponse` (or the Frappe error object)
   * is passed as the rejection reason.
   *
   * @param method - Dotted Python path to the whitelisted method, e.g.
   *   `"posawesome.posawesome.api.pos.get_pos_data"`.
   * @param args - Keyword arguments forwarded to the Python method.
   * @param options - Optional Frappe call flags. `async` defaults to `true`,
   *   `freeze` defaults to `false`.
   * @returns Promise resolving to `response.message` cast as `T`.
   */
  call<T = any>(method: string, args: Record<string, any> = {}, options: CallOptions = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      frappe.call({
        method,
        args,
        freeze: options.freeze || false,
        freeze_message: options.freeze_message,
        async: options.async !== false, // default true
        ...options,
        callback: (r: FrappeResponse<T>) => {
          if (r.exc || (r.message && (r.message as any).error)) {
            reject(r);
          } else {
            resolve(r.message as T);
          }
        },
        error: (r: any) => {
          reject(r);
        }
      });
    });
  },

  /**
   * Fetches a single Frappe document by doctype and name.
   * Resolves with the full document object returned by `frappe.client.get`.
   *
   * @param doctype - ERPNext doctype name, e.g. `"POS Invoice"`.
   * @param name - Document name (primary key), e.g. `"ACC-PSINV-2024-00001"`.
   */
  getDoc<T = any>(doctype: string, name: string): Promise<T> {
    return this.call("frappe.client.get", { doctype, name });
  },

  /**
   * Sets one or more field values on an existing Frappe document via `frappe.client.set_value`.
   *
   * Two call signatures are supported:
   * - **Single field**: `setValue(doctype, name, "fieldname", value)`
   * - **Bulk update**: `setValue(doctype, name, { field1: val1, field2: val2 })`
   *
   * @param doctype - ERPNext doctype name.
   * @param name - Document name (primary key).
   * @param fieldname - Either a single field name string or a `{ field: value }` map for
   *   bulk updates.
   * @param value - The value to set. Only used when `fieldname` is a string.
   */
  setValue<T = any>(doctype: string, name: string, fieldname: string | Record<string, any>, value?: any): Promise<T> {
    const args: any = { doctype, name };
    if (typeof fieldname === "string") {
      args.fieldname = fieldname;
      args.value = value;
    } else {
      args.values = fieldname;
    }
    return this.call("frappe.client.set_value", args);
  }
};

export default api;
