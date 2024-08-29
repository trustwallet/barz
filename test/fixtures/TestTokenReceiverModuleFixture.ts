import { ethers } from 'hardhat'
import { TestTokenReceiverModule } from '../../typechain-types'

export async function testTokenReceiverModuleFixture(): Promise<TestTokenReceiverModule> {
    const factory = await ethers.getContractFactory("TestTokenReceiverModule")
    return (await factory.deploy()) as TestTokenReceiverModule
}