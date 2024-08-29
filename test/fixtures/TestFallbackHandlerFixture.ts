import { ethers } from 'hardhat'
import { TestFallbackHandler } from '../../typechain-types'

export async function testFallbackHandlerFixture(): Promise<TestFallbackHandler> {
    const factory = await ethers.getContractFactory("TestFallbackHandler")
    return (await factory.deploy()) as TestFallbackHandler
}