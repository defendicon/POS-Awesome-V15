import { watch, nextTick } from "vue";
import { ensureInvoiceClientRequestId } from "../../../../offline/idempotency";
import {
	cartScopeIsComplete,
	clearCartRecovery,
	readCartRecovery,
	saveCartRecovery,
	type CartRecoveryScope,
} from "../../../utils/cartRecovery";

/** Use the existing document builder/loader; no parallel pricing or cart model. */
export function startCartRecovery(context: any) {
	let active: CartRecoveryScope | null = null;
	let paused = false,
		stopped = false,
		version = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const scope = (): CartRecoveryScope => ({
		user: globalThis.frappe?.session?.user || "",
		cashier: context.currentCashier?.user || "",
		profile: context.pos_profile?.name || "",
		company: context.pos_profile?.company || "",
		warehouse: context.pos_profile?.warehouse || "",
		opening: context.pos_opening_shift?.name || "",
	});
	const report = (error: any) => {
		context.cartRecoveryError = error?.message || String(error);
	};
	function flush() {
		clearTimeout(timer);
		if (!active || paused || context.exchangeSession) return true;
		try {
			const doc = context.get_invoice_doc();
			if (doc?.items?.length) {
				ensureInvoiceClientRequestId(doc);
				if (!context.invoice_doc?.posa_client_request_id)
					context.invoiceStore.mergeInvoiceDoc({
						posa_client_request_id: doc.posa_client_request_id,
					});
			}
			saveCartRecovery(active, doc);
			context.cartRecoveryError = "";
			return true;
		} catch (error) {
			report(error);
			return false;
		}
	}
	const stopScope = watch(
		() => JSON.stringify(scope()),
		async () => {
			const next = scope();
			if (!cartScopeIsComplete(next)) return;
			const run = ++version;
			if (
				active &&
				["user", "profile", "company", "warehouse", "opening"].every(
					(key) =>
						active![key as keyof CartRecoveryScope] ===
						next[key as keyof CartRecoveryScope],
				)
			)
				flush();
			else clearTimeout(timer);
			const changing = Boolean(
				active && JSON.stringify(active) !== JSON.stringify(next),
			);
			active = next;
			paused = true;
			try {
				// Save the outgoing cart before clearing its customer/payment state.
				if (changing) {
					context.uiStore.closePaymentDialog();
					context.uiStore.setActiveView("items");
					context.clear_invoice();
				}
				const record = readCartRecovery(next);
				if (
					!record ||
					context.exchangeSession ||
					(!changing && context.items.length)
				)
					return;
				const { db, ensureOfflineQueueReady } = await import(
					"../../../../offline/index"
				);
				await ensureOfflineQueueReady();
				const id = record.invoice.posa_client_request_id;
				if (id) {
					const [queued, outbox] = await Promise.all([
						db
							.table("write_queue")
							.where("idempotency_key")
							.equals(`invoice:${id}`)
							.first(),
						db
							.table("invoice_outbox")
							.where("client_request_id")
							.equals(id)
							.first(),
					]);
					if (
						queued ||
						outbox ||
						localStorage.getItem(
							`posa_invoice_intent_${encodeURIComponent(id)}`,
						)
					) {
						clearCartRecovery(next);
						return;
					}
				}
				if (stopped || run !== version || context.exchangeSession)
					return;
				await context.load_invoice(record.invoice);
				context.cartRecoveryMessage =
					"Recovered this cashier's saved cart. Review prices, stock and payment amounts before completing the sale.";
				await nextTick();
			} catch (error) {
				report(error);
			} finally {
				if (run === version) paused = false;
			}
		},
		{ immediate: true, flush: "sync" },
	);
	const stopCart = watch(
		() => [
			context.items,
			context.invoice_doc,
			context.customer,
			context.additional_discount,
			context.additional_discount_percentage,
			context.selected_currency,
			context.selected_price_list,
			context.posting_date,
		],
		() => {
			if (paused) return;
			clearTimeout(timer);
			timer = setTimeout(flush, 200);
		},
		{ deep: true, flush: "post" },
	);
	const hide = () => {
		if (document.visibilityState === "hidden") flush();
	};
	const beforeSwitch = (event: Event) => {
		if (paused || !flush()) event.preventDefault();
	};
	window.addEventListener("pagehide", flush);
	window.addEventListener("posa:before-cashier-switch", beforeSwitch);
	window.addEventListener("posa:before-cache-clear", beforeSwitch);
	document.addEventListener("visibilitychange", hide);
	return {
		flush,
		stop() {
			flush();
			stopped = true;
			version++;
			clearTimeout(timer);
			stopScope();
			stopCart();
			window.removeEventListener("pagehide", flush);
			window.removeEventListener(
				"posa:before-cashier-switch",
				beforeSwitch,
			);
			window.removeEventListener("posa:before-cache-clear", beforeSwitch);
			document.removeEventListener("visibilitychange", hide);
		},
	};
}
