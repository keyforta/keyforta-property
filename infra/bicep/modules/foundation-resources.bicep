param environment string
param azureTenantId string
param location string
@minLength(3)
param resourcePrefix string

var suffix = uniqueString(resourceGroup().id)
var baseName = '${resourcePrefix}-${environment}'
var tenantApplicationContainerName = 'tenant-applications'

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-${baseName}-${suffix}'
  location: location
  properties: {
    retentionInDays: 30
    sku: { name: 'PerGB2018' }
  }
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: replace('acr${resourcePrefix}${environment}${suffix}', '-', '')
  location: location
  sku: { name: 'Basic' }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
  }
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: 'psql-${baseName}-${suffix}'
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    authConfig: {
      activeDirectoryAuth: 'Enabled'
      passwordAuth: 'Disabled'
      tenantId: azureTenantId
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      publicNetworkAccess: 'Enabled'
    }
    storage: { storageSizeGB: 32 }
    version: '16'
  }
}
  resource postgresExtensions 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
    parent: postgres
    name: 'azure.extensions'
    properties: {
      source: 'user-override'
      value: 'pgcrypto'
    }
  }

resource azureServicesFirewall 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = {
  parent: postgres
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgres
  name: 'keyforta'
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
}

resource appEnvironment 'Microsoft.App/managedEnvironments@2024-10-02-preview' = {
  name: 'cae-${baseName}-${suffix}'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
    zoneRedundant: false
  }
}

resource apiIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-${baseName}-api'
  location: location
}

resource documentStorage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'sta${take(replace('${resourcePrefix}${environment}${suffix}', '-', ''), 21)}'
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    defaultToOAuthAuthentication: true
    minimumTlsVersion: 'TLS1_2'
    publicNetworkAccess: 'Enabled'
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: documentStorage
  name: 'default'
  properties: {
    deleteRetentionPolicy: {
      days: 7
      enabled: true
    }
  }
}

resource tenantApplicationDocuments 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: tenantApplicationContainerName
  properties: {
    publicAccess: 'None'
  }
}

resource documentStorageDefender 'Microsoft.Security/defenderForStorageSettings@2022-12-01-preview' = {
  name: 'current'
  scope: documentStorage
  properties: {
    isEnabled: true
    malwareScanning: {
      // blobScanResultsOptions is documented by Defender but absent from the published Bicep type.
      onUpload: any({
        capGBPerMonth: 100
        isEnabled: true
        blobScanResultsOptions: 'BlobIndexTags'
      })
    }
    overrideSubscriptionLevelSettings: true
    sensitiveDataDiscovery: {
      isEnabled: false
    }
  }
}

var storageBlobDataContributorRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
resource apiDocumentStorageAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(tenantApplicationDocuments.id, apiIdentity.id, storageBlobDataContributorRole)
  scope: tenantApplicationDocuments
  properties: {
    principalId: apiIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: storageBlobDataContributorRole
  }
}
resource webIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-${baseName}-web'
  location: location
}
resource migrationIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-${baseName}-migration'
  location: location
}

var acrPullRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
resource apiAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, apiIdentity.id, acrPullRole)
  scope: registry
  properties: {
    principalId: apiIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPullRole
  }
}
resource webAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, webIdentity.id, acrPullRole)
  scope: registry
  properties: {
    principalId: webIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPullRole
  }
}
resource migrationAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, migrationIdentity.id, acrPullRole)
  scope: registry
  properties: {
    principalId: migrationIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPullRole
  }
}

output apiIdentityClientId string = apiIdentity.properties.clientId
output apiIdentityName string = apiIdentity.name
output containerAppsEnvironmentName string = appEnvironment.name
output migrationIdentityClientId string = migrationIdentity.properties.clientId
output migrationIdentityName string = migrationIdentity.name
output migrationIdentityPrincipalId string = migrationIdentity.properties.principalId
output postgresServerName string = postgres.name
output registryLoginServer string = registry.properties.loginServer
output registryName string = registry.name
output webIdentityName string = webIdentity.name
output documentStorageAccountName string = documentStorage.name
output tenantApplicationContainerName string = tenantApplicationContainerName
