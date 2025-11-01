"""Custom POS Invoice class that integrates POS Awesome shift logic."""

from erpnext.accounts.doctype.pos_invoice.pos_invoice import POSInvoice as ERPNextPOSInvoice

from posawesome.posawesome.api.invoice import validate_shift


class CustomPOSInvoice(ERPNextPOSInvoice):
    """Override ERPNext POS Invoice to respect POS Awesome opening shifts."""

    def validate_pos_opening_entry(self):
        """Allow POS invoices when a POS Awesome shift is open.

        If the invoice references ``posa_pos_opening_shift`` we validate that
        shift using POS Awesome's rules and skip the standard ERPNext
        validation for ``POS Opening Entry``. Otherwise, fall back to the
        default ERPNext behaviour.
        """

        if getattr(self, "posa_pos_opening_shift", None):
            # Use existing shift validation from POS Awesome
            validate_shift(self)
            return

        # No POS Awesome shift - use ERPNext's validation
        super().validate_pos_opening_entry()
