import { ethers } from 'hardhat'
import { TestMMSAExecutor } from '../../typechain-types'

export async function testMMSAExecutorFixture(): Promise<TestMMSAExecutor> {
    const factory = await ethers.getContractFactory("TestMMSAExecutor")
    return (await factory.deploy()) as TestMMSAExecutor
}