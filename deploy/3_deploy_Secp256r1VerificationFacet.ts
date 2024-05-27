import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { Create2Factory } from '../src/Create2Factory'
import { ethers } from 'hardhat'

const deploySecp256r1VerificationFacet: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const provider = ethers.provider
  const from = await provider.getSigner().getAddress()

  await new Create2Factory(ethers.provider).deployFactory()

  const ret = await hre.deployments.deploy(
    'Secp256r1VerificationFacet', {
      from,
      args: [],
      gasLimit: 6e6,
      deterministicDeployment: true
    })
  console.log('==Secp256r1VerificationFacet addr=', ret.address)
}

export default deploySecp256r1VerificationFacet
