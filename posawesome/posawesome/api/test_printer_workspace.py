import json
import pathlib
import unittest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
WORKSPACE_PATH = REPO_ROOT / "posawesome" / "posawesome" / "workspace" / "pos_awesome" / "pos_awesome.json"
MODULE_CONFIG_PATH = REPO_ROOT / "posawesome" / "config" / "pos_awesome.py"
PATCHES_PATH = REPO_ROOT / "posawesome" / "patches.txt"
HOOKS_PATH = REPO_ROOT / "posawesome" / "hooks.py"
CUSTOM_FIELDS_PATH = REPO_ROOT / "posawesome" / "fixtures" / "custom_field.json"
FRONTEND_OUTPUT_PATH = (
    REPO_ROOT / "frontend" / "src" / "posapp" / "composables" / "pos" / "items" / "useBarcodePrintOutput.ts"
)
FRONTEND_VIEW_PATH = (
    REPO_ROOT / "frontend" / "src" / "posapp" / "components" / "pos" / "shell" / "BarcodePrinting.vue"
)
WORKSPACE_PATCH = "posawesome.patches.remove_printer_profile_from_workspace"
REMOVAL_PATCH = "posawesome.patches.remove_printer_profile_feature"


class TestPrinterWorkspaceExposure(unittest.TestCase):
    def test_workspace_does_not_expose_advanced_printer_profiles(self):
        workspace = json.loads(WORKSPACE_PATH.read_text(encoding="utf-8"))
        links = workspace.get("links") or []

        profile_index = next(
            index
            for index, link in enumerate(links)
            if link.get("type") == "Card Break" and link.get("label") == "Profile"
        )
        next_card_index = next(
            (
                index
                for index in range(profile_index + 1, len(links))
                if links[index].get("type") == "Card Break"
            ),
            len(links),
        )
        profile_links = links[profile_index + 1 : next_card_index]

        self.assertEqual(links[profile_index].get("link_count"), len(profile_links))
        self.assertFalse(
            any(
                link.get("type") == "Link" and link.get("link_to") == "POSA Printer Profile" for link in links
            )
        )

    def test_printer_profile_model_and_api_are_removed(self):
        self.assertFalse((REPO_ROOT / "posawesome" / "posawesome" / "api" / "printer_api.py").exists())
        doctype_root = REPO_ROOT / "posawesome" / "posawesome" / "doctype"
        for directory in ("posa_printer_profile", "posa_printer_routing_rule"):
            source_files = [
                *doctype_root.joinpath(directory).glob("*.py"),
                *doctype_root.joinpath(directory).glob("*.json"),
                *doctype_root.joinpath(directory).glob("*.js"),
            ]
            self.assertEqual(source_files, [])

    def test_pos_profile_fixture_and_frontend_do_not_reference_removed_feature(self):
        custom_fields = json.loads(CUSTOM_FIELDS_PATH.read_text(encoding="utf-8"))
        self.assertFalse(
            any(field.get("fieldname") == "posa_default_printer_profile" for field in custom_fields)
        )
        self.assertNotIn("posa_default_printer_profile", HOOKS_PATH.read_text(encoding="utf-8"))

        frontend_source = "\n".join(
            [
                FRONTEND_OUTPUT_PATH.read_text(encoding="utf-8"),
                FRONTEND_VIEW_PATH.read_text(encoding="utf-8"),
            ]
        )
        self.assertNotIn("printer_api", frontend_source)
        self.assertNotIn("Printer Profile", frontend_source)

    def test_legacy_module_menu_stays_clean_and_migrations_remove_existing_feature(self):
        self.assertNotIn('"name": "POSA Printer Profile"', MODULE_CONFIG_PATH.read_text(encoding="utf-8"))
        patches = PATCHES_PATH.read_text(encoding="utf-8").splitlines()
        self.assertIn(WORKSPACE_PATCH, patches)
        self.assertIn(REMOVAL_PATCH, patches)


if __name__ == "__main__":
    unittest.main()
