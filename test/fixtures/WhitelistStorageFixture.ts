import {ethers} from 'hardhat'
import { WhitelistStorage } from '../../typechain-types'

export async function whitelistStorageFixture(): Promise<WhitelistStorage> {
    const factory = await ethers.getContractFactory("WhitelistStorage")
    return (await factory.deploy()) as WhitelistStorage
}