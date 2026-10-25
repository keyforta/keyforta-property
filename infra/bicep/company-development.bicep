targetScope = 'resourceGroup'

// Required inputs: no example CIDR or approval default is deployable.
// The GitHub preview path validates canonical RFC1918, containment, nonoverlap,
// reserved ranges and exact agreement with externally approved environment values.
@minLength(9)
@maxLength(18)
param vnetCidr string
@minLength(9)
@maxLength(18)
param acaSubnetCidr string
@minLength(9)
@maxLength(18)
param postgresSubnetCidr string
@minLength(1)
@maxLength(256)
param networkApproval string

// Even an incorrectly scoped outer invocation cannot route workload resources
// to source dev. The workflow also verifies the actual tenant/sub/RG before ARM.
module company './modules/company-development-resources.bicep' = {
  name: 'foundation-keyforta-cdev'
  scope: resourceGroup('891e5e6e-8ae3-4455-9184-8d7606223d91', 'rg-keyforta-companydev-san')
  params: {
    vnetCidr: vnetCidr
    acaSubnetCidr: acaSubnetCidr
    postgresSubnetCidr: postgresSubnetCidr
    networkApproval: networkApproval
  }
}

output postgresServerName string = company.outputs.postgresServerName
output containerAppsEnvironmentName string = company.outputs.containerAppsEnvironmentName
