# Copyright (c) 2021, Youssef Restom and contributors
# For license information, please see license.txt

"""Compatibility facade for payment-entry APIs.

This module intentionally re-exports functions from `payment_processing/*`
to preserve stable dotted paths used by existing clients and hooks.
"""

import frappe
from posawesome.posawesome.api.payment_processing.creation import create_payment_entry
from posawesome.posawesome.api.payment_processing.utils import (
    get_bank_cash_account,
    set_paid_amount_and_received_amount,
    get_party_account
)
from posawesome.posawesome.api.payment_processing.data import (
    get_outstanding_invoices,
    get_unallocated_payments,
    get_available_pos_profiles,
    get_unreconciled_entries,
)
from posawesome.posawesome.api.payment_processing.reconciliation import auto_reconcile_customer_invoices
from posawesome.posawesome.api.payment_processing.processor import process_pos_payment
from posawesome.posawesome.api.payment_processing.journal_entry import create_direct_journal_entry
