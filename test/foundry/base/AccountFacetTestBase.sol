// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import {IEntryPoint} from "../../../contracts/aa-4337/interfaces/IEntryPoint.sol";
import {IDiamondCut} from "../../../contracts/facets/base/interfaces/IDiamondCut.sol";

contract AccountFacetTestBase {
    event AccountInitialized(
        IEntryPoint indexed entryPoint,
        bytes indexed ownerPublicKey
    );
    event SignerInitialized(bytes);

    event CounterIncremented(int count);

    event DiamondCut(
        IDiamondCut.FacetCut[] _diamondCut,
        address _init,
        bytes _calldata
    );
}