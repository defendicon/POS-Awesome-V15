# Bolt's Journal

A log of critical learnings about performance in this codebase.

## 2024-05-24 - Synchronous Remarks Generation
**Learning:** The `submit_invoice` and `submit_in_background_job` functions in `posawesome/posawesome/api/invoices.py` were synchronously generating a detailed `remarks` string by iterating over every item in the invoice. This operation was not critical to the core functionality of submitting an invoice and added unnecessary processing time, especially for carts with a large number of items.
**Action:** Removed the `remarks` generation logic from both functions to reduce the latency of the invoice submission process.
