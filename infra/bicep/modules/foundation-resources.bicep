param environment string
param azureTenantId string
param location string
@minLength(3)
param resourcePrefix string

// Empty preserves source defaults. Keep syntax compatible with the pinned
// Checkov/pycep parser; the isolated wrapper supplies all four private IDs.
param privateNetwork object = {}

// Source/default callers keep the complete original stamp. Company workflows
// select one stage explicitly; human-managed security is NEVER emitted there.
@allowed(['full', 'bootstrap', 'continuation'])
param companyStage string = 'full'

var suffix = uniqueString(resourceGroup().id)
var baseName = '${resourcePrefix}-${environment}'
var tenantApplicationContainerName = 'tenant-applications'

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = if (companyStage != 'bootstrap') {
  name: 'log-${baseName}-${suffix}'
  location: location
  properties: {
    retentionInDays: 30
    sku: { name: 'PerGB2018' }
  }
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = if (companyStage != 'continuation') {
  name: replace('acr${resourcePrefix}${environment}${suffix}', '-', '')
  location: location
  sku: { name: 'Basic' }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
  }
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = if (companyStage != 'bootstrap') {
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
    network: empty(privateNetwork) ? {
      publicNetworkAccess: 'Enabled'
    } : {
      publicNetworkAccess: 'Disabled'
      delegatedSubnetResourceId: privateNetwork.postgresSubnetId
      privateDnsZoneArmResourceId: privateNetwork.postgresDnsZoneId
    }
    storage: empty(privateNetwork) ? { storageSizeGB: 32 } : {
      storageSizeGB: 32
      type: 'Premium_LRS'
    }
    version: '16'
  }
}
  resource postgresExtensions 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = if (companyStage != 'bootstrap') {
    parent: postgres
    name: 'azure.extensions'
    properties: {
      source: 'user-override'
      value: 'pgcrypto,btree_gist'
    }
  }

resource azureServicesFirewall 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = if (companyStage == 'full' && empty(privateNetwork)) {
  parent: postgres
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = if (companyStage != 'bootstrap') {
  parent: postgres
  name: 'keyforta'
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
}

resource appEnvironment 'Microsoft.App/managedEnvironments@2024-10-02-preview' = if (companyStage != 'bootstrap') {
  name: 'cae-${baseName}-${suffix}'
  location: location
  properties: union({
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs!.properties.customerId
        sharedKey: logs!.listKeys().primarySharedKey
      }
    }
    zoneRedundant: false
  }, empty(privateNetwork) ? {} : {
      infrastructureResourceGroup: privateNetwork.infrastructureResourceGroup
      vnetConfiguration: {
        infrastructureSubnetId: privateNetwork.acaSubnetId
        internal: false
      }
      workloadProfiles: [
        {
          name: 'Consumption'
          workloadProfileType: 'Consumption'
        }
      ]
  })
}

resource apiIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = if (companyStage != 'continuation') {
  name: 'id-${baseName}-api'
  location: location
}

resource documentStorage 'Microsoft.Storage/storageAccounts@2023-05-01' = if (companyStage != 'continuation') {
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

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = if (companyStage != 'continuation') {
  parent: documentStorage
  name: 'default'
  properties: {
    deleteRetentionPolicy: {
      days: 7
      enabled: true
    }
  }
}

resource tenantApplicationDocuments 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = if (companyStage != 'continuation') {
  parent: blobService
  name: tenantApplicationContainerName
  properties: {
    publicAccess: 'None'
  }
}

resource documentStorageDefender 'Microsoft.Security/defenderForStorageSettings@2022-12-01-preview' = if (companyStage == 'full') {
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
resource apiDocumentStorageAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (companyStage == 'full') {
  name: guid(tenantApplicationDocuments.id, apiIdentity.id, storageBlobDataContributorRole)
  scope: tenantApplicationDocuments
  properties: {
    principalId: apiIdentity!.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: storageBlobDataContributorRole
  }
}
resource webIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = if (companyStage != 'continuation') {
  name: 'id-${baseName}-web'
  location: location
}
resource migrationIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = if (companyStage != 'continuation') {
  name: 'id-${baseName}-migration'
  location: location
}

var acrPullRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
resource apiAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (companyStage == 'full') {
  name: guid(registry.id, apiIdentity.id, acrPullRole)
  scope: registry
  properties: {
    principalId: apiIdentity!.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPullRole
  }
}
resource webAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (companyStage == 'full') {
  name: guid(registry.id, webIdentity.id, acrPullRole)
  scope: registry
  properties: {
    principalId: webIdentity!.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPullRole
  }
}
resource migrationAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (companyStage == 'full') {
  name: guid(registry.id, migrationIdentity.id, acrPullRole)
  scope: registry
  properties: {
    principalId: migrationIdentity!.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPullRole
  }
}

// Continuation can reference but cannot PUT bootstrap resources. In particular
// none of these existing declarations can reset a human grant/security setting.
resource existingApiIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: 'id-${baseName}-api'
}
resource existingWebIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: 'id-${baseName}-web'
}
resource existingMigrationIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: 'id-${baseName}-migration'
}
resource existingRegistry 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' existing = {
  name: replace('acr${resourcePrefix}${environment}${suffix}', '-', '')
}
resource existingStorage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: 'sta${take(replace('${resourcePrefix}${environment}${suffix}', '-', ''), 21)}'
}
resource existingBlobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' existing = {
  parent: existingStorage
  name: 'default'
}
resource existingContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' existing = {
  parent: existingBlobService
  name: tenantApplicationContainerName
}

output apiIdentityClientId string = companyStage == 'continuation' ? existingApiIdentity.properties.clientId : apiIdentity!.properties.clientId
output apiIdentityName string = apiIdentity.name
output containerAppsEnvironmentName string = companyStage == 'bootstrap' ? '' : appEnvironment!.name
output migrationIdentityClientId string = companyStage == 'continuation' ? existingMigrationIdentity.properties.clientId : migrationIdentity!.properties.clientId
output migrationIdentityName string = migrationIdentity.name
output migrationIdentityPrincipalId string = companyStage == 'continuation' ? existingMigrationIdentity.properties.principalId : migrationIdentity!.properties.principalId
output postgresServerName string = companyStage == 'bootstrap' ? '' : postgres!.name
output registryLoginServer string = companyStage == 'continuation' ? existingRegistry.properties.loginServer : registry!.properties.loginServer
output registryName string = registry.name
output webIdentityName string = webIdentity.name
output documentStorageAccountName string = documentStorage.name
output tenantApplicationContainerName string = tenantApplicationContainerName
output bootstrapResourceIds array = companyStage == 'continuation' ? [
  existingApiIdentity.id
  existingWebIdentity.id
  existingMigrationIdentity.id
  existingRegistry.id
  existingStorage.id
  existingBlobService.id
  existingContainer.id
] : [
  apiIdentity!.id
  webIdentity!.id
  migrationIdentity!.id
  registry!.id
  documentStorage!.id
  blobService!.id
  tenantApplicationDocuments!.id
]
