import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { Create2Factory } from '../src/Create2Factory'
import { ethers } from 'hardhat'
import { validateAddresses } from '../src/Utils'

const deployDefaultFallbackHandler: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const provider = ethers.provider
  const from = await provider.getSigner().getAddress()
  let diamondCutFacet = process.env.DIAMOND_CUT_FACET
  let accountFacet = process.env.ACCOUNT_FACET
  let tokenReceiverFacet = process.env.TOKEN_RECEIVER_FACET
  let diamondLoupeFacet = process.env.DIAMOND_LOUPE_FACET
  let args = [diamondCutFacet, accountFacet, tokenReceiverFacet, diamondLoupeFacet]
  if (!validateAddresses(args)) {
    console.error("Contructor parameter address is not set/invalid")
    process.exit(1)
  }

  await new Create2Factory(ethers.provider).deployFactory()

  const ret = await hre.deployments.deploy(
    'DefaultFallbackHandler', {
      from,
      args: args,
      gasLimit: 6e6,
      deterministicDeployment: true
    })
  console.log('==DefaultFallbackHandler addr=', ret.address)
}

export default deployDefaultFallbackHandler
