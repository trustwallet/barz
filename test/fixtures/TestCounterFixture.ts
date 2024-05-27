import { ethers } from 'hardhat'
import { TestCounter } from '../../typechain-types'

export async function testCounterFixture(): Promise<TestCounter> {
    const factory = await ethers.getContractFactory("TestCounter")
    return (await factory.deploy()) as TestCounter
}