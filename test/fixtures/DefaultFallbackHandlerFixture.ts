

import { ethers } from 'hardhat'
import { AccountFacet, DefaultFallbackHandler, DiamondCutFacet, DiamondLoupeFacet, TokenReceiverFacet } from '../../typechain-types'

export async function defaultFallbackHandlerFixture(
    diamondCutFacet: DiamondCutFacet,
    accountFacet: AccountFacet,
    tokenReceiverFacet: TokenReceiverFacet,
    diamondLoupeFacet: DiamondLoupeFacet
): Promise<DefaultFallbackHandler> {
    const factory = await ethers.getContractFactory("DefaultFallbackHandler")
    return (await factory.deploy(diamondCutFacet.address, accountFacet.address, tokenReceiverFacet.address, diamondLoupeFacet.address)) as DefaultFallbackHandler
}