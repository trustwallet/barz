import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { Create2Factory } from '../src/Create2Factory'
import { ethers } from 'hardhat'
import { validateAddresses } from '../src/Utils'

const deployBarzFactory: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const provider = ethers.provider
  const from = await provider.getSigner().getAddress()
  let accountFacet = process.env.ACCOUNT_FACET
  let entrypoint = process.env.ENTRYPOINT
  let facetRegistry = process.env.FACET_REGISTRY
  let defaultFallbackHandler = process.env.DEFAULT_FALLBACK_HANDLER
  let args = [accountFacet, entrypoint, facetRegistry, defaultFallbackHandler]
  if (!validateAddresses(args)) {
    console.error("Contructor parameter address is not set/invalid")
    process.exit(1)
  }

  await new Create2Factory(ethers.provider).deployFactory()

  const ret = await hre.deployments.deploy(
    'BarzFactory', {
      from,
      args: args,
      gasLimit: 6e6,
      deterministicDeployment: true
    })
  console.log('==BarzFactory addr=', ret.address)
}

export default deployBarzFactory
