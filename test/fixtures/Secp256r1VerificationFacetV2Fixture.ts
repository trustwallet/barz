import { ethers } from 'hardhat'
import { Secp256r1VerificationFacetV2 } from '../../typechain-types'

export async function secp256r1VerificationFacetV2Fixture(): Promise<Secp256r1VerificationFacetV2> {
    const factory = await ethers.getContractFactory("Secp256r1VerificationFacetV2")
    return (await factory.deploy()) as Secp256r1VerificationFacetV2
}