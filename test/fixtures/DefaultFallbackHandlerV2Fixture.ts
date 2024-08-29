import { ethers } from 'hardhat'
import { AccountFacetV2, AccountFacet, DefaultFallbackHandlerV2, DiamondCutFacet, DiamondLoupeFacet, MMSAFacet, MSCAFacet, TokenReceiverFacet } from '../../typechain-types'

export async function defaultFallbackHandlerV2Fixture(
    diamondCutFacet: DiamondCutFacet,
    accountFacet: AccountFacetV2 | AccountFacet,
    tokenReceiverFacet: TokenReceiverFacet,
    diamondLoupeFacet: DiamondLoupeFacet,
    mmsaFacet: MMSAFacet,
    mscaFacet: MSCAFacet
): Promise<DefaultFallbackHandlerV2> {
    const factory = await ethers.getContractFactory("DefaultFallbackHandlerV2")
    return (await factory.deploy(diamondCutFacet.address, accountFacet.address, tokenReceiverFacet.address, diamondLoupeFacet.address, mmsaFacet.address, mscaFacet.address)) as DefaultFallbackHandlerV2
}