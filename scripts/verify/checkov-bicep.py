"""Run pinned Checkov with conditional Bicep resource bodies visible to checks.

pycep 0.5.1 nests an if-resource's body under config.config. Checkov 3.3.17
expects its properties at config.properties. Preserve the condition and expose
the actual body, irrespective of its value: every branch must pass the checks.
No source rewriting, check suppression, or deployment-template change.
"""
from importlib.metadata import version
import sys


def install():
    if version("checkov") != "3.3.17" or version("pycep-parser") != "0.5.1":
        raise RuntimeError("Review adapter before changing pinned Checkov/pycep versions")
    from checkov.bicep.parser import Parser

    original = Parser.parse
    if getattr(original, "_conditional_config_adapter", False):
        return

    def parse(self, file_path):
        template, lines = original(self, file_path)
        if template is None:
            raise RuntimeError(f"Bicep parsing failed: {file_path}")
        for resource in template.get("resources", {}).values():
            config = resource["config"]
            if "condition" in config:
                if set(config) != {"condition", "config"} or not isinstance(config["config"], dict):
                    raise RuntimeError(f"Unknown conditional resource shape: {file_path}")
                if "condition" in config["config"]:
                    raise RuntimeError(f"Conflicting conditional resource body: {file_path}")
                resource["config"] = {**config["config"], "condition": config["condition"]}
        return template, lines

    parse._conditional_config_adapter = True
    Parser.parse = parse


if __name__ == "__main__":
    install()
    from checkov.main import Checkov
    sys.exit(Checkov().run())
