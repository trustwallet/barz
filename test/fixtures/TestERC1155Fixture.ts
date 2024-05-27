import { ethers } from 'hardhat'
import { TestERC1155 } from '../../typechain-types'

export async function testERC1155Fixture(): Promise<TestERC1155> {
    const factory = await ethers.getContractFactory("TestERC1155")
    return (await factory.deploy()) as TestERC1155
}