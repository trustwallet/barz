import { ethers } from 'hardhat'
import { TestInvalidSecp256k1VerificationFacet } from '../../typechain-types'

export async function testInvalidSecp256k1VerificationFacetFixture(): Promise<TestInvalidSecp256k1VerificationFacet> {
    const factory = await ethers.getContractFactory("TestInvalidSecp256k1VerificationFacet")
    return (await factory.deploy()) as TestInvalidSecp256k1VerificationFacet
}