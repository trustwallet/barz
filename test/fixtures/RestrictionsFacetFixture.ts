import {ethers} from 'hardhat'
import { RestrictionsFacet } from '../../typechain-types'

export async function restrictionsFacetFixture(): Promise<RestrictionsFacet> {
    const factory = await ethers.getContractFactory("RestrictionsFacet")
    return (await factory.deploy()) as RestrictionsFacet
}