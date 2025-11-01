"""Override POS Invoice Merge Log to stabilise consolidated return payments."""

from __future__ import annotations

from erpnext.accounts.doctype.pos_invoice_merge_log.pos_invoice_merge_log import (
    POSInvoiceMergeLog as ERPNextPOSInvoiceMergeLog,
)
from frappe.utils import flt


class CustomPOSInvoiceMergeLog(ERPNextPOSInvoiceMergeLog):
    """Ensure consolidated credit notes keep payment totals within tolerance."""

    def merge_pos_invoice_into(self, invoice, data):
        invoice = super().merge_pos_invoice_into(invoice, data)

        if getattr(invoice, "is_return", 0):
            self._normalize_return_payments(invoice)

        return invoice

    def _normalize_return_payments(self, invoice) -> None:
        """Clamp aggregated payment totals for consolidated return invoices."""

        invoice_total = flt(invoice.rounded_total or invoice.grand_total)
        conversion_rate = invoice.conversion_rate or 1

        if not invoice_total:
            invoice.write_off_amount = 0
            invoice.base_write_off_amount = 0
            invoice.set("payments", [])
            invoice.set_paid_amount()
            return

        invoice_sign = -1 if invoice_total < 0 else 1
        invoice_total_abs = abs(invoice_total)

        precision_total = invoice.precision("grand_total") or 2
        precision_paid = invoice.precision("paid_amount") or 2
        precision_base_paid = invoice.precision("base_paid_amount") or 2
        precision_write_off = invoice.precision("write_off_amount") or 2
        precision_base_write_off = invoice.precision("base_write_off_amount") or 2
        tolerance = 1 / (10 ** (precision_total + 1))

        write_off_abs = abs(flt(invoice.write_off_amount))
        if write_off_abs > invoice_total_abs:
            write_off_abs = invoice_total_abs

        invoice.write_off_amount = invoice_sign * flt(write_off_abs, precision_write_off)
        invoice.base_write_off_amount = invoice_sign * flt(
            write_off_abs * conversion_rate, precision_base_write_off
        )

        payments = invoice.get("payments", [])
        if not payments:
            invoice.set_paid_amount()
            return

        min_unit = 1 / (10**precision_paid) if precision_paid is not None else 0

        for payment in payments:
            abs_amount = abs(flt(payment.amount))
            if not abs_amount and payment.base_amount:
                abs_amount = abs(flt(payment.base_amount)) / conversion_rate if conversion_rate else 0

            payment.amount = invoice_sign * flt(abs_amount, precision_paid)
            payment.base_amount = invoice_sign * flt(abs_amount * conversion_rate, precision_base_paid)

        invoice.set_paid_amount()

        difference = abs(flt(invoice.paid_amount)) + abs(flt(invoice.write_off_amount)) - invoice_total_abs

        if difference > tolerance:
            self._reduce_payment_difference(
                invoice,
                difference,
                invoice_sign,
                conversion_rate,
                precision_paid,
                precision_base_paid,
                tolerance,
                min_unit,
            )

        self._cleanup_zero_amount_payments(invoice, tolerance, precision_base_paid)
        invoice.set_paid_amount()

        remaining_diff = (
            abs(flt(invoice.paid_amount)) + abs(flt(invoice.write_off_amount)) - invoice_total_abs
        )
        if remaining_diff > tolerance and invoice.payments:
            last_payment = invoice.payments[-1]
            current_abs = abs(flt(last_payment.amount))
            adjustment = min(current_abs, remaining_diff)
            new_abs = current_abs - adjustment

            new_amount = invoice_sign * flt(new_abs, precision_paid)
            if abs(flt(new_amount)) >= current_abs - tolerance and min_unit and current_abs > min_unit:
                new_amount = invoice_sign * flt(current_abs - min_unit, precision_paid)

            last_payment.amount = new_amount
            last_payment.base_amount = invoice_sign * flt(
                abs(flt(last_payment.amount)) * conversion_rate,
                precision_base_paid,
            )

            self._cleanup_zero_amount_payments(invoice, tolerance, precision_base_paid)
            invoice.set_paid_amount()

    def _reduce_payment_difference(
        self,
        invoice,
        difference: float,
        invoice_sign: int,
        conversion_rate: float,
        precision_paid: int,
        precision_base_paid: int,
        tolerance: float,
        min_unit: float,
    ) -> None:
        """Distribute the excess paid amount across existing payment rows."""

        remaining = difference
        for payment in reversed(invoice.payments):
            current_abs = abs(flt(payment.amount))
            if current_abs <= tolerance:
                continue

            deduction = min(current_abs, remaining)
            new_abs = current_abs - deduction

            new_amount = invoice_sign * flt(new_abs, precision_paid)
            new_abs_after = abs(flt(new_amount))

            if new_abs_after >= current_abs - tolerance and min_unit and current_abs > min_unit:
                new_amount = invoice_sign * flt(current_abs - min_unit, precision_paid)
                new_abs_after = abs(flt(new_amount))

            payment.amount = new_amount
            payment.base_amount = invoice_sign * flt(new_abs_after * conversion_rate, precision_base_paid)

            remaining -= current_abs - new_abs_after
            if remaining <= tolerance:
                break

    def _cleanup_zero_amount_payments(
        self,
        invoice,
        tolerance: float,
        precision_base_paid: int,
    ) -> None:
        """Drop zeroed payment rows and keep indices tidy."""

        conversion_rate = invoice.conversion_rate or 1
        cleaned = []
        for idx, payment in enumerate(invoice.get("payments", []), start=1):
            if abs(flt(payment.amount)) <= tolerance:
                continue

            payment.idx = idx
            payment.base_amount = flt(payment.amount * conversion_rate, precision_base_paid)
            cleaned.append(payment)

        if len(cleaned) != len(invoice.get("payments", [])):
            invoice.set("payments", cleaned)
