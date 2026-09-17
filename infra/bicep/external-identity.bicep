targetScope = 'subscription'

@description('Azure region for the resource group metadata.')
param resourceGroupLocation string = 'southafricanorth'

@description('Dedicated resource group linked to the External ID tenant.')
param resourceGroupName string = 'rg-keyforta-identity-dev'

@description('Globally unique External ID tenant domain prefix.')
param tenantDomainPrefix string

@description('Customer-facing External ID tenant display name.')
param tenantDisplayName string

@description('ISO 3166-1 alpha-2 country code selected for the tenant.')
param tenantCountryCode string

@description('Microsoft Entra External ID data region corresponding to the selected country.')
param tenantDataLocation string

resource identityResourceGroup 'Microsoft.Resources/resourceGroups@2024-11-01' = {
  name: resourceGroupName
  location: resourceGroupLocation
  tags: {
    environment: 'dev'
    product: 'keyforta'
    purpose: 'customer-identity'
  }
}

module externalIdentity './modules/external-identity-resources.bicep' = {
  scope: identityResourceGroup
  params: {
    tenantCountryCode: tenantCountryCode
    tenantDataLocation: tenantDataLocation
    tenantDisplayName: tenantDisplayName
    tenantDomainPrefix: tenantDomainPrefix
  }
}

output externalTenantId string = externalIdentity.outputs.externalTenantId
output externalTenantName string = externalIdentity.outputs.externalTenantName
output identityResourceGroupName string = identityResourceGroup.name
