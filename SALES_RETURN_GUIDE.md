# Sales Return System for POSAwesome

## Overview

The Sales Return system provides comprehensive functionality for handling product returns in POSAwesome with three different return types:

1. **Cash Return** - Refund cash to customer
2. **Replace with Another Item** - Exchange returned items with new items
3. **Customer Credit** - Save return value as credit for future purchases

## Features

### 1. Cash Return 💵

**Scenario**: Customer returns an item and wants their money back.

**Process**:
- Create a Sales Return (Credit Note)
- System calculates the returned item value
- Payment Entry is created to refund cash to customer
- Returned item quantity goes back to stock

**Important Notes**:
- This is the standard sales return case
- No customer credit is stored
- Simple refund transaction

### 2. Replace with Another Item 🔄

**Scenario**: Customer returns an item and wants to exchange it with a different item.

**Process**:
1. Calculate: `return_item_amount - new_item_amount`
2. Two possible cases:

#### Case A: Return Value > New Item Value (Positive Balance)
**Example**:
- Returned item: 50 AED
- New item: 30 AED
- Balance: 20 AED

**Action**: System collects the 20 AED difference and creates payment entry

#### Case B: Return Value < New Item Value (Negative Balance)
**Example**:
- Returned item: 30 AED
- New item: 50 AED
- Balance: -20 AED

**Action**: Customer pays the 20 AED difference, payment entry is created

**Stock Effects**:
- Returned item is added back to stock
- New replacement item is deducted from stock

### 3. Customer Credit 💳

**Scenario**: Customer returns the item but doesn't want cash or replacement.

**Process**:
1. Save the amount as customer credit
2. Credit is stored as negative outstanding on return invoice
3. POS automatically shows available credit when selecting the customer
4. Customer credit can be used as a payment method in future transactions

**Using Customer Credit**:
- Credit appears in payment section when customer is selected
- Can be used as full or partial payment
- Supports split payment (credit + cash/card)

**Example**:
- Customer credit: 30 AED
- Bill total: 50 AED
- Payment: 30 AED (Customer Credit) + 20 AED (Cash)

## API Endpoints

### Backend APIs

#### 1. Get Invoice for Return
```python
frappe.call({
    method: "posawesome.posawesome.api.sales_return.get_invoice_for_return",
    args: {
        invoice_name: "SINV-00001"
    }
})
```

#### 2. Process Sales Return
```python
frappe.call({
    method: "posawesome.posawesome.api.sales_return.process_sales_return",
    args: {
        invoice_name: "SINV-00001",
        return_items: '[{"item_code": "ITEM-001", "qty": 2, "rate": 50}]',
        return_type: "Cash",  // or "Replace" or "Credit"
        replacement_items: '[{"item_code": "ITEM-002", "qty": 1, "rate": 100}]',  // Only for Replace
        pos_profile: "POS Profile Name",
        pos_opening_shift: "POS-OPEN-00001"
    }
})
```

#### 3. Get Customer Credit Balance
```python
frappe.call({
    method: "posawesome.posawesome.api.sales_return.get_customer_credit_balance",
    args: {
        customer: "CUST-00001",
        company: "Company Name"
    }
})
```

#### 4. Apply Customer Credit
```python
frappe.call({
    method: "posawesome.posawesome.api.sales_return.apply_customer_credit",
    args: {
        invoice_name: "SINV-00002",
        credit_amount: 30.00,
        customer: "CUST-00001",
        company: "Company Name"
    }
})
```

#### 5. Get Customer Credit for Payment
```python
frappe.call({
    method: "posawesome.posawesome.api.customer_credit.get_customer_credit_for_payment",
    args: {
        customer: "CUST-00001",
        company: "Company Name"
    }
})
```

## Usage in POSAwesome

### Accessing Sales Return

1. Open POSAwesome
2. Click on the navigation menu (☰)
3. Select **"Sales Return"** from the menu
4. The Sales Return dialog will open

### Processing a Return

#### Step 1: Select Invoice
- Enter the invoice number
- Click "Load" to fetch invoice details
- Review customer and invoice information

#### Step 2: Select Items to Return
- Enter the quantity to return for each item
- System calculates return amount automatically
- Review total return amount
- Click "Continue"

#### Step 3: Select Return Type
Choose one of three options:

**Option 1: Cash Return**
- Select "💵 Cash Return"
- Click "Process Return"
- System creates return invoice and payment entry
- Cash refund is processed

**Option 2: Replace with Another Item**
- Select "🔄 Replace with Another Item"
- Search and add replacement items
- System calculates balance (positive or negative)
- Click "Process Return"
- System handles payment difference automatically

**Option 3: Customer Credit**
- Select "💳 Customer Credit"
- Click "Process Return"
- Credit is saved for future use
- Customer can use credit in next purchase

### Using Customer Credit in POS

When a customer with available credit makes a purchase:

1. Select the customer in POS
2. Add items to cart
3. Click "Payment"
4. Customer credit will be available as a payment method
5. Use credit as full or partial payment
6. Complete the transaction

## Stock Effects

All return types properly handle stock:

- **Returned Items**: Added back to stock with proper stock ledger entries
- **Replacement Items**: Deducted from stock with proper stock ledger entries
- **Batch/Serial Numbers**: Properly tracked if applicable

## Technical Implementation

### Backend Files
- `/apps/posawesome/posawesome/posawesome/api/sales_return.py` - Main sales return API
- `/apps/posawesome/posawesome/posawesome/api/customer_credit.py` - Customer credit payment integration

### Frontend Files
- `/apps/posawesome/frontend/src/posapp/components/pos/SalesReturn.vue` - Sales Return UI component
- `/apps/posawesome/frontend/src/posapp/Home.vue` - Integration with main POS
- `/apps/posawesome/frontend/src/posapp/components/Navbar.vue` - Menu item

### Database Tables Used
- `tabSales Invoice` - Return invoices with `is_return = 1`
- `tabSales Invoice Item` - Return items with negative quantities
- `tabPayment Entry` - Cash refunds and credit applications
- `tabStock Ledger Entry` - Stock movements

## Validation Rules

1. **Invoice Validation**
   - Invoice must exist and be submitted
   - Cannot create return against a return invoice

2. **Quantity Validation**
   - Return quantity cannot exceed original quantity
   - Return quantity must be positive

3. **Credit Validation**
   - Credit amount cannot exceed available credit
   - Credit amount cannot exceed invoice outstanding

4. **Replacement Validation**
   - Replacement items required for "Replace" type
   - Items must be available in stock

## Error Handling

The system includes comprehensive error handling:

- Database rollback on errors
- Error logging for debugging
- User-friendly error messages
- Validation before processing

## Benefits

✅ **Complete Return Management** - Handles all return scenarios  
✅ **Automatic Stock Updates** - Proper inventory tracking  
✅ **Customer Credit System** - Encourages repeat business  
✅ **Flexible Payment Options** - Cash, replacement, or credit  
✅ **Audit Trail** - Full transaction history  
✅ **User-Friendly Interface** - Step-by-step wizard  

## Summary Table

| Return Type | Money Flow | Stock Effect | Notes |
|------------|------------|--------------|-------|
| Cash Return | Refund full amount | Returned item added to stock | Normal sales return |
| Replace with Another Item | Pay difference (+ or –) | Returned item added, new item deducted | Exchange logic |
| Customer Credit | Add credit balance | Returned item added | Can be used in future POS transactions |

## Support

For issues or questions:
1. Check error logs in ERPNext
2. Review validation messages
3. Contact system administrator

---

**Version**: 1.0  
**Last Updated**: December 2025  
**Compatible with**: ERPNext v15, POSAwesome Latest

