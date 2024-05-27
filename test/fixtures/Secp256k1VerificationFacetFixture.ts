import { ethers } from 'hardhat'
import { Secp256k1VerificationFacet } from '../../typechain-types'

export async function secp256k1VerificationFacetFixture(): Promise<Secp256k1VerificationFacet> {
    const factory = await ethers.getContractFactory("Secp256k1VerificationFacet")
    return (await factory.deploy()) as Secp256k1VerificationFacet
}