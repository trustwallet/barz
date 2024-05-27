// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import {LibDiamond} from "./libraries/LibDiamond.sol";
import {IBarz} from "./interfaces/IBarz.sol";

/**
 * @title Barz
 * @dev A diamond proxy wallet with a modular & upgradeable architecture
 * @author David Yongjun Kim (@Powerstream3604)
 */
contract Barz is IBarz {
    /**
     * @notice Initializes Barz with the given parameters. Barz account is intended to be created from Barz Factory for stable deployment.
     * @dev This method makes a delegate call to account facet and account facet handles the initialization.
     *      With modular architecture, Barz encompasses wide spectrum of architecture and logic.
     *      The only requirement is account facet to comply with initialize() interface.
     *      Barz doesn't include built-in functions and is a full proxy, for maximum extensibility and modularity.
     * @param _accountFacet Address of Account Facet in charge of the Barz initialization
     * @param _verificationFacet Address of Verification Facet for verifying the signature. Could be any signature scheme
     * @param _entryPoint Address of Entry Point contract
     * @param _facetRegistry Address of Facet Registry. Facet Registry is a registry holding trusted facets that could be added to user's wallet
     * @param _defaultFallBack Address of Default FallBack Handler. Middleware contract for more efficient deployment
     * @param _ownerPublicKey Bytes of Owner Public Key using for initialization
     */
    constructor(
        address _accountFacet,
        address _verificationFacet,
        address _entryPoint,
        address _facetRegistry,
        address _defaultFallBack,
        bytes memory _ownerPublicKey
    ) payable {
        bytes memory initCall = abi.encodeWithSignature(
            "initialize(address,address,address,address,bytes)",
            _verificationFacet,
            _entryPoint,
            _facetRegistry,
            _defaultFallBack,
            _ownerPublicKey
        );
        (bool success, bytes memory result) = _accountFacet.delegatecall(
            initCall
        );
        if (!success || uint256(bytes32(result)) != 1) {
            revert Barz__InitializationFailure();
        }
    }

    /**
     * @notice Fallback function for Barz complying with Diamond Standard with customization of adding Default Fallback Handler
     * @dev Find facet for function that is called and execute the function if a facet is found and return any value.
     */
    fallback() external payable {
        LibDiamond.DiamondStorage storage ds;
        bytes32 position = LibDiamond.DIAMOND_STORAGE_POSITION;
        // get diamond storage
        assembly {
            ds.slot := position
        }
        // get facet from function selector
        address facet = address(bytes20(ds.facets[msg.sig]));
        if (facet == address(0))
            facet = ds.defaultFallbackHandler.facetAddress(msg.sig);
        require(facet != address(0), "Barz: Function does not exist");
        // Execute external function from facet using delegatecall and return any value.
        assembly {
            // copy function selector and any arguments
            calldatacopy(0, 0, calldatasize())
            // execute function call using the facet
            let result := delegatecall(gas(), facet, 0, calldatasize(), 0, 0)
            // get any return value
            returndatacopy(0, 0, returndatasize())
            // return any return value or error back to the caller
            switch result
            case 0 {
                revert(0, returndatasize())
            }
            default {
                return(0, returndatasize())
            }
        }
    }

    /**
     * @notice Receive function to receive native token without data
     */
    receive() external payable {}
}
