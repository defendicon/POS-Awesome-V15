# SMS Setup Guide for POSAwesome

This guide explains how to set up and use the SMS functionality in POSAwesome.

## Features

- **Twilio SMS Integration**: Send SMS notifications via Twilio
- **Bulk Ghana SMS Integration**: Send SMS notifications via Bulk Ghana SMS service
- **WhatsApp Integration**: Send WhatsApp messages via Twilio
- **Automatic Notifications**: SMS sent automatically on invoice submission and appointment creation

## Setup Instructions

### 1. Install Dependencies

The following packages are required for SMS functionality:

```bash
pip install twilio pycountry phonenumbers
```

### 2. Configure SMS Gateway Settings

1. Go to **POSAwesome > SMS Gateway Settings** in the Frappe desk
2. Enable SMS by checking the "Enable" checkbox
3. Select your SMS Gateway:
    - **Twilio**: For international SMS
    - **Bulk Ghana**: For Ghana-specific SMS

### 3. Twilio Configuration

If using Twilio:

1. Get your Twilio credentials from [Twilio Console](https://console.twilio.com/)
2. Fill in the following fields:
    - **Twilio Account SID**: Your Twilio Account SID
    - **Twilio Auth Token**: Your Twilio Auth Token
    - **Sender Phone Number**: Your Twilio phone number (e.g., +1234567890)
    - **Whatsapp Sender Phone Number**: Your Twilio WhatsApp number (if using WhatsApp)

### 4. Bulk Ghana Configuration

If using Bulk Ghana:

1. Get your API credentials from Bulk Ghana
2. Fill in the following fields:
    - **API Key**: Your Bulk Ghana API key
    - **Sender ID**: Your sender ID
    - **URL End Point**: API endpoint (default: http://clientlogin.bulksmsgh.com/smsapi)
    - **To**: Default recipient number (if not using customer phone number)

### 5. Message Templates

Configure your SMS message templates:

- **SMS Message (Submit & Rebook)**: Template for appointment notifications
- **SMS Message (Submit)**: Template for invoice submission notifications

## How It Works

### Automatic SMS Notifications

1. **Invoice Submission**: When an invoice is submitted, an SMS is sent to the customer (if not "Submit & Rebook")
2. **Appointment Creation**: When an appointment is created, an SMS is sent to the customer

### Phone Number Handling

- The system uses the customer's mobile number from the Customer record
- For international numbers, it combines `custom_country_code` + `mobile_no`
- If "Use Customer Phone Number" is enabled, it uses the customer's phone number; otherwise, it uses the default "To" number

### Message Templates

The system uses Jinja2 templates for message customization. Available variables include:

- `{{ party }}` or `{{ customer_name }}`: Customer name
- `{{ custom_sales_invoice }}`: Sales invoice reference
- `{{ scheduled_time }}`: Appointment time
- `{{ custom_service_staff }}`: Service staff details
- `{{ company }}`: Company name
- `{{ frappe.utils.get_url(pdf_link) }}`: PDF link

## Troubleshooting

### Common Issues

1. **SMS not sending**: Check if SMS Gateway Settings are properly configured
2. **Missing phone number**: Ensure customer has a valid mobile number
3. **Template errors**: Check Jinja2 template syntax in message templates

### Error Messages

- "Missing Twilio SMS Settings": Check Twilio credentials
- "Customer has no mobile number": Customer record needs mobile number
- "Failed to send SMS": Check network connection and credentials

## Testing

To test SMS functionality:

1. Create a test customer with a valid mobile number
2. Create an invoice and submit it
3. Check if SMS is sent successfully
4. Monitor the console for any error messages

## Support

For issues or questions regarding SMS functionality, please check:

1. Twilio/Bulk Ghana documentation
2. Frappe logs for error details
3. SMS Gateway Settings configuration
