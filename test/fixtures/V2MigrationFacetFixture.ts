import { ethers } from 'hardhat'
import { V2MigrationFacet, DefaultFallbackHandlerV2, Secp256r1VerificationFacetV2 } from '../../typechain-types'

export async function v2MigrationFacetFixture(
    defaultFallbackHandlerV2: DefaultFallbackHandlerV2,
    secp256r1VerificationFacetV2: Secp256r1VerificationFacetV2
): Promise<V2MigrationFacet> {
    const factory = await ethers.getContractFactory("V2MigrationFacet")
    return (await factory.deploy(defaultFallbackHandlerV2.address, secp256r1VerificationFacetV2.address)) as V2MigrationFacet
}