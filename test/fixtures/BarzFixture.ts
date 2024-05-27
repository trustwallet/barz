import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { ethers } from 'hardhat'
import { Barz, AccountFacet, Secp256k1VerificationFacet, Secp256r1VerificationFacet, EntryPoint, FacetRegistry, DefaultFallbackHandler } from '../../typechain-types'

export async function barzFixture(
    accountFacet: AccountFacet,
    verificationFacet: Secp256k1VerificationFacet | Secp256r1VerificationFacet,
    entryPoint: EntryPoint | SignerWithAddress,
    facetRegistry: FacetRegistry,
    defaultFallbackHandler: DefaultFallbackHandler,
    ownerPublicKey: string,
    salt = "0"
): Promise<Barz> {
    const Factory = await ethers.getContractFactory("BarzFactory")
    const factory = await Factory.deploy(accountFacet.address, entryPoint.address, facetRegistry.address, defaultFallbackHandler.address)
    const barzAddr = await factory.getAddress(verificationFacet.address, ownerPublicKey, salt)
    await factory.createAccount(verificationFacet.address, ownerPublicKey, salt)
    return (await ethers.getContractAt("Barz", barzAddr)) as Barz
}