import { ethers } from 'hardhat'
import { TestNFT } from '../../typechain-types'

export async function testNFTFixture(): Promise<TestNFT> {
    const factory = await ethers.getContractFactory("TestNFT")
    return (await factory.deploy()) as TestNFT
}