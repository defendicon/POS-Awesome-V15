import frappe

WORKSPACE_NAME = "POS Awesome"


def execute():
    print(f"--- Starting patch to reset the {WORKSPACE_NAME} workspace. ---")

    # If the workspace exists, delete it. Frappe's migration will recreate it from the JSON file.
    if frappe.db.exists("Workspace", WORKSPACE_NAME):
        try:
            frappe.delete_doc("Workspace", WORKSPACE_NAME, force=1, ignore_permissions=True)
            frappe.db.commit()
            print(f"Successfully deleted workspace '{WORKSPACE_NAME}' to allow for a clean recreation.")
        except Exception as e:
            print(f"Failed to delete workspace '{WORKSPACE_NAME}': {e}")
    else:
        print(f"Workspace '{WORKSPACE_NAME}' not found, no deletion necessary.")

    # Clear the cache to ensure the recreated workspace is displayed correctly.
    frappe.clear_cache()
    print(f"--- Finished patch to reset the {WORKSPACE_NAME} workspace. ---")
