import { ethers } from 'hardhat'
import { TestERC777 } from '../../typechain-types'

export async function testERC777ixture(
    operators: Array<string>
): Promise<TestERC777> {
    const factory = await ethers.getContractFactory("TestERC777")
    return (await factory.deploy(operators)) as TestERC777
}