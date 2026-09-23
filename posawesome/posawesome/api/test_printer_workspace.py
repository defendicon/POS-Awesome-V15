import json
import pathlib
import unittest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
WORKSPACE_PATH = REPO_ROOT / "posawesome" / "posawesome" / "workspace" / "pos_awesome" / "pos_awesome.json"
MODULE_CONFIG_PATH = REPO_ROOT / "posawesome" / "config" / "pos_awesome.py"
PATCHES_PATH = REPO_ROOT / "posawesome" / "patches.txt"
PATCH_MODULE = "posawesome.patches.add_printer_profile_to_workspace"


class TestPrinterWorkspaceExposure(unittest.TestCase):
    def test_workspace_profile_card_exposes_printer_profiles(self):
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
        self.assertTrue(
            any(
                link.get("type") == "Link"
                and link.get("link_to") == "POSA Printer Profile"
                and link.get("link_type") == "DocType"
                for link in profile_links
            )
        )

    def test_legacy_module_menu_and_migration_expose_printer_profiles(self):
        self.assertIn('"name": "POSA Printer Profile"', MODULE_CONFIG_PATH.read_text(encoding="utf-8"))
        self.assertIn(PATCH_MODULE, PATCHES_PATH.read_text(encoding="utf-8").splitlines())


if __name__ == "__main__":
    unittest.main()
