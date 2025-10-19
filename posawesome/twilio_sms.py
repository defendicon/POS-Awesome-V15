from twilio.rest import Client
import frappe


@frappe.whitelist()
def send_twilio_sms(customer_name, context, reciever_phone_number=None, sms_message="sms_message"):
    twilio_settings = frappe.get_doc("SMS Gateway Settings")

    if twilio_settings.enable:
        twilio_account_sid = twilio_settings.twilio_account_sid
        twilio_auth_token = twilio_settings.twilio_auth_token
        sender_phone_number = twilio_settings.sender_phone_number
        message_body = frappe.render_template(
            twilio_settings.get(sms_message), context.as_dict()
        )
        # Check for missing values
        missing_fields = []
        if not twilio_account_sid:
            missing_fields.append("Twilio Account SID")
        if not twilio_auth_token:
            missing_fields.append("Twilio Auth Token")
        if not sender_phone_number:
            missing_fields.append("Sender Phone Number")
        if not message_body:
            missing_fields.append("SMS Message Body")

        if missing_fields:
            frappe.msgprint(
                f"The following fields are missing in SMS Gateway Settings: {', '.join(missing_fields)}",
                title="Missing Twilio SMS Settings",
                indicator="red",
            )
            return
        frappe.msgprint(
            f"Sending SMS to {customer_name} phone number ({reciever_phone_number})...",
            title="Notifying Customer",
            indicator="blue",
            alert=True,
        )

        frappe.enqueue(
            send_sms,
            queue="short",
            twilio_account_sid=twilio_account_sid,
            twilio_auth_token=twilio_auth_token,
            message_body=message_body,
            sender_phone_number=sender_phone_number,
            reciever_phone_number=reciever_phone_number,
        )
        if twilio_settings.include_whatsapp:
            frappe.enqueue(
                send_whatsapp,
                queue="short",
                twilio_account_sid=twilio_account_sid,
                twilio_auth_token=twilio_auth_token,
                message_body=message_body,
                sender_phone_number=twilio_settings.whatsapp_sender_phone_number,
                reciever_phone_number=reciever_phone_number,
            )


def send_sms(
    twilio_account_sid,
    twilio_auth_token,
    message_body,
    sender_phone_number,
    reciever_phone_number,
):
    try:
        client = Client(twilio_account_sid, twilio_auth_token)
        client.messages.create(
            body=message_body,
            from_=sender_phone_number,
            to=reciever_phone_number,
        )
        frappe.publish_realtime(
            "msgprint",
            {
                "message": "SMS sent successfully!",
                "title": "Success",
                "indicator": "green",
                "alert": "True",
            },
            user=frappe.session.user,
        )
    except Exception as e:
        frappe.publish_realtime(
            "msgprint",
            {
                "message": f"Failed to send SMS: {str(e)}",
                "title": "SMS Sending Failed",
                "indicator": "red",
            },
            user=frappe.session.user,
        )


def send_whatsapp(
    twilio_account_sid,
    twilio_auth_token,
    message_body,
    sender_phone_number,
    reciever_phone_number,
):
    try:
        client = Client(twilio_account_sid, twilio_auth_token)
        client.messages.create(
            body=message_body,
            from_="whatsapp:{0}".format(sender_phone_number),
            to="whatsapp:{0}".format(reciever_phone_number),
        )
        frappe.publish_realtime(
            "msgprint",
            {
                "message": "Whatsapp sent successfully!",
                "title": "Success",
                "indicator": "green",
                "alert": "True",
            },
            user=frappe.session.user,
        )
    except Exception as e:
        frappe.publish_realtime(
            "msgprint",
            {
                "message": f"Failed to send Whatsapp: {str(e)}",
                "title": "Whatsapp Sending Failed",
                "indicator": "red",
            },
            user=frappe.session.user,
        )
