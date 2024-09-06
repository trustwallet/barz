import { ethers } from 'hardhat'
import { TestRateLimitPolicy } from '../../typechain-types'

export async function testRateLimitPolicyFixture(): Promise<TestRateLimitPolicy> {
    const factory = await ethers.getContractFactory("TestRateLimitPolicy")
    return (await factory.deploy()) as TestRateLimitPolicy
}