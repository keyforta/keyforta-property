targetScope = 'resourceGroup'

param location string = resourceGroup().location
@allowed(['dev', 'test', 'production'])
param environment string
param containerAppsEnvironmentName string
param registryName string
param migrationIdentityName string
param apiIdentityName string
param postgresServerName string
param apiImage string

resource appEnvironment 'Microsoft.App/managedEnvironments@2024-10-02-preview' existing = {
  name: containerAppsEnvironmentName
}
resource registry 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' existing = {
  name: registryName
}
resource migrationIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: migrationIdentityName
}
resource apiIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: apiIdentityName
}
resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' existing = {
  name: postgresServerName
}

resource migrationJob 'Microsoft.App/jobs@2024-10-02-preview' = {
  name: 'caj-keyforta-${environment}-migration'
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${migrationIdentity.id}': {} }
  }
  properties: {
    environmentId: appEnvironment.id
    configuration: {
      replicaRetryLimit: 1
      replicaTimeout: 900
      registries: [{ server: registry.properties.loginServer, identity: migrationIdentity.id }]
      triggerType: 'Manual'
    }
    template: {
      containers: [
        {
          name: 'migration'
          image: apiImage
          command: ['node', 'apps/api/dist/migrate.js']
          env: [
            { name: 'DATABASE_AUTH', value: 'entra' }
            { name: 'DATABASE_URL', value: 'postgresql://${migrationIdentity.name}@${postgres.properties.fullyQualifiedDomainName}:5432/keyforta?sslmode=require' }
            { name: 'DATABASE_RUNTIME_PRINCIPAL', value: apiIdentity.name }
            { name: 'DATABASE_RUNTIME_PRINCIPAL_ID', value: apiIdentity.properties.principalId }
            { name: 'AZURE_CLIENT_ID', value: migrationIdentity.properties.clientId }
          ]
          resources: { cpu: json('0.5'), memory: '1Gi' }
        }
      ]
    }
  }
}

output migrationJobName string = migrationJob.name
