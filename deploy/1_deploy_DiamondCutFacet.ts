import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { Create2Factory } from '../src/Create2Factory'
import { ethers } from 'hardhat'
import { validateAddresses } from '../src/Utils'

const deployDiamondCutFacet: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const provider = ethers.provider
  const from = await provider.getSigner().getAddress()
  let securityManager = process.env.SECURITY_MANAGER
  let args = [securityManager]
  if (!validateAddresses(args)) {
    console.error("Security Manager is not set/invalid")
    process.exit(1)
  }

  await new Create2Factory(ethers.provider).deployFactory()

  const ret = await hre.deployments.deploy(
    'DiamondCutFacet', {
      from,
      args: args,
      gasLimit: 6e6,
      deterministicDeployment: true
    })
  console.log('==DiamondCutFacet addr=', ret.address)
}

export default deployDiamondCutFacet
