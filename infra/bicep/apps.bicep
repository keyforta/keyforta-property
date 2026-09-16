targetScope = 'resourceGroup'

param location string = resourceGroup().location
@allowed(['dev', 'test', 'production'])
param environment string
@allowed(['api', 'full', 'public-web'])
param deploymentScope string
param containerAppsEnvironmentName string
param registryName string
param apiIdentityName string
param webIdentityName string
param postgresServerName string
param apiImage string
param webImage string
param databaseUserName string
param entraAudience string
param entraIssuer string
param entraJwksUri string
param documentStorageAccountName string
param tenantApplicationContainerName string
param webCanonicalHostName string
param webWwwHostName string

var webAppName = 'ca-keyforta-${environment}-web'
var webPublicBaseUrl = 'https://${webCanonicalHostName}'
var deployApi = deploymentScope == 'api' || deploymentScope == 'full'
var deployWeb = deploymentScope == 'public-web' || deploymentScope == 'full'

resource appEnvironment 'Microsoft.App/managedEnvironments@2024-10-02-preview' existing = {
  name: containerAppsEnvironmentName
}
resource registry 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' existing = {
  name: registryName
}
resource apiIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: apiIdentityName
}
resource webIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: webIdentityName
}
resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' existing = {
  name: postgresServerName
}

resource webCanonicalCertificate 'Microsoft.App/managedEnvironments/managedCertificates@2024-10-02-preview' = if (deployWeb) {
  parent: appEnvironment
  name: 'keyforta-${environment}-web-apex'
  location: location
  properties: {
    domainControlValidation: 'HTTP'
    subjectName: webCanonicalHostName
  }
}

resource webWwwCertificate 'Microsoft.App/managedEnvironments/managedCertificates@2024-10-02-preview' = if (deployWeb) {
  parent: appEnvironment
  name: 'keyforta-${environment}-web-www'
  location: location
  properties: {
    domainControlValidation: 'CNAME'
    subjectName: webWwwHostName
  }
}

resource api 'Microsoft.App/containerApps@2024-10-02-preview' = if (deployApi) {
  name: 'ca-keyforta-${environment}-api'
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${apiIdentity.id}': {} }
  }
  properties: {
    environmentId: appEnvironment.id
    configuration: {
      ingress: {
        allowInsecure: false
        external: true
        targetPort: 4000
        transport: 'http'
      }
      registries: [{ server: registry.properties.loginServer, identity: apiIdentity.id }]
    }
    template: {
      containers: [
        {
          name: 'api'
          image: apiImage
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'API_HOST', value: '0.0.0.0' }
            { name: 'API_PORT', value: '4000' }
            { name: 'CORS_ALLOWED_ORIGIN', value: webPublicBaseUrl }
            { name: 'DATABASE_AUTH', value: 'entra' }
            { name: 'DATABASE_URL', value: 'postgresql://${databaseUserName}@${postgres.properties.fullyQualifiedDomainName}:5432/keyforta?sslmode=require' }
            { name: 'ENTRA_AUDIENCE', value: entraAudience }
            { name: 'ENTRA_ISSUER', value: entraIssuer }
            { name: 'ENTRA_JWKS_URI', value: entraJwksUri }
            { name: 'AZURE_CLIENT_ID', value: apiIdentity.properties.clientId }
            { name: 'AZURE_STORAGE_ACCOUNT_NAME', value: documentStorageAccountName }
            { name: 'AZURE_STORAGE_CONTAINER_NAME', value: tenantApplicationContainerName }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: { path: '/health', port: 4000, scheme: 'HTTP' }
              initialDelaySeconds: 10
              periodSeconds: 30
              timeoutSeconds: 5
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: { path: '/ready', port: 4000, scheme: 'HTTP' }
              initialDelaySeconds: 5
              periodSeconds: 10
              timeoutSeconds: 5
              failureThreshold: 3
            }
          ]
          resources: { cpu: json('0.5'), memory: '1Gi' }
        }
      ]
      scale: { minReplicas: environment == 'production' ? 1 : 0, maxReplicas: 3 }
    }
  }
}

resource web 'Microsoft.App/containerApps@2024-10-02-preview' = if (deployWeb) {
  name: webAppName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${webIdentity.id}': {} }
  }
  properties: {
    environmentId: appEnvironment.id
    configuration: {
      ingress: {
        allowInsecure: false
        customDomains: [
          {
            bindingType: 'SniEnabled'
            certificateId: webCanonicalCertificate.id
            name: webCanonicalHostName
          }
          {
            bindingType: 'SniEnabled'
            certificateId: webWwwCertificate.id
            name: webWwwHostName
          }
        ]
        external: true
        targetPort: 8080
        transport: 'http'
      }
      registries: [{ server: registry.properties.loginServer, identity: webIdentity.id }]
    }
    template: {
      containers: [
        {
          name: 'web'
          image: webImage
          env: [
            { name: 'NODE_ENV', value: 'production' }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: { path: '/', port: 8080, scheme: 'HTTP' }
              initialDelaySeconds: 10
              periodSeconds: 30
              timeoutSeconds: 5
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: { path: '/', port: 8080, scheme: 'HTTP' }
              initialDelaySeconds: 5
              periodSeconds: 10
              timeoutSeconds: 5
              failureThreshold: 3
            }
          ]
          resources: { cpu: json('0.5'), memory: '1Gi' }
        }
      ]
      scale: { minReplicas: environment == 'production' ? 1 : 0, maxReplicas: 3 }
    }
  }
}

output apiFqdn string = api.?properties.configuration.ingress.fqdn ?? ''
output webFqdn string = web.?properties.configuration.ingress.fqdn ?? ''
