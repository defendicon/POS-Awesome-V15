# Copyright (c) 2026, POS Awesome contributors
# For license information, please see license.txt

import json

import frappe
from frappe import _
from frappe.utils.frappecloud import on_frappecloud

POS_AWESOME_APP_NAME = "posawesome"
POS_AWESOME_REPO_OWNER = "defendicon"
POS_AWESOME_REPO_NAME = "POS-Awesome-V15"
POS_AWESOME_REPO_URL = f"https://github.com/{POS_AWESOME_REPO_OWNER}/{POS_AWESOME_REPO_NAME}"


def _normalize_release_tag(version):
    tag = str(version or "").strip()
    if tag.startswith("v") and len(tag) > 1 and tag[1].isdigit():
        tag = tag[1:]
    return tag


def _get_repo_parts(app):
    if app.app_name == POS_AWESOME_APP_NAME:
        return POS_AWESOME_REPO_OWNER, POS_AWESOME_REPO_NAME

    return app.org_name, app.app_name


def _get_release_url(app):
    owner, repo = _get_repo_parts(app)
    tag = _normalize_release_tag(app.available_version)
    if app.app_name != POS_AWESOME_APP_NAME and tag:
        tag = f"v{tag}"

    return f"https://github.com/{owner}/{repo}/releases/tag/{tag}" if tag else None


def _get_security_advisories_url(app):
    owner, repo = _get_repo_parts(app)
    return f"https://github.com/{owner}/{repo}/security/advisories"


@frappe.whitelist()
def show_update_popup():
    """Show Frappe's update popup with POS Awesome release links corrected.

    Frappe v15 builds update URLs from the installed app name and assumes a
    leading "v" tag. POS Awesome's app name is still "posawesome", but the v15
    repository is "POS-Awesome-V15" and release tags are plain semver.
    """
    if frappe.get_system_settings("disable_system_update_notification"):
        return

    user = frappe.session.user
    update_info = frappe.cache.get_value("changelog-update-info")
    if not update_info:
        return

    updates = json.loads(update_info)
    update_message = ""
    if frappe.cache.sismember("changelog-update-user-set", user):
        for update_type in updates:
            release_links = ""
            for app in updates[update_type]:
                app = frappe._dict(app)
                security_msg = ""
                if app.security_issues:
                    security_msg = (
                        _("Contains {0} security fixes")
                        if app.security_issues > 1
                        else _("Contains {0} security fix")
                    )
                    security_msg = security_msg.format(frappe.bold(app.security_issues))
                    security_msg = f"""( <a href='{_get_security_advisories_url(app)}'
						 target='_blank'>{security_msg}</a> )"""

                release_links += f"""
					<b>{app.title}</b>:
						<a href='{_get_release_url(app)}'
							target="_blank">
							v{app.available_version}
						</a> {security_msg}<br>
					"""

            if release_links:
                message = _("New {} releases for the following apps are available").format(_(update_type))
                update_message += (
                    "<div class='new-version-log'>{}<div class='new-version-links'>{}</div></div>".format(
                        message, release_links
                    )
                )

    primary_action = None
    if on_frappecloud():
        primary_action = {
            "label": _("Update from Frappe Cloud"),
            "client_action": "window.open",
            "args": f"https://frappecloud.com/dashboard/sites/{frappe.local.site}",
        }

    if update_message:
        frappe.msgprint(
            update_message,
            title=_("New updates are available"),
            indicator="green",
            primary_action=primary_action,
        )
        frappe.cache.srem("changelog-update-user-set", user)
