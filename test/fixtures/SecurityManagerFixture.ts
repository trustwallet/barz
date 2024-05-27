import { ethers } from 'hardhat'
import { SecurityManager } from '../../typechain-types'

export async function securityManagerFixture(
    owner: string
): Promise<SecurityManager> {
    const factory = await ethers.getContractFactory("SecurityManager")
    return (await factory.deploy(owner)) as SecurityManager
}