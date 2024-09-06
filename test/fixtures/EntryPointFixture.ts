import { ethers } from 'hardhat'
import { EntryPoint } from '../../typechain-types'
import { ENTRYPOINT_V6 } from '../utils/testutils'

export async function entryPointFixture(): Promise<EntryPoint> {
    const Contract = await ethers.getContractFactory("EntryPoint");
    const contract = await Contract.deploy();
  
    // Retrieve the deployed contract bytecode
    const deployedCode = await ethers.provider.getCode(
        contract.address,
    );
  
    // Use hardhat_setCode to set the contract code at the specified address
    await ethers.provider.send("hardhat_setCode", [ENTRYPOINT_V6, deployedCode]);
  
    return Contract.attach(ENTRYPOINT_V6) as EntryPoint;
}
