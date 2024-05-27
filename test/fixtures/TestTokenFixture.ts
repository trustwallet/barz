import { ethers } from 'hardhat'
import { TestToken } from '../../typechain-types'

export async function testTokenFixture(): Promise<TestToken> {
    const factory = await ethers.getContractFactory("TestToken")
    return (await factory.deploy()) as TestToken
}