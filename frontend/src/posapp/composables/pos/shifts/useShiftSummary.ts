import { computed, unref } from "vue";

type SummaryFormatters = {
	formatCurrencyWithSymbol: (_value: number, _currency: string) => string;
	formatCount: (_value: number) => string;
	formatCurrency: (_value: number, _precision?: number) => string;
	currencySymbol: (_currency: string) => string;
	__: (_text: string, _args?: any[]) => string;
};

export function useClosingSummary(
	overview: any,
	posProfile: any,
	dialogData: any,
	formatters: SummaryFormatters,
) {
	const {
		formatCurrencyWithSymbol,
		formatCount,
		formatCurrency,
		currencySymbol,
		__,
	} = formatters;

	const overviewCompanyCurrency = computed(() => {
		const ov = unref(overview);
		const prof = unref(posProfile);
		const data = unref(dialogData);
		return ov?.company_currency || prof?.currency || data?.currency || "";
	});

	const companyCurrencySymbol = computed(() => {
		const currency = overviewCompanyCurrency.value;
		const symbol = currencySymbol(currency);
		return symbol || currency || "";
	});

	const multiCurrencyTotals = computed(() => {
		const ov = unref(overview);
		return Array.isArray(ov?.multi_currency_totals)
			? ov.multi_currency_totals
			: [];
	});

	const paymentsByMode = computed(() => {
		const ov = unref(overview);
		return Array.isArray(ov?.payments_by_mode) ? ov.payments_by_mode : [];
	});

	const creditInvoices = computed(() => {
		const ov = unref(overview);
		return (
			ov?.credit_invoices || {
				count: 0,
				company_currency_total: 0,
				by_currency: [],
			}
		);
	});

	const creditInvoicesByCurrency = computed(() => {
		return Array.isArray(creditInvoices.value.by_currency)
			? creditInvoices.value.by_currency
			: [];
	});

	const returnsSummary = computed(() => {
		const ov = unref(overview);
		return (
			ov?.returns || {
				count: 0,
				company_currency_total: 0,
				by_currency: [],
			}
		);
	});

	const returnsByCurrency = computed(() => {
		return Array.isArray(returnsSummary.value.by_currency)
			? returnsSummary.value.by_currency
			: [];
	});

	const changeReturnedSummary = computed(() => {
		const ov = unref(overview);
		return (
			ov?.change_returned || {
				company_currency_total: 0,
				by_currency: [],
				invoice_change: { company_currency_total: 0, by_currency: [] },
				overpayment_change: {
					company_currency_total: 0,
					by_currency: [],
				},
			}
		);
	});

	const invoiceChangeReturnedSummary = computed(() => {
		return (
			changeReturnedSummary.value?.invoice_change || {
				company_currency_total: 0,
				by_currency: [],
			}
		);
	});

	const changeReturnedByCurrency = computed(() => {
		return Array.isArray(changeReturnedSummary.value.by_currency)
			? changeReturnedSummary.value.by_currency
			: [];
	});

	const invoiceChangeReturnedByCurrency = computed(() => {
		return Array.isArray(invoiceChangeReturnedSummary.value.by_currency)
			? invoiceChangeReturnedSummary.value.by_currency
			: [];
	});

	const overpaymentChangeReturnedSummary = computed(() => {
		return (
			changeReturnedSummary.value?.overpayment_change || {
				company_currency_total: 0,
				by_currency: [],
			}
		);
	});

	const overpaymentChangeReturnedByCurrency = computed(() => {
		return Array.isArray(overpaymentChangeReturnedSummary.value.by_currency)
			? overpaymentChangeReturnedSummary.value.by_currency
			: [];
	});

	const overpaymentChangeByCurrencyMap = computed(() => {
		const map = new Map<
			string,
			{ total: number; company_currency_total: number }
		>();
		(overpaymentChangeReturnedByCurrency.value || []).forEach(
			(item: any) => {
				const currency =
					item.currency || overviewCompanyCurrency.value || "";
				map.set(currency, {
					total: item.total || 0,
					company_currency_total: item.company_currency_total || 0,
				});
			},
		);
		return map;
	});

	const changeReturnedRows = computed(() => {
		const buildCurrencyMap = (items: any[]) => {
			const map = new Map<string, any>();
			(items || []).forEach((item: any) => {
				const currency =
					item.currency || overviewCompanyCurrency.value || "";
				const existing = map.get(currency) || {
					currency,
					total: 0,
					company_currency_total: 0,
					exchange_rates: new Set<number>(),
				};

				existing.total += item.total || 0;
				existing.company_currency_total +=
					item.company_currency_total || 0;
				(item.exchange_rates || []).forEach((rate: number) =>
					existing.exchange_rates.add(rate),
				);
				map.set(currency, existing);
			});
			return map;
		};

		const invoiceMap = buildCurrencyMap(
			invoiceChangeReturnedByCurrency.value,
		);
		const overpaymentMap = buildCurrencyMap(
			overpaymentChangeReturnedByCurrency.value,
		);
		const totalMap = buildCurrencyMap(changeReturnedByCurrency.value);

		const currencies = new Set([
			...invoiceMap.keys(),
			...overpaymentMap.keys(),
			...totalMap.keys(),
		]);

		const rows = Array.from(currencies).map((currency) => {
			const invoiceEntry = invoiceMap.get(currency);
			const overpaymentEntry = overpaymentMap.get(currency);
			const totalEntry = totalMap.get(currency);

			const invoiceTotal = invoiceEntry?.total || 0;
			const invoiceCompanyTotal =
				invoiceEntry?.company_currency_total || 0;
			const invoiceExchangeRates = new Set(
				invoiceEntry?.exchange_rates || [],
			);

			const overpaymentTotal = overpaymentEntry?.total || 0;
			const overpaymentCompanyTotal =
				overpaymentEntry?.company_currency_total || 0;

			const exchangeRates = new Set([
				...invoiceExchangeRates,
				...(overpaymentEntry?.exchange_rates || []),
				...(totalEntry?.exchange_rates || []),
			]);

			const total = totalEntry
				? totalEntry.total || 0
				: invoiceTotal + overpaymentTotal;
			const companyTotal = totalEntry
				? totalEntry.company_currency_total || 0
				: invoiceCompanyTotal + overpaymentCompanyTotal;

			return {
				currency,
				invoice_total: invoiceTotal,
				invoice_company_currency_total: invoiceCompanyTotal,
				overpayment_total: overpaymentTotal,
				overpayment_company_currency_total: overpaymentCompanyTotal,
				total,
				company_currency_total: companyTotal,
				exchange_rates: Array.from(exchangeRates).sort((a, b) => a - b),
			};
		});

		return rows.sort((a: any, b: any) =>
			(a.currency || "").localeCompare(b.currency || ""),
		);
	});

	const cashExpectedSummary = computed(() => {
		const ov = unref(overview);
		return (
			ov?.cash_expected || {
				mode_of_payment: "",
				company_currency_total: 0,
				by_currency: [],
			}
		);
	});

	const cashMovementSummary = computed(() => {
		const ov = unref(overview);
		return (
			ov?.cash_movements || {
				count: 0,
				company_currency_total: 0,
				by_currency: [],
				by_type: [],
			}
		);
	});

	const cashExpectedByCurrency = computed(() => {
		return Array.isArray(cashExpectedSummary.value.by_currency)
			? cashExpectedSummary.value.by_currency
			: [];
	});

	const salesSummary = computed(() => {
		const ov = unref(overview);
		return (
			ov?.sales_summary || {
				gross_company_currency_total: 0,
				net_company_currency_total: 0,
				average_invoice_value: 0,
				sale_invoices_count: 0,
			}
		);
	});

	const primaryInsights = computed(() => {
		const netSales = formatCurrencyWithSymbol(
			salesSummary.value.net_company_currency_total,
			overviewCompanyCurrency.value,
		);
		const grossSales = formatCurrencyWithSymbol(
			salesSummary.value.gross_company_currency_total,
			overviewCompanyCurrency.value,
		);
		const avgInvoice = formatCurrencyWithSymbol(
			salesSummary.value.average_invoice_value,
			overviewCompanyCurrency.value,
		);

		return [
			{
				key: "total-invoices",
				label: __("Total Invoices"),
				value: formatCount(unref(overview)?.total_invoices || 0),
				caption: `${__("Sales processed")}: ${formatCount(salesSummary.value.sale_invoices_count || 0)}`,
				icon: "mdi-receipt-text-multiple",
				color: "accent-primary",
			},
			{
				key: "net-sales",
				label: __("Net Sales"),
				value: netSales,
				caption: `${__("After returns")}: ${formatCurrency(salesSummary.value.net_company_currency_total)}`,
				icon: "mdi-cash-multiple",
				color: "accent-success",
			},
			{
				key: "gross-sales",
				label: __("Gross Sales"),
				value: grossSales,
				caption: `${__("Before returns")}`,
				icon: "mdi-chart-bar",
				color: "accent-secondary",
			},
			{
				key: "average-ticket",
				label: __("Average Ticket"),
				value: avgInvoice,
				caption: `${__("Across")}: ${formatCount(salesSummary.value.sale_invoices_count || 0)} ${__("sales")}`,
				icon: "mdi-chart-donut",
				color: "accent-info",
			},
		];
	});

	const secondaryInsights = computed(() => {
		const creditValue = formatCurrencyWithSymbol(
			creditInvoices.value.company_currency_total,
			overviewCompanyCurrency.value,
		);
		const returnsValue = formatCurrencyWithSymbol(
			returnsSummary.value.company_currency_total,
			overviewCompanyCurrency.value,
		);
		const changeValue = formatCurrencyWithSymbol(
			changeReturnedSummary.value.company_currency_total,
			overviewCompanyCurrency.value,
		);
		const cashMovementValue = formatCurrencyWithSymbol(
			cashMovementSummary.value.company_currency_total,
			overviewCompanyCurrency.value,
		);
		const cashValue = formatCurrencyWithSymbol(
			cashExpectedSummary.value.company_currency_total,
			overviewCompanyCurrency.value,
		);

		return [
			{
				key: "credit-sales",
				label: __("Credit Outstanding"),
				value: creditValue,
				caption: `${__("Open invoices")}: ${formatCount(creditInvoices.value.count || 0)}`,
				icon: "mdi-account-cash-outline",
				color: "accent-warning",
			},
			{
				key: "returns",
				label: __("Returns"),
				value: returnsValue,
				caption: `${__("Return count")}: ${formatCount(returnsSummary.value.count || 0)}`,
				icon: "mdi-undo-variant",
				color: "accent-secondary",
			},
			{
				key: "change-returned",
				label: __("Change Returned"),
				value: changeValue,
				caption: `${__("Cash back to customers")}`,
				icon: "mdi-cash-refund",
				color: "accent-info",
			},
			{
				key: "cash-movements",
				label: __("Cash Movements"),
				value: cashMovementValue,
				caption: `${__("Submitted entries")}: ${formatCount(cashMovementSummary.value.count || 0)}`,
				icon: "mdi-cash-sync",
				color: "accent-warning",
			},
			{
				key: "cash-expected",
				label: __("Expected Cash"),
				value: cashValue,
				caption:
					cashExpectedSummary.value.mode_of_payment && cashMovementSummary.value.company_currency_total
						? `${__("Mode")}: ${cashExpectedSummary.value.mode_of_payment} | ${__("Cash movement deduction applied")}`
						: cashExpectedSummary.value.mode_of_payment
							? `${__("Mode")}: ${cashExpectedSummary.value.mode_of_payment}`
							: __("No cash mode configured"),
				icon: "mdi-safe",
				color: "accent-success",
			},
		];
	});

	const shouldShowCompanyEquivalent = (row: any, currency: string) => {
		const resolvedCurrency = currency || row?.currency || "";
		if (!resolvedCurrency) {
			return false;
		}

		if (resolvedCurrency !== overviewCompanyCurrency.value) {
			return true;
		}

		const companyTotal = Number(row?.company_currency_total);
		if (!Number.isFinite(companyTotal)) {
			return false;
		}

		const amount = Number(row?.total);
		if (
			Number.isFinite(amount) &&
			Math.abs(amount - companyTotal) < 0.005
		) {
			return false;
		}

		return Math.abs(companyTotal) > 0.0001;
	};

	const showExchangeRates = (row: any, currency: string) => {
		const resolvedCurrency = currency || row?.currency || "";
		if (
			!resolvedCurrency ||
			resolvedCurrency === overviewCompanyCurrency.value
		) {
			return false;
		}
		return (
			Array.isArray(row?.exchange_rates) && row.exchange_rates.length > 0
		);
	};

	const formatExchangeRates = (
		rates: unknown[],
		sourceCurrency: string,
		targetCurrency: string,
	) => {
		if (!sourceCurrency || !targetCurrency) {
			return "";
		}

		const validRates = Array.isArray(rates)
			? rates
					.map((rate) => Number(rate))
					.filter((rate) => Number.isFinite(rate) && rate > 0)
			: [];

		if (!validRates.length) {
			return "";
		}

		const targetSymbol = currencySymbol(targetCurrency) || targetCurrency;
		const formattedRates = validRates.map((rate) => {
			const formattedRate = formatCurrency(rate, 4);
			return `1 ${sourceCurrency} = ${targetSymbol} ${formattedRate}`;
		});

		return `${__("Exchange Rate")}: ${formattedRates.join(" • ")}`;
	};

	const isCashMode = (modeOfPayment: string) => {
		const cashMode = cashExpectedSummary.value?.mode_of_payment || "";
		return Boolean(cashMode && modeOfPayment === cashMode);
	};

	const overpaymentDeductionForCurrency = (currency: string) => {
		const key = currency || overviewCompanyCurrency.value || "";
		const entry = overpaymentChangeByCurrencyMap.value.get(key);
		return entry?.total || 0;
	};

	return {
		overviewCompanyCurrency,
		companyCurrencySymbol,
		multiCurrencyTotals,
		paymentsByMode,
		creditInvoicesByCurrency,
		returnsByCurrency,
		changeReturnedRows,
		cashExpectedByCurrency,
		cashMovementSummary,
		primaryInsights,
		secondaryInsights,
		shouldShowCompanyEquivalent,
		showExchangeRates,
		formatExchangeRates,
		isCashMode,
		overpaymentDeductionForCurrency,
	};
}
