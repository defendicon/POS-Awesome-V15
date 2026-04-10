import type { PosOpeningShift } from "./posSessionTypes";

declare const frappe: any;

type SkippedPrintedInvoice = {
	invoice?: string;
	doctype?: string;
	return_against?: string;
};

type ClosingShiftPreparationResponse = {
	closing_shift?: any;
	skipped_printed_invoices?: SkippedPrintedInvoice[];
};

type CreateClosePosSessionOptions = {
	getCurrentOpeningShift: () => PosOpeningShift | null | undefined;
	openClosingDialog: (closingShift: any) => void;
	clearSession: () => void;
	showToast?: (payload: { title: string; color: string }) => void;
	onSessionClosed?: () => void | Promise<void>;
	translate?: (value: string) => string;
};

const defaultTranslate = (value: string) =>
	typeof window !== "undefined" && window.__ ? window.__(value) : value;

function normalizeClosingShiftPreparationResponse(
	payload: any,
): ClosingShiftPreparationResponse {
	if (payload?.closing_shift || payload?.skipped_printed_invoices) {
		return payload;
	}

	return {
		closing_shift: payload,
		skipped_printed_invoices: [],
	};
}

export function buildSkippedClosingInvoicesPrompt(
	skippedInvoices: SkippedPrintedInvoice[],
	translate: (value: string) => string = defaultTranslate,
) {
	const count = skippedInvoices.length;
	const baseMessage =
		count === 1
			? "1 printed return invoice references a cancelled invoice and will be excluded from closing."
			: `${count} printed return invoices reference cancelled invoices and will be excluded from closing.`;
	const details = skippedInvoices
		.slice(0, 5)
		.map((invoice) => {
			const invoiceName = invoice?.invoice || translate("Unknown invoice");
			const returnAgainst = invoice?.return_against;
			return returnAgainst
				? `${invoiceName} (${translate("Return Against")}: ${returnAgainst})`
				: invoiceName;
		})
		.join(", ");
	const detailMessage = details ? `${translate("Invoices")}: ${details}.` : "";

	return [
		translate(baseMessage),
		detailMessage,
		translate("The skipped invoice will remain a draft."),
		translate("Do you want to proceed?"),
	]
		.filter(Boolean)
		.join(" ");
}

export function createClosePosSession(options: CreateClosePosSessionOptions) {
	const translate = options.translate || defaultTranslate;

	async function getClosingData() {
		const openingShift = options.getCurrentOpeningShift();
		if (!openingShift?.name) {
			return;
		}

		const response = await frappe.call(
			"posawesome.posawesome.doctype.pos_closing_shift.pos_closing_shift.make_closing_shift_from_opening",
			{ opening_shift: openingShift },
		);

		if (!response?.message) {
			return;
		}

		const normalized = normalizeClosingShiftPreparationResponse(response.message);
		const closingShift = normalized.closing_shift;
		const skippedPrintedInvoices = Array.isArray(
			normalized.skipped_printed_invoices,
		)
			? normalized.skipped_printed_invoices
			: [];

		if (!closingShift) {
			return;
		}

		if (skippedPrintedInvoices.length) {
			const confirmed = window.confirm(
				buildSkippedClosingInvoicesPrompt(skippedPrintedInvoices, translate),
			);
			if (!confirmed) {
				return;
			}
		}

		options.openClosingDialog(closingShift);
	}

	async function submitClosingPos(data: any) {
		try {
			const response = await frappe.call(
				"posawesome.posawesome.doctype.pos_closing_shift.pos_closing_shift.submit_closing_shift",
				{
					closing_shift: JSON.stringify(data),
				},
			);

			if (!response?.message) {
				return;
			}

			options.clearSession();
			options.showToast?.({
				title: translate("POS Shift Closed"),
				color: "success",
			});
			await Promise.resolve(options.onSessionClosed?.());
		} catch (error) {
			console.error("Failed to submit closing shift", error);
		}
	}

	return {
		getClosingData,
		submitClosingPos,
	};
}
