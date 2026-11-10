import { watch, nextTick } from "vue";
import { ensureInvoiceClientRequestId } from "../../../../offline/idempotency";
import {
	SAFE_REFRESH_PREPARE,
	type RefreshPreparation,
} from "../../../services/safeRefresh";
import {
	cartScopeIsComplete,
	clearCartRecovery,
	readCartRecovery,
	saveCartRecovery,
	getCartRecoveryKey,
	readCartRecoveryAtKey,
	listRestartCartRecoveries,
	lockCartRecovery,
	cartRecoveryLocksAvailable,
	type CartRecoveryScope,
	type RestartCartCandidate,
} from "../../../utils/cartRecovery";

/** Use the existing document builder/loader; no parallel pricing or cart model. */
export function startCartRecovery(context: any) {
	let active: CartRecoveryScope | null = null;
	let paused = false,
		stopped = false,
		version = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let releaseOwnership: (() => void) | null = null;
	let releasePendingSource: (() => void) | null = null;
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
	async function alreadySubmitted(invoice: any) {
		const id = invoice.posa_client_request_id;
		if (!id) return false;
		const { db, ensureOfflineQueueReady } = await import(
			"../../../../offline/index"
		);
		await ensureOfflineQueueReady();
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
		return Boolean(
			queued ||
				outbox ||
				localStorage.getItem(
					`posa_invoice_intent_${encodeURIComponent(id)}`,
				),
		);
	}
	async function refreshCandidates() {
		const run = version;
		if (!active || stopped || context.exchangeSession) return;
		try {
			const { candidates, issues } =
				await listRestartCartRecoveries(active);
			const available: RestartCartCandidate[] = [];
			for (const candidate of candidates) {
				if (!(await alreadySubmitted(candidate.snapshot.invoice)))
					available.push(candidate);
			}
			if (run !== version || stopped) return;
			context.cartRecoveryCandidates = available;
			context.cartRecoveryReviewWarning = issues.join(" ");
		} catch (error) {
			report(error);
		}
	}
	const recoveredMessage =
		"Recovered this cashier's saved cart. Review prices, stock and payment amounts before completing the sale.";
	async function recoverSavedCart(key: string) {
		if (!active || stopped || paused || !releaseOwnership) return false;
		const next = active;
		const run = version;
		let releaseSource: (() => void) | null = null;
		paused = true;
		context.cartRecoveryBusy = true;
		try {
			if (context.items.length || context.exchangeSession)
				throw new Error(
					"Finish or save the current sale before recovering another cart.",
				);
			releaseSource = await lockCartRecovery(key);
			if (!releaseSource)
				throw new Error(
					"This saved cart is open in another tab. Close that tab first.",
				);
			const record = readCartRecoveryAtKey(next, key);
			if (
				!record?.restart_recoverable ||
				!record.invoice.posa_client_request_id ||
				!["Sales Invoice", "POS Invoice"].includes(
					record.invoice.doctype,
				) ||
				record.invoice.is_return
			)
				throw new Error("This saved cart requires recovery review.");
			if (await alreadySubmitted(record.invoice))
				throw new Error(
					"This sale is already queued or submitted. Check invoice recovery instead.",
				);
			if (
				stopped ||
				run !== version ||
				context.items.length ||
				context.exchangeSession
			)
				throw new Error(
					"The active sale or cashier changed. Refresh the saved cart list.",
				);
			await context.load_invoice(record.invoice);
			if (stopped || run !== version)
				throw new Error(
					"The cashier changed during recovery. The saved cart was retained.",
				);
			// Keep the source intact until loading and destination persistence succeed.
			// Both copies retain the same idempotency identity across a process crash.
			saveCartRecovery(
				next,
				record.invoice,
				localStorage,
				sessionStorage,
				true,
			);
			localStorage.removeItem(key);
			context.cartRecoveryError = "";
			context.cartRecoveryMessage = recoveredMessage;
			await nextTick();
			return true;
		} catch (error) {
			// A partially loaded cart must not let another tab take its source.
			if (
				releaseSource &&
				run === version &&
				!stopped &&
				context.items.length
			) {
				releasePendingSource = releaseSource;
				releaseSource = null;
			}
			report(error);
			return false;
		} finally {
			releaseSource?.();
			if (run === version) {
				paused = false;
				context.cartRecoveryBusy = false;
				void refreshCandidates();
			}
		}
	}
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
			if (cartRecoveryLocksAvailable() && !releaseOwnership) return false;
			saveCartRecovery(
				active,
				doc,
				localStorage,
				sessionStorage,
				Boolean(releaseOwnership),
			);
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
			const run = ++version;
			context.cartRecoveryCandidates = [];
			context.cartRecoveryBusy = false;
			context.cartRecoveryMessage = "";
			if (!cartScopeIsComplete(next)) {
				clearTimeout(timer);
				releaseOwnership?.();
				releasePendingSource?.();
				releasePendingSource = null;
				releaseOwnership = null;
				active = null;
				return;
			}
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
			releaseOwnership?.();
			releasePendingSource?.();
			releasePendingSource = null;
			releaseOwnership = null;
			try {
				if (cartRecoveryLocksAvailable()) {
					let release = await lockCartRecovery(
						getCartRecoveryKey(next),
					);
					if (!release) {
						// Duplicating a tab can clone sessionStorage. Give the new tab
						// its own slot instead of overwriting the original live cart.
						sessionStorage.setItem(
							"posa_cart_tab_id",
							crypto.randomUUID(),
						);
						release = await lockCartRecovery(
							getCartRecoveryKey(next),
						);
					}
					if (stopped || run !== version) {
						release?.();
						return;
					}
					if (!release)
						throw new Error(
							"Unable to reserve this tab's saved cart.",
						);
					releaseOwnership = release;
				}
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
				if (await alreadySubmitted(record.invoice)) {
					if (run === version && !stopped) clearCartRecovery(next);
					return;
				}
				if (
					stopped ||
					run !== version ||
					context.exchangeSession ||
					context.items.length
				)
					return;
				await context.load_invoice(record.invoice);
				context.cartRecoveryMessage = recoveredMessage;
				await nextTick();
			} catch (error) {
				report(error);
			} finally {
				if (run === version) {
					paused = false;
					void refreshCandidates();
				}
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
		else void refreshCandidates();
	};
	const beforeSwitch = (event: Event) => {
		if (paused || !flush()) event.preventDefault();
	};
	const beforeRefresh = (event: Event) => {
		const detail = (event as CustomEvent<RefreshPreparation>).detail;
		detail.hasCart ||= Boolean(context.items.length);
		if (
			paused ||
			context.exchangeSession ||
			(context.items.length && !active) ||
			!flush()
		) {
			detail.reasons.push(context.exchangeSession
				? "Complete or cancel the active exchange before refreshing."
				: context.cartRecoveryError || "Finish cart recovery before refreshing. The cart must be saved first.");
			event.preventDefault();
		}
	};
	window.addEventListener(SAFE_REFRESH_PREPARE, beforeRefresh);
	window.addEventListener("pagehide", flush);
	window.addEventListener("focus", refreshCandidates);
	window.addEventListener("storage", refreshCandidates);
	const candidateTimer = setInterval(() => {
		void refreshCandidates();
	}, 15_000);
	window.addEventListener("posa:before-cashier-switch", beforeSwitch);
	window.addEventListener("posa:before-cache-clear", beforeSwitch);
	document.addEventListener("visibilitychange", hide);
	return {
		flush,
		recoverSavedCart,
		refreshCandidates,
		stop() {
			if (stopped) return;
			flush();
			stopped = true;
			version++;
			clearTimeout(timer);
			clearInterval(candidateTimer);
			releaseOwnership?.();
			releasePendingSource?.();
			releasePendingSource = null;
			releaseOwnership = null;
			stopScope();
			stopCart();
			window.removeEventListener("pagehide", flush);
			window.removeEventListener(SAFE_REFRESH_PREPARE, beforeRefresh);
			window.removeEventListener("focus", refreshCandidates);
			window.removeEventListener("storage", refreshCandidates);
			window.removeEventListener(
				"posa:before-cashier-switch",
				beforeSwitch,
			);
			window.removeEventListener("posa:before-cache-clear", beforeSwitch);
			document.removeEventListener("visibilitychange", hide);
		},
	};
}
