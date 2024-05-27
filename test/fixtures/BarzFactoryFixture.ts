import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { ethers } from 'hardhat'
import { AccountFacet, BarzFactory, DefaultFallbackHandler, EntryPoint, FacetRegistry } from '../../typechain-types'
import { Contract } from 'ethers'

export async function barzFactoryFixture(
    accountFacet: AccountFacet,
    entryPoint: EntryPoint | SignerWithAddress | Contract,
    facetRegistry: FacetRegistry,
    defaultFallbackHandler: DefaultFallbackHandler
): Promise<BarzFactory> {
    const factory = await ethers.getContractFactory("BarzFactory")
    return (await factory.deploy(accountFacet.address, entryPoint.address, facetRegistry.address, defaultFallbackHandler.address)) as BarzFactory
}