import importlib.util
import pathlib
import sys
import types


REPO_ROOT = pathlib.Path(__file__).resolve().parents[4]


def install_offline_sync_package_stubs():
	for package_name in (
		"posawesome",
		"posawesome.posawesome",
		"posawesome.posawesome.api",
		"posawesome.posawesome.api.offline_sync",
	):
		package = types.ModuleType(package_name)
		package.__path__ = []
		sys.modules[package_name] = package


def load_offline_sync_common():
	spec = importlib.util.spec_from_file_location(
		"posawesome.posawesome.api.offline_sync.common",
		REPO_ROOT
		/ "posawesome"
		/ "posawesome"
		/ "api"
		/ "offline_sync"
		/ "common.py",
	)
	module = importlib.util.module_from_spec(spec)
	sys.modules["posawesome.posawesome.api.offline_sync.common"] = module
	spec.loader.exec_module(module)
	return module
