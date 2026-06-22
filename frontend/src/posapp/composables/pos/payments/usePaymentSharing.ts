import { ref, unref, type Ref } from "vue";
import { isOffline } from "../../../../offline/index";
import { DEFAULT_PAYMENT_ENTRY_PRINT_FORMAT } from "../../../utils/paymentPrintFormat";

type MaybeRef<T> = Ref<T> | T;

type PaymentSharingOptions = {
	customerName: MaybeRef<string>;
	partyType: MaybeRef<string>;
	eventBus?: { emit?: (_event: string, _payload: Record<string, any>) => void };
	fetchPdf?: typeof fetch;
	downloadPdfBlob?: (_blob: Blob, _name: string) => void;
	shareNavigator?: Pick<Navigator, "share" | "canShare"> | Record<string, any>;
};

const translate = (message: string, values?: unknown[]) =>
	typeof __ === "function" ? __(message, values) : message;

const defaultDownloadPdfBlob = (blob: Blob, name: string) => {
	const url = window.URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = `${name}.pdf`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	window.URL.revokeObjectURL(url);
};

export function usePaymentSharing({
	customerName,
	partyType,
	eventBus,
	fetchPdf = globalThis.fetch?.bind(globalThis),
	downloadPdfBlob = defaultDownloadPdfBlob,
	shareNavigator = typeof navigator !== "undefined" ? navigator : {},
}: PaymentSharingOptions) {
	const isSharing = ref(false);

	const showMessage = (title: string, color: string) => {
		eventBus?.emit?.("show_message", { title, color });
	};

	const shareLastPayment = async () => {
		if (isSharing.value) return;

		const party = unref(customerName);
		if (!party) {
			showMessage(translate("Please select a party first."), "warning");
			return;
		}

		if (isOffline()) {
			showMessage(translate("Reconnect to share the last payment PDF."), "warning");
			return;
		}

		isSharing.value = true;
		try {
			const selectedPartyType = unref(partyType);
			const { message: payments } = await frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "Payment Entry",
					fields: ["name"],
					filters: { party, party_type: selectedPartyType, docstatus: 1 },
					order_by: "creation desc",
					limit_page_length: 1,
				},
			});
			if (!payments || payments.length === 0) {
				showMessage(translate("No previous payments found for this party."), "warning");
				return;
			}

			if (!fetchPdf) {
				throw new Error(translate("Payment PDF download is unavailable in this browser."));
			}

			const paymentName = payments[0].name;
			const pdfUrl = `/api/method/frappe.utils.print_format.download_pdf?doctype=Payment%20Entry&name=${encodeURIComponent(paymentName)}&format=${encodeURIComponent(DEFAULT_PAYMENT_ENTRY_PRINT_FORMAT)}&no_letterhead=0`;
			const response = await fetchPdf(pdfUrl, {
				headers: { "X-Frappe-CSRF-Token": (frappe as any).csrf_token },
			});
			if (!response.ok) {
				throw new Error(translate("Failed to download payment. Status: {0}", [response.status]));
			}
			const blob = await response.blob();
			const file = new File([blob], `${paymentName}.pdf`, { type: "application/pdf" });
			const canShareFiles =
				typeof shareNavigator.share === "function" &&
				typeof shareNavigator.canShare === "function" &&
				shareNavigator.canShare({ files: [file] });

			if (canShareFiles) {
				try {
					await shareNavigator.share({
						title: translate("Payment Entry"),
						text: translate("Payment No: {0}", [paymentName]),
						files: [file],
					});
					return;
				} catch (shareError: any) {
					if (shareError?.name === "AbortError") return;
				}
			}

			downloadPdfBlob(blob, paymentName);
		} catch (error: any) {
			showMessage(error?.message || translate("Failed to share payment"), "error");
		} finally {
			isSharing.value = false;
		}
	};

	return {
		isSharing,
		shareLastPayment,
	};
}
