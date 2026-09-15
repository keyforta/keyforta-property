targetScope = 'resourceGroup'

param location string = resourceGroup().location
@allowed(['dev'])
param environment string
param containerAppsEnvironmentName string
param registryName string
param migrationIdentityName string
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
resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' existing = {
  name: postgresServerName
}

resource seedJob 'Microsoft.App/jobs@2024-10-02-preview' = {
  name: 'caj-keyforta-${environment}-seed'
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
          name: 'seed'
          image: apiImage
          command: ['node', 'apps/api/dist/seed.js']
          env: [
            { name: 'DATABASE_AUTH', value: 'entra' }
            { name: 'DATABASE_URL', value: 'postgresql://${migrationIdentity.name}@${postgres.properties.fullyQualifiedDomainName}:5432/keyforta?sslmode=require' }
            { name: 'AZURE_CLIENT_ID', value: migrationIdentity.properties.clientId }
            { name: 'DEPLOYMENT_ENVIRONMENT', value: environment }
            { name: 'CONFIRM_SYNTHETIC_SEED', value: 'synthetic-dev-data' }
          ]
          resources: { cpu: json('0.5'), memory: '1Gi' }
        }
      ]
    }
  }
}

output seedJobName string = seedJob.name