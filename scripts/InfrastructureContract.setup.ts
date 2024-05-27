import * as dotenv from 'dotenv';

import { securityManagerFixture } from "../test/fixtures/SecurityManagerFixture";
import { facetRegistryFixture } from "../test/fixtures/FacetRegistryFixture";

dotenv.config();
async function main() {

    const infrastructureOwner = process.env.INFRASTRUCTURE_OWNER
    if (infrastructureOwner == "" || infrastructureOwner == null || infrastructureOwner.length != 42) {
        console.error("Infrastructure Owner is not set or is invalid")
        process.exit(1)
    }
    
    console.log("-------Setting Up Infrastructure Contracts-------")
    // Setting the Security Parmeter will be done externally
    const securityManager = await securityManagerFixture(infrastructureOwner)
    console.log("   Deployed SecurityManager to: ", securityManager.address)

    const facetRegistry = await facetRegistryFixture(infrastructureOwner)
    console.log("   Deployed FacetRegistry to: ", facetRegistry.address)

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});