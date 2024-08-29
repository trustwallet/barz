import { ethers } from 'hardhat'
import { TestGasPolicy } from '../../typechain-types'

export async function testGasPolicyFixture(): Promise<TestGasPolicy> {
    const factory = await ethers.getContractFactory("TestGasPolicy")
    return (await factory.deploy()) as TestGasPolicy
}