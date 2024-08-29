// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.26;

import {LibMigratorStorage} from "../libraries/LibMigratorStorage.sol";
import {LibDiamond} from "../libraries/LibDiamond.sol";
import {IERC1271} from "../interfaces/ERC/IERC1271.sol";
import {IVerificationFacet} from "./interfaces/IVerificationFacet.sol";
import {IDiamondCut} from "./base/interfaces/IDiamondCut.sol";
import {IDiamondLoupe} from "./base/interfaces/IDiamondLoupe.sol";
import {IFacetRegistry} from "../infrastructure/interfaces/IFacetRegistry.sol";
import {BarzStorage} from "../libraries/LibAppStorage.sol";
import {IMMSAFacet} from "./mmsa/interfaces/IMMSAFacet.sol";

contract V2MigrationFacet is BarzStorage {
    IDiamondLoupe public immutable defaultFallbackHandler;
    address public immutable r1FacetV2;
    address public immutable self;

    event V2MigrationComplete();

    error V2MigrationFacet__AlreadyV2();
    error V2MigrationFacet__Disallowed();

    constructor(address _defaultFallbackHandlerV2, address _r1FacetV2) {
        LibMigratorStorage.migratorStorage().version = 2;

        defaultFallbackHandler = IDiamondLoupe(_defaultFallbackHandlerV2);
        r1FacetV2 = _r1FacetV2;
        self = address(this);
    }

    function migrateToV2() external {
        LibDiamond.enforceIsSelf();

        if (
            !IFacetRegistry(s.facetRegistry).isFacetFunctionSelectorRegistered(
                self,
                0x474e4af5
            )
        ) {
            // Keccak("BarzV2Migration")
            revert V2MigrationFacet__Disallowed();
        }

        if (LibMigratorStorage.migratorStorage().version != 0) {
            revert V2MigrationFacet__AlreadyV2();
        }

        LibMigratorStorage.migratorStorage().version = 2;

        LibDiamond
            .diamondStorage()
            .defaultFallbackHandler = defaultFallbackHandler;

        IDiamondCut.FacetCut[] memory cut = new IDiamondCut.FacetCut[](1);
        bytes4[] memory verificationFunctionSelectors = new bytes4[](3);
        verificationFunctionSelectors[0] = IERC1271.isValidSignature.selector;
        verificationFunctionSelectors[1] = IVerificationFacet
            .validateOwnerSignature
            .selector;
        verificationFunctionSelectors[2] = IVerificationFacet.owner.selector;

        cut[0] = IDiamondCut.FacetCut({
            facetAddress: r1FacetV2,
            action: IDiamondCut.FacetCutAction.Replace,
            functionSelectors: verificationFunctionSelectors
        });

        IDiamondCut(address(this)).diamondCut(cut, address(0), "");
        IMMSAFacet(address(this)).initMMSA();

        emit V2MigrationComplete();
    }
}
