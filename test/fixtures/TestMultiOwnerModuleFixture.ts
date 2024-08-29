import { ethers } from 'hardhat'
import { TestMultiModuleModule } from '../../typechain-types'

export async function testMultiOwnerModuleFixture(): Promise<TestMultiModuleModule> {
    const factory = await ethers.getContractFactory("TestMultiOwnerModule")
    return (await factory.deploy()) as TestMultiOwnerModule
}