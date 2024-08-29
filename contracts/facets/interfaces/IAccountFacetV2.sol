// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.26;

import {IEntryPoint} from "../../aa-4337/interfaces/IEntryPoint.sol";

/**
 * @title Account Facet Interface V2
 * @dev Interface of module contract that provides the account features and init/unitialization of signer
 *      compatible with EIP-1271 & EIP-4337
 * @author David Yongjun Kim (@Powerstream3604)
 */
interface IAccountFacetV2 {
    event AccountInitialized(
        IEntryPoint indexed entryPoint,
        bytes indexed ownerPublicKey
    );
    // NOTE: Added Below Event
    event VerificationSuccess(bytes32);
    event VerificationFailure(bytes32);
    event ValidatorSystemAdded(bytes4 key, address system);
    event ValidatorSystemRemoved(bytes4 key);

    error AccountFacetV2__NotFromEntryPoint();
    error AccountFacetV2__InitializationFailure();
    error AccountFacetV2__RestrictionsFailure();
    error AccountFacetV2__NonExistentVerificationFacet();
    error AccountFacetV2__CallNotSuccessful();
    error AccountFacetV2__InvalidArrayLength();
    error AccountFacetV2__NonexistentValidatorSystem();
    error AccountFacetV2__ValidatorSystemAlreadyExists();
    error AccountFacetV2__NonExistentValidatorSystem();

    function initialize(
        address verificationFacet,
        address anEntryPoint,
        address facetRegistry,
        address _defaultFallBack,
        bytes calldata _ownerPublicKey
    ) external returns (uint256);

    function executeSingle(
        address dest,
        uint256 value,
        bytes calldata func
    ) external;

    function executeBatch(
        address[] calldata dest,
        uint256[] calldata value,
        bytes[] calldata func
    ) external;

    function addValidatorSystem(bytes2 systemKey, address system) external;

    function removeValidatorSystem(bytes2 systemKey) external;

    function nonce(uint192 key) external view returns (uint256);

    function getValidatorSystem(
        bytes2 _systemKey
    ) external view returns (address);
}
