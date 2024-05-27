import { ethers } from 'hardhat'
import { EntryPoint } from '../../typechain-types'

export async function entryPointFixture(): Promise<EntryPoint> {
    const factory = await ethers.getContractFactory("EntryPoint")
    return (await factory.deploy()) as EntryPoint
}