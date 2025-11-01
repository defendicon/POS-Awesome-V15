doc_events = {
    "Sales Invoice": {
        "validate": "posawesome.posawesome.api.invoice.validate",
        "on_cancel": "posawesome.posawesome.api.invoice.on_cancel",
    },
    "Customer": {
        "validate": "posawesome.posawesome.api.customers.set_customer_info",
    },
    "Payment Entry": {"on_cancel": "posawesome.posawesome.api.payment_entry.on_payment_entry_cancel"},
}
