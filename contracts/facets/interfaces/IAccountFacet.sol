// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import {IEntryPoint} from "../../aa-4337/interfaces/IEntryPoint.sol";

/**
 * @title Account Facet Interface
 * @dev Interface of module contract that provides the account features and init/unitialization of signer
 *      compatible with EIP-1271 & EIP-4337
 * @author David Yongjun Kim (@Powerstream3604)
 */
interface IAccountFacet {
    event AccountInitialized(
        IEntryPoint indexed entryPoint,
        bytes indexed ownerPublicKey
    );
    // NOTE: Added Below Event
    event VerificationSuccess(bytes32);
    event VerificationFailure(bytes32);

    error AccountFacet__InitializationFailure();
    error AccountFacet__RestrictionsFailure();
    error AccountFacet__NonExistentVerificationFacet();
    error AccountFacet__CallNotSuccessful();
    error AccountFacet__InvalidArrayLength();

    function initialize(
        address verificationFacet,
        address anEntryPoint,
        address facetRegistry,
        address _defaultFallBack,
        bytes calldata _ownerPublicKey
    ) external returns (uint256);

    function execute(address dest, uint256 value, bytes calldata func) external;

    function executeBatch(
        address[] calldata dest,
        uint256[] calldata value,
        bytes[] calldata func
    ) external;
}
