import { ethers } from 'hardhat'
import { DelegateCaller } from '../../typechain-types'

export async function delegateCallerFixture(): Promise<DelegateCaller> {
    const factory = await ethers.getContractFactory("DelegateCaller")
    return (await factory.deploy()) as DelegateCaller
}