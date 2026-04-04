# Supervisor Invoice Management Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Invoice Management company-wide for supervisors while preserving existing cashier scoping.

**Architecture:** Use the frontend employee supervisor flag to switch query scope. Extend the draft API to accept supervisor-aware company filters, and widen invoice row metadata so the existing search inputs can match profile and cashier/user fields without building a separate management screen.

**Tech Stack:** Vue 3, Pinia, Vitest, Python/Frappe RPC APIs

---

## Chunk 1: Backend Draft Scope

### Task 1: Add failing backend tests for supervisor draft access

**Files:**
- Modify: `posawesome/posawesome/api/invoices.py`
- Create: `posawesome/posawesome/api/test_invoices.py`

- [ ] **Step 1: Write the failing backend tests**
- [ ] **Step 2: Run the backend test to verify it fails**
- [ ] **Step 3: Implement the minimal supervisor-aware draft query**
- [ ] **Step 4: Run the backend tests to verify they pass**
- [ ] **Step 5: Commit**

## Chunk 2: Frontend Supervisor Invoice Management

### Task 2: Add failing frontend tests for supervisor company-wide invoice management

**Files:**
- Modify: `frontend/src/posapp/components/pos/flows/InvoiceManagement.vue`
- Create: `frontend/tests/invoiceManagementSupervisor.spec.ts`

- [ ] **Step 1: Write the failing frontend tests**
- [ ] **Step 2: Run the focused frontend test to verify it fails**
- [ ] **Step 3: Implement the minimal supervisor-aware history/unpaid/draft fetch logic**
- [ ] **Step 4: Re-run the focused frontend test to verify it passes**
- [ ] **Step 5: Commit**

### Task 3: Search company-wide supervisor rows by user/profile metadata

**Files:**
- Modify: `frontend/src/posapp/components/pos/flows/InvoiceManagement.vue`
- Test: `frontend/tests/invoiceManagementSupervisor.spec.ts`

- [ ] **Step 1: Extend the failing test for search matching**
- [ ] **Step 2: Run the focused frontend test to verify it fails**
- [ ] **Step 3: Implement the minimal search metadata support**
- [ ] **Step 4: Run focused frontend and backend verification**
- [ ] **Step 5: Commit**
