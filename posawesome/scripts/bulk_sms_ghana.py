import requests
import frappe


def send_sms(api_key, phone, message, sender_id, context=None, url='http://clientlogin.bulksmsgh.com/smsapi'):
    """Send SMS via Bulk Ghana SMS API"""
    try:
        data = {
            'key': api_key,
            'to': phone,
            'msg': message,
            'sender_id': sender_id
        }
        
        response = requests.post(url, data=data)
        
        if response.status_code == 200:
            frappe.publish_realtime(
                "msgprint",
                {
                    "message": "SMS sent successfully via Bulk Ghana!",
                    "title": "Success",
                    "indicator": "green",
                    "alert": "True",
                },
                user=frappe.session.user,
            )
        else:
            frappe.publish_realtime(
                "msgprint",
                {
                    "message": f"Failed to send SMS via Bulk Ghana: {response.text}",
                    "title": "SMS Sending Failed",
                    "indicator": "red",
                },
                user=frappe.session.user,
            )
    except Exception as e:
        frappe.publish_realtime(
            "msgprint",
            {
                "message": f"Failed to send SMS via Bulk Ghana: {str(e)}",
                "title": "SMS Sending Failed",
                "indicator": "red",
            },
            user=frappe.session.user,
        )
