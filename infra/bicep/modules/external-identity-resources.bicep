targetScope = 'resourceGroup'

@description('Globally unique External ID tenant domain prefix.')
@minLength(1)
@maxLength(26)
param tenantDomainPrefix string

@description('Customer-facing External ID tenant display name.')
param tenantDisplayName string

@description('ISO 3166-1 alpha-2 country code selected for the tenant.')
param tenantCountryCode string

@description('Microsoft Entra External ID data region corresponding to the selected country.')
@allowed([
  'United States'
  'Europe'
  'Asia Pacific'
  'Australia'
  'Japan'
])
param tenantDataLocation string

resource externalTenant 'Microsoft.AzureActiveDirectory/ciamDirectories@2023-05-17-preview' = {
  // The live API requires the full domain; the preview Bicep schema still caps the prefix at 26 characters.
  #disable-next-line BCP335
  name: '${tenantDomainPrefix}.onmicrosoft.com'
  location: tenantDataLocation
  properties: {
    createTenantProperties: {
      countryCode: tenantCountryCode
      displayName: tenantDisplayName
    }
  }
  sku: {
    name: 'Base'
    tier: 'A0'
  }
  tags: {
    environment: 'dev'
    product: 'keyforta'
    purpose: 'customer-identity'
  }
}

output externalTenantId string = externalTenant.properties.tenantId
output externalTenantName string = '${tenantDomainPrefix}.onmicrosoft.com'
