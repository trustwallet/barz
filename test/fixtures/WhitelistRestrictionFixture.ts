import {ethers} from 'hardhat'
import { WhitelistRestriction, WhitelistStorage } from '../../typechain-types'

export async function whitelistRestrictionFixture(
    whitelistStorage: WhitelistStorage
): Promise<WhitelistRestriction> {
    const factory = await ethers.getContractFactory("WhitelistRestriction")
    return (await factory.deploy(whitelistStorage.address)) as WhitelistRestriction
}