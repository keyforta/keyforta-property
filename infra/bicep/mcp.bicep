targetScope = 'resourceGroup'

param location string = resourceGroup().location
@allowed(['dev'])
param environment string
param containerAppsEnvironmentName string
param registryName string
@description('Immutable ACR image reference in repository@sha256:digest form.')
param mcpImage string
@minLength(40)
@maxLength(40)
param sourceRevision string
param mcpHostName string
param bindMcpCertificate bool = false
param entraTenantId string
param entraAudience string
param entraIssuer string
param entraJwksUri string
param allowedClientIds string
param allowedNonBrowserClientIds string
param allowedOrigins string
param requiredScope string = 'mcp.tools.read'
param resourceScope string
@minValue(1)
@maxValue(1000)
param requestsPerMinute int = 60

var mcpAppName = 'ca-keyforta-${environment}-mcp'
var mcpIdentityName = 'id-keyforta-${environment}-mcp'
var mcpResourceUrl = 'https://${mcpHostName}'
var mcpResourceMetadataUrl = '${mcpResourceUrl}/.well-known/oauth-protected-resource'
var revisionSuffix = 'sha-${substring(sourceRevision, 0, 12)}'
var acrPullRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '7f951dda-4ed3-4680-a7ca-43fe172d538d'
)

resource appEnvironment 'Microsoft.App/managedEnvironments@2024-10-02-preview' existing = {
  name: containerAppsEnvironmentName
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' existing = {
  name: registryName
}

resource mcpIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: mcpIdentityName
  location: location
}

resource mcpRegistryPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, mcpIdentity.id, acrPullRoleDefinitionId)
  scope: registry
  properties: {
    principalId: mcpIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPullRoleDefinitionId
  }
}

resource mcpCertificate 'Microsoft.App/managedEnvironments/managedCertificates@2024-10-02-preview' = if (bindMcpCertificate) {
  parent: appEnvironment
  name: 'keyforta-${environment}-mcp'
  location: location
  properties: {
    domainControlValidation: 'CNAME'
    subjectName: mcpHostName
  }
}

resource mcp 'Microsoft.App/containerApps@2024-10-02-preview' = {
  name: mcpAppName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${mcpIdentity.id}': {} }
  }
  properties: {
    environmentId: appEnvironment.id
    configuration: {
      activeRevisionsMode: 'Multiple'
      ingress: {
        allowInsecure: false
        customDomains: bindMcpCertificate ? [
          {
            bindingType: 'SniEnabled'
            certificateId: mcpCertificate.id
            name: mcpHostName
          }
        ] : [
          {
            bindingType: 'Disabled'
            name: mcpHostName
          }
        ]
        external: true
        targetPort: 3100
        transport: 'http'
      }
      maxInactiveRevisions: 2
      registries: [
        {
          server: registry.properties.loginServer
          identity: mcpIdentity.id
        }
      ]
    }
    template: {
      revisionSuffix: revisionSuffix
      terminationGracePeriodSeconds: 30
      containers: [
        {
          name: 'mcp'
          image: mcpImage
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'MCP_HOST', value: '0.0.0.0' }
            { name: 'MCP_PORT', value: '3100' }
            { name: 'MCP_ENTRA_TENANT_ID', value: entraTenantId }
            { name: 'MCP_ENTRA_AUDIENCE', value: entraAudience }
            { name: 'MCP_ENTRA_ISSUER', value: entraIssuer }
            { name: 'MCP_ENTRA_JWKS_URI', value: entraJwksUri }
            { name: 'MCP_ALLOWED_CLIENT_IDS', value: allowedClientIds }
            { name: 'MCP_ALLOWED_NON_BROWSER_CLIENT_IDS', value: allowedNonBrowserClientIds }
            { name: 'MCP_ALLOWED_ORIGINS', value: allowedOrigins }
            { name: 'MCP_REQUIRED_SCOPE', value: requiredScope }
            { name: 'MCP_RESOURCE_SCOPE', value: resourceScope }
            { name: 'MCP_RESOURCE_URL', value: mcpResourceUrl }
            { name: 'MCP_RESOURCE_METADATA_URL', value: mcpResourceMetadataUrl }
            { name: 'MCP_REQUESTS_PER_MINUTE', value: string(requestsPerMinute) }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: { path: '/health', port: 3100, scheme: 'HTTP' }
              initialDelaySeconds: 10
              periodSeconds: 30
              timeoutSeconds: 5
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: { path: '/health', port: 3100, scheme: 'HTTP' }
              initialDelaySeconds: 5
              periodSeconds: 10
              timeoutSeconds: 5
              failureThreshold: 3
            }
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
        rules: [
          {
            name: 'http-concurrency'
            http: { metadata: { concurrentRequests: '10' } }
          }
        ]
      }
    }
  }
  dependsOn: [mcpRegistryPull]
}

output mcpFqdn string = mcp.properties.configuration.ingress.fqdn
output mcpIdentityName string = mcpIdentity.name
output mcpIdentityPrincipalId string = mcpIdentity.properties.principalId
