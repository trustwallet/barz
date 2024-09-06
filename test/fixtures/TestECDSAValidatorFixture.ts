import { ethers } from 'hardhat'
import { TestECDSAValidator } from '../../typechain-types'

export async function testECDSAValidatorFixture(): Promise<TestECDSAValidator> {
    const factory = await ethers.getContractFactory("TestECDSAValidator")
    return (await factory.deploy()) as TestECDSAValidator
}