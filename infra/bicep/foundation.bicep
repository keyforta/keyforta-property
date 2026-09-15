targetScope = 'resourceGroup'

param environment string = 'dev'
param location string = 'southafricanorth'
@minLength(3)
param resourcePrefix string = 'keyforta'
param azureTenantId string

module stamp './modules/foundation-resources.bicep' = {
  name: 'foundation-${environment}'
  params: {
    environment: environment
    azureTenantId: azureTenantId
    location: location
    resourcePrefix: resourcePrefix
  }
}

output apiIdentityClientId string = stamp.outputs.apiIdentityClientId
output apiIdentityName string = stamp.outputs.apiIdentityName
output containerAppsEnvironmentName string = stamp.outputs.containerAppsEnvironmentName
output migrationIdentityClientId string = stamp.outputs.migrationIdentityClientId
output migrationIdentityName string = stamp.outputs.migrationIdentityName
output migrationIdentityPrincipalId string = stamp.outputs.migrationIdentityPrincipalId
output postgresServerName string = stamp.outputs.postgresServerName
output registryLoginServer string = stamp.outputs.registryLoginServer
output registryName string = stamp.outputs.registryName
output resourceGroupName string = resourceGroup().name
output webIdentityName string = stamp.outputs.webIdentityName
output documentStorageAccountName string = stamp.outputs.documentStorageAccountName
output tenantApplicationContainerName string = stamp.outputs.tenantApplicationContainerName
