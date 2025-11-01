#!/usr/bin/env python3
"""Update project version in package.json and posawesome/__init__.py."""
import json
import re
from pathlib import Path
import sys


def replace_version_in_init(version: str) -> None:
    init_path = Path("posawesome/__init__.py")
    content = init_path.read_text()
    new_content = re.sub(r'__version__\s*=\s*["\']([^"\']*)["\']', f'__version__ = "{version}"', content)
    init_path.write_text(new_content)


def replace_version_in_package_json(version: str) -> None:
    pkg_path = Path("package.json")
    data = json.loads(pkg_path.read_text())
    data["version"] = version
    pkg_path.write_text(json.dumps(data, indent=2) + "\n")


def main():
    if len(sys.argv) < 2:
        sys.exit("Usage: update_version.py <version>")
    version = sys.argv[1]
    replace_version_in_init(version)
    replace_version_in_package_json(version)


if __name__ == "__main__":
    main()
