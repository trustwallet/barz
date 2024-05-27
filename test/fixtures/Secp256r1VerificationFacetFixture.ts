import { ethers } from 'hardhat'
import { Secp256r1VerificationFacet } from '../../typechain-types'

export async function secp256r1VerificationFacetFixture(): Promise<Secp256r1VerificationFacet> {
    const factory = await ethers.getContractFactory("Secp256r1VerificationFacet")
    return (await factory.deploy()) as Secp256r1VerificationFacet
}