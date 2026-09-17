# Architecture supporting documents

This directory adds detailed KEYFORTA context, domain, integration, security,
data, and Azure views. The authoritative architecture decisions remain in
`../adr/`.

The files under `adr/` are retained candidate and historical decision records.
They do not supersede `../adr/`, the backend implementation specification, or
the production data model unless a reviewed decision explicitly reconciles and
promotes them.

## Repository topology and ownership

This map describes source-control ownership and available deployment paths, not
the live state of an environment. **Deployment-capable** means the repository
contains a gated workflow, image definition, and infrastructure definition;
deployment still requires reviewed evidence and human approval. Portal and jobs
remain outside those deployment paths.

```mermaid
flowchart TB
	subgraph CurrentApps["Applications with current deployment paths"]
		Public["apps/public-web"]
		Admin["apps/admin-web"]
		Api["apps/api"]
		Mcp["apps/mcp-server: dedicated gated path"]
	end

	subgraph DeferredApps["Inactive or deferred deployment surfaces"]
		Portal["apps/portal-web: local static implementation"]
		Jobs["apps/jobs: worker boundary only"]
	end

	subgraph Shared["Shared packages"]
		ApiClient["api-client"]
		Auth["auth"]
		Authorization["authorization"]
		Brand["brand"]
		BrowserAuth["browser-auth"]
		BuildUtils["build-utils"]
		Contracts["contracts"]
		Types["types"]
		Ui["ui"]
		UiCore["ui-core"]
	end

	subgraph Tools["Bounded tools"]
		SystemHealth["tools/system/health: synthetic MCP tool and widget"]
	end

	subgraph Delivery["Infrastructure and delivery ownership"]
		MainDeploy[".github/workflows/deploy.yml"]
		McpDeploy[".github/workflows/deploy-mcp.yml"]
		Quality["CI, security, and DAST workflows"]
		Bicep["infra/bicep and infra/postgres"]
		Images["deployments/azure/docker"]
	end

	subgraph Documentation["Documentation authority"]
		ContractsDocs["docs root contracts and openapi.yaml"]
		Decisions["docs/adr accepted decisions"]
		Architecture["docs/architecture supporting views"]
		Operations["docs/operations runbooks and release controls"]
	end

	Public --> ApiClient
	Public --> BrowserAuth
	Public --> Brand
	Public --> Contracts
	Admin --> BrowserAuth
	Admin --> Contracts
	Admin --> Ui
	Api --> Contracts
	Mcp --> Contracts
	Mcp --> Types
	Portal --> Ui
	ApiClient --> Contracts
	Contracts --> Types
	UiCore --> Contracts
	SystemHealth --> BuildUtils
	SystemHealth --> Contracts
	SystemHealth --> Types
	SystemHealth --> UiCore

	MainDeploy --> Api
	MainDeploy --> Public
	MainDeploy --> Admin
	McpDeploy --> Mcp
	Bicep --> MainDeploy
	Bicep --> McpDeploy
	Images --> MainDeploy
	Images --> McpDeploy
	Quality -.-> CurrentApps
	Quality -.-> DeferredApps
	Quality -.-> Shared
	Quality -.-> Tools

	ContractsDocs -.-> CurrentApps
	ContractsDocs -.-> DeferredApps
	ContractsDocs -.-> Shared
	Decisions -.-> Bicep
	Decisions -.-> CurrentApps
	Architecture --> Decisions
	Operations -.-> MainDeploy
	Operations -.-> McpDeploy
```

Arrows from applications and tools to packages are current manifest
dependencies. The unconnected `auth` and `authorization` nodes are shared
package surfaces but are not direct application or tool dependencies in current
manifests.
Infrastructure and workflow arrows show delivery ownership, while dotted
documentation arrows show governance rather than runtime calls. See the
[diagram catalog](../DIAGRAMS.md) for status, semantic ownership, authoritative
sources, and review triggers.