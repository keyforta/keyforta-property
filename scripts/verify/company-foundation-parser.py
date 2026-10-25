"""Fail closed on foundation parse/coverage loss in Checkov's pinned parser.

Run inside the existing Checkov 3.3.17 container before the normal Bicep scan.
This actually parses the source; successful Checkov exit alone is insufficient
because that scanner can skip parser errors.
"""

from importlib.metadata import version
from pathlib import Path

from pycep import BicepParser


def main():
    if version("pycep-parser") != "0.5.1":
        raise RuntimeError("Expected Checkov 3.3.17's pycep-parser 0.5.1")
    files = {
        "infra/bicep/foundation.bicep": (set(), {"stamp"}),
        "infra/bicep/company-development.bicep": (set(), {"company"}),
        "infra/bicep/modules/company-development-resources.bicep": (
            {"postgresNsg", "vnet", "postgresDns", "dnsLink"}, {"stamp"}
        ),
        "infra/bicep/modules/foundation-resources.bicep": (
            {
                "logs", "registry", "postgres", "postgresExtensions",
                "azureServicesFirewall", "database", "appEnvironment",
                "apiIdentity", "documentStorage", "blobService",
                "tenantApplicationDocuments", "documentStorageDefender",
                "apiDocumentStorageAccess", "webIdentity", "migrationIdentity",
                "apiAcrPull", "webAcrPull", "migrationAcrPull",
                "existingApiIdentity", "existingWebIdentity", "existingMigrationIdentity",
                "existingRegistry", "existingStorage", "existingBlobService", "existingContainer",
            }, set()
        ),
    }
    for file, (resources, modules) in files.items():
        parsed = BicepParser(add_line_numbers=True).parse(file_path=Path(file))
        actual_resources = set(parsed.get("resources", {}))
        actual_modules = set(parsed.get("modules", {}))
        if actual_resources != resources or actual_modules != modules:
            raise RuntimeError(
                f"{file}: parser coverage changed: resources={actual_resources}, "
                f"modules={actual_modules}; independently review before changing expectations"
            )
        print(f"PASS pinned parser coverage: {file} ({len(resources)} resources, {len(modules)} modules)")


if __name__ == "__main__":
    main()
