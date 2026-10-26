"""Regression for pinned Checkov's conditional-resource config adapter."""
import importlib.util
from pathlib import Path
import sys
import unittest

sys.dont_write_bytecode = True


class ConditionalConfigurationTests(unittest.TestCase):
    def test_real_storage_config_and_mutations(self):
        spec = importlib.util.spec_from_file_location("adapter", Path(__file__).with_name("checkov-bicep.py"))
        adapter = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(adapter)
        from checkov.bicep.parser import Parser
        from checkov.arm.checks.resource.StorageAccountMinimumTlsVersion import check
        from checkov.common.models.enums import CheckResult

        adapter.install()
        parsed, _ = Parser().parse(Path("infra/bicep/modules/foundation-resources.bicep"))
        resource = parsed["resources"]["documentStorage"]
        self.assertIn("condition", resource["config"])
        config = resource["config"]
        self.assertEqual(config["properties"]["minimumTlsVersion"], "TLS1_2")
        self.assertEqual(check.scan_resource_conf(config), CheckResult.PASSED)
        config["properties"]["minimumTlsVersion"] = "TLS1_0"
        self.assertEqual(check.scan_resource_conf(config), CheckResult.FAILED)
        del config["properties"]["minimumTlsVersion"]
        self.assertEqual(check.scan_resource_conf(config), CheckResult.FAILED)

    def test_all_bicep_parse_without_skips_except_existing_mcp_arm_route(self):
        from pycep import BicepParser
        for file in Path("infra/bicep").rglob("*.bicep"):
            if file.name != "mcp.bicep":
                with self.subTest(file=file):
                    self.assertIsInstance(BicepParser().parse(file_path=file), dict)


if __name__ == "__main__":
    unittest.main()
