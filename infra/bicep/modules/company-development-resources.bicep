param vnetCidr string
param acaSubnetCidr string
param postgresSubnetCidr string
param networkApproval string
@allowed(['bootstrap', 'continuation'])
param companyStage string

var location = 'southafricanorth'
var suffix = uniqueString(resourceGroup().id)
var tags = {
  company: 'keyforta'
  environment: 'cdev'
  managedBy: 'Bicep'
  networkApproval: networkApproval
}

// Restrict SQL clients to ACA. Preserve PostgreSQL's documented platform paths.
// Detailed rule set remains subject to independent security review before use.
resource postgresNsg 'Microsoft.Network/networkSecurityGroups@2024-05-01' = if (companyStage == 'continuation') {
  name: 'nsg-keyforta-cdev-postgres-${suffix}'
  location: location
  tags: tags
  properties: {
    securityRules: [
      {
        name: 'AllowAcaPostgres'
        properties: {
          priority: 100
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: acaSubnetCidr
          sourcePortRange: '*'
          destinationAddressPrefix: postgresSubnetCidr
          destinationPortRange: '5432'
        }
      }
      {
        name: 'AllowPostgresInternal'
        properties: {
          priority: 110
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: postgresSubnetCidr
          sourcePortRange: '*'
          destinationAddressPrefix: postgresSubnetCidr
          destinationPortRange: '5432'
        }
      }
      {
        name: 'DenyOtherSqlClients'
        properties: {
          priority: 200
          direction: 'Inbound'
          access: 'Deny'
          protocol: 'Tcp'
          sourceAddressPrefix: '*'
          sourcePortRange: '*'
          destinationAddressPrefix: postgresSubnetCidr
          destinationPortRange: '5432'
        }
      }
    ]
  }
}

resource vnet 'Microsoft.Network/virtualNetworks@2024-05-01' = if (companyStage == 'continuation') {
  name: 'vnet-keyforta-cdev-${suffix}'
  location: location
  tags: tags
  properties: {
    addressSpace: { addressPrefixes: [vnetCidr] }
    subnets: [
      {
        name: 'aca-infrastructure'
        properties: {
          addressPrefix: acaSubnetCidr
          delegations: [
            {
              name: 'aca'
              properties: { serviceName: 'Microsoft.App/environments' }
            }
          ]
        }
      }
      {
        name: 'postgres'
        properties: {
          addressPrefix: postgresSubnetCidr
          networkSecurityGroup: { id: postgresNsg.id }
          // Preserve the documented WAL/storage platform path. Not a Blob
          // account firewall change or a private endpoint for application data.
          serviceEndpoints: [{ service: 'Microsoft.Storage', locations: [location] }]
          delegations: [
            {
              name: 'postgres'
              properties: { serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers' }
            }
          ]
        }
      }
    ]
  }
}

resource postgresDns 'Microsoft.Network/privateDnsZones@2024-06-01' = if (companyStage == 'continuation') {
  name: 'companydev.postgres.database.azure.com'
  location: 'global'
  tags: tags
}

resource dnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = if (companyStage == 'continuation') {
  parent: postgresDns
  name: 'keyforta-cdev'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: { id: vnet.id }
  }
}

module stamp './foundation-resources.bicep' = {
  name: 'stamp-keyforta-cdev'
  params: {
    environment: 'cdev'
    resourcePrefix: 'keyforta'
    location: location
    azureTenantId: '8019a048-e7d6-48e8-984a-b902f641a21b'
    companyStage: companyStage
    privateNetwork: companyStage == 'bootstrap' ? {} : {
      postgresSubnetId: '${vnet!.id}/subnets/postgres'
      postgresDnsZoneId: postgresDns!.id
      acaSubnetId: '${vnet!.id}/subnets/aca-infrastructure'
      infrastructureResourceGroup: 'ME_keyforta_cdev_${suffix}'
    }
  }
  dependsOn: [dnsLink]
}

output postgresServerName string = stamp.outputs.postgresServerName
output containerAppsEnvironmentName string = stamp.outputs.containerAppsEnvironmentName
