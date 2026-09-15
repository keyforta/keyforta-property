targetScope = 'resourceGroup'

param postgresServerName string
param azureTenantId string
param administratorObjectId string
param administratorPrincipalName string
@allowed(['ServicePrincipal', 'User', 'Group'])
param administratorPrincipalType string = 'ServicePrincipal'
param dbaObjectId string = ''
param dbaPrincipalName string = ''
@allowed(['User', 'Group'])
param dbaPrincipalType string = 'User'
param dbaClientIpAddress string = ''

var dbaAccessConfigured = !empty(dbaObjectId) && !empty(dbaPrincipalName) && !empty(dbaClientIpAddress)

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' existing = {
  name: postgresServerName
}

resource administrator 'Microsoft.DBforPostgreSQL/flexibleServers/administrators@2024-08-01' = {
  parent: postgres
  name: administratorObjectId
  properties: {
    principalName: administratorPrincipalName
    principalType: administratorPrincipalType
    tenantId: azureTenantId
  }
}

resource dbaAdministrator 'Microsoft.DBforPostgreSQL/flexibleServers/administrators@2024-08-01' = if (dbaAccessConfigured) {
  parent: postgres
  name: dbaObjectId
  properties: {
    principalName: dbaPrincipalName
    principalType: dbaPrincipalType
    tenantId: azureTenantId
  }
}

resource dbaWorkstationFirewall 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = if (dbaAccessConfigured) {
  parent: postgres
  name: 'AllowDbaWorkstation'
  properties: {
    startIpAddress: dbaClientIpAddress
    endIpAddress: dbaClientIpAddress
  }
}
