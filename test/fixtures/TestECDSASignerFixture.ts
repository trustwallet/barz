import { ethers } from 'hardhat'
import { TestECDSASigner } from '../../typechain-types'

export async function testECDSASignerFixture(): Promise<TestECDSASigner> {
    const factory = await ethers.getContractFactory("TestECDSASigner")
    return (await factory.deploy()) as TestECDSASigner
}