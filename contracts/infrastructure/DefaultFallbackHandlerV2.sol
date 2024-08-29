// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.26;

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {IERC777Recipient} from "@openzeppelin/contracts/token/ERC777/IERC777Recipient.sol";
import {BaseAccount} from "../aa-4337/core/BaseAccount.sol";
import {DefaultLibDiamond} from "../libraries/DefaultLibDiamond.sol";
import {IDiamondCut} from "../facets/base/interfaces/IDiamondCut.sol";
import {IAccountFacetV2} from "../facets/interfaces/IAccountFacetV2.sol";
import {IStorageLoupe} from "../facets/base/interfaces/IStorageLoupe.sol";
import {IDiamondLoupe} from "../facets/base/interfaces/IDiamondLoupe.sol";
import {IERC677Receiver} from "../interfaces/ERC/IERC677Receiver.sol";
import {IERC165} from "../interfaces/ERC/IERC165.sol";
import {IMMSAFacet} from "../facets/mmsa/interfaces/IMMSAFacet.sol";
import {IMSCAFacet} from "../facets/msca/interfaces/IMSCAFacet.sol";
import {IAccountLoupe} from "../facets/msca/interfaces/IAccountLoupe.sol";
import {IModuleManager} from "../facets/msca/interfaces/IModuleManager.sol";
import {IModuleExecutor} from "../facets/msca/interfaces/IModuleExecutor.sol";
import {IStandardExecutor} from "../facets/msca/interfaces/IStandardExecutor.sol";

/**
 * @title DefaultFallbackHandler V2
 * @dev A default fallback handler for Barz
 * @author David Yongjun Kim (@Powerstream3604)
 */
contract DefaultFallbackHandlerV2 is IDiamondLoupe {
    address public immutable diamondCutFacet;
    address public immutable accountFacetV2;
    address public immutable tokenReceiverFacet;
    address public immutable diamondLoupeFacet;
    address public immutable mmsaFacet;
    address public immutable mscaFacet;
    uint256 public constant facetNumber = 6;

    constructor(
        address _diamondCutFacet,
        address _accountFacetV2,
        address _tokenReceiverFacet,
        address _diamondLoupeFacet,
        address _mmsaFacet,
        address _mscaFacet
    ) payable {
        diamondCutFacet = _diamondCutFacet;
        accountFacetV2 = _accountFacetV2;
        tokenReceiverFacet = _tokenReceiverFacet;
        diamondLoupeFacet = _diamondLoupeFacet;
        mmsaFacet = _mmsaFacet;
        mscaFacet = _mscaFacet;
    }

    /**
     * @notice Returns the facet information of call facets registered to this diamond.
     * @return facets_ The facet struct array including all facet information
     */
    function facets() external view override returns (Facet[] memory facets_) {
        facets_ = new Facet[](6);
        facets_[0].facetAddress = diamondCutFacet;
        facets_[0].functionSelectors = new bytes4[](1);
        facets_[0].functionSelectors[0] = IDiamondCut.diamondCut.selector;

        facets_[1].facetAddress = accountFacetV2;
        facets_[1].functionSelectors = new bytes4[](8);
        facets_[1].functionSelectors[0] = BaseAccount.validateUserOp.selector;
        facets_[1].functionSelectors[1] = IAccountFacetV2.executeBatch.selector;
        facets_[1].functionSelectors[2] = IAccountFacetV2
            .executeSingle
            .selector;
        facets_[1].functionSelectors[3] = IAccountFacetV2.nonce.selector;
        facets_[1].functionSelectors[4] = BaseAccount.entryPoint.selector;
        facets_[1].functionSelectors[5] = IAccountFacetV2
            .addValidatorSystem
            .selector;
        facets_[1].functionSelectors[6] = IAccountFacetV2
            .removeValidatorSystem
            .selector;
        facets_[1].functionSelectors[7] = IAccountFacetV2
            .getValidatorSystem
            .selector;

        facets_[2].facetAddress = tokenReceiverFacet;
        facets_[2].functionSelectors = new bytes4[](5);
        facets_[2].functionSelectors[0] = IERC721Receiver
            .onERC721Received
            .selector;
        facets_[2].functionSelectors[1] = IERC1155Receiver
            .onERC1155Received
            .selector;
        facets_[2].functionSelectors[2] = IERC1155Receiver
            .onERC1155BatchReceived
            .selector;
        facets_[2].functionSelectors[3] = IERC777Recipient
            .tokensReceived
            .selector;
        facets_[2].functionSelectors[4] = IERC677Receiver
            .onTokenTransfer
            .selector;

        facets_[3].facetAddress = diamondLoupeFacet;
        facets_[3].functionSelectors = new bytes4[](9);
        facets_[3].functionSelectors[0] = IDiamondLoupe.facets.selector;
        facets_[3].functionSelectors[1] = IDiamondLoupe
            .facetFunctionSelectors
            .selector;
        facets_[3].functionSelectors[2] = IDiamondLoupe.facetAddresses.selector;
        facets_[3].functionSelectors[3] = IDiamondLoupe.facetAddress.selector;
        facets_[3].functionSelectors[4] = IERC165.supportsInterface.selector;
        facets_[3].functionSelectors[5] = IStorageLoupe
            .facetsFromStorage
            .selector;
        facets_[3].functionSelectors[6] = IStorageLoupe
            .facetFunctionSelectorsFromStorage
            .selector;
        facets_[3].functionSelectors[7] = IStorageLoupe
            .facetAddressesFromStorage
            .selector;
        facets_[3].functionSelectors[8] = IStorageLoupe
            .facetAddressFromStorage
            .selector;

        facets_[4].facetAddress = mmsaFacet;
        facets_[4].functionSelectors = new bytes4[](14);
        facets_[4].functionSelectors[0] = IMMSAFacet.installModule.selector;
        facets_[4].functionSelectors[1] = IMMSAFacet.uninstallModule.selector;
        facets_[4].functionSelectors[2] = IMMSAFacet.execute.selector;
        facets_[4].functionSelectors[3] = IMMSAFacet
            .executeFromExecutor
            .selector;
        facets_[4].functionSelectors[4] = IMMSAFacet.accountId.selector;
        facets_[4].functionSelectors[5] = IMMSAFacet
            .supportsExecutionMode
            .selector;
        facets_[4].functionSelectors[6] = IMMSAFacet.supportsModule.selector;
        facets_[4].functionSelectors[7] = IMMSAFacet.isModuleInstalled.selector;
        facets_[4].functionSelectors[8] = IMMSAFacet.mmsaFallback.selector;
        facets_[4].functionSelectors[9] = IMMSAFacet
            .mmsaStaticFallback
            .selector;
        facets_[4].functionSelectors[10] = IMMSAFacet.initMMSA.selector;
        facets_[4].functionSelectors[11] = IMMSAFacet
            .getModulesPaginated
            .selector;
        facets_[4].functionSelectors[12] = IMMSAFacet
            .mmsaIsValidSignature
            .selector;
        facets_[4].functionSelectors[13] = IMMSAFacet.installValidations.selector;

        facets_[5].facetAddress = mscaFacet;
        facets_[5].functionSelectors = new bytes4[](12);
        facets_[5].functionSelectors[0] = IMSCAFacet
            .initializeMSCAModules
            .selector;
        facets_[5].functionSelectors[1] = IMSCAFacet.mscaFallback.selector;
        facets_[5].functionSelectors[2] = IModuleManager.installModule.selector;
        facets_[5].functionSelectors[3] = IModuleManager
            .uninstallModule
            .selector;
        facets_[5].functionSelectors[4] = IModuleExecutor
            .executeFromModule
            .selector;
        facets_[5].functionSelectors[5] = IModuleExecutor
            .executeFromModuleExternal
            .selector;
        facets_[5].functionSelectors[6] = IStandardExecutor.execute.selector;
        facets_[5].functionSelectors[7] = IStandardExecutor
            .executeBatch
            .selector;
        facets_[5].functionSelectors[8] = IAccountLoupe
            .getExecutionFunctionConfig
            .selector;
        facets_[5].functionSelectors[9] = IAccountLoupe
            .getExecutionHooks
            .selector;
        facets_[5].functionSelectors[10] = IAccountLoupe
            .getPreValidationHooks
            .selector;
        facets_[5].functionSelectors[11] = IAccountLoupe
            .getInstalledModules
            .selector;
    }

    /**
     * @notice Gets all the function selectors provided by a facet.
     * @param _facet The facet address.
     * @return facetFunctionSelectors_
     */
    function facetFunctionSelectors(
        address _facet
    ) external view override returns (bytes4[] memory facetFunctionSelectors_) {
        if (_facet == diamondCutFacet) {
            facetFunctionSelectors_[0] = IDiamondCut.diamondCut.selector;
        } else if (_facet == accountFacetV2) {
            facetFunctionSelectors_[0] = BaseAccount.validateUserOp.selector;
            facetFunctionSelectors_[1] = IAccountFacetV2.executeBatch.selector;
            facetFunctionSelectors_[2] = IAccountFacetV2.executeSingle.selector;
            facetFunctionSelectors_[3] = IAccountFacetV2.nonce.selector;
            facetFunctionSelectors_[4] = BaseAccount.entryPoint.selector;
            facetFunctionSelectors_[5] = IAccountFacetV2
                .addValidatorSystem
                .selector;
            facetFunctionSelectors_[6] = IAccountFacetV2
                .removeValidatorSystem
                .selector;
            facetFunctionSelectors_[7] = IAccountFacetV2
                .getValidatorSystem
                .selector;
        } else if (_facet == tokenReceiverFacet) {
            facetFunctionSelectors_[0] = IERC721Receiver
                .onERC721Received
                .selector;
            facetFunctionSelectors_[1] = IERC1155Receiver
                .onERC1155Received
                .selector;
            facetFunctionSelectors_[2] = IERC1155Receiver
                .onERC1155BatchReceived
                .selector;
            facetFunctionSelectors_[3] = IERC777Recipient
                .tokensReceived
                .selector;
            facetFunctionSelectors_[4] = IERC677Receiver
                .onTokenTransfer
                .selector;
        } else if (_facet == diamondLoupeFacet) {
            facetFunctionSelectors_[0] = IDiamondLoupe.facets.selector;
            facetFunctionSelectors_[1] = IDiamondLoupe
                .facetFunctionSelectors
                .selector;
            facetFunctionSelectors_[2] = IDiamondLoupe.facetAddresses.selector;
            facetFunctionSelectors_[3] = IDiamondLoupe.facetAddress.selector;
            facetFunctionSelectors_[4] = IERC165.supportsInterface.selector;
            facetFunctionSelectors_[5] = IStorageLoupe
                .facetsFromStorage
                .selector;
            facetFunctionSelectors_[6] = IStorageLoupe
                .facetFunctionSelectorsFromStorage
                .selector;
            facetFunctionSelectors_[7] = IStorageLoupe
                .facetAddressesFromStorage
                .selector;
            facetFunctionSelectors_[8] = IStorageLoupe
                .facetAddressFromStorage
                .selector;
        } else if (_facet == mmsaFacet) {
            facetFunctionSelectors_[0] = IMMSAFacet.execute.selector;
            facetFunctionSelectors_[1] = IMMSAFacet
                .executeFromExecutor
                .selector;
            facetFunctionSelectors_[2] = IMMSAFacet.mmsaFallback.selector;
            facetFunctionSelectors_[3] = IMMSAFacet.mmsaStaticFallback.selector;
            facetFunctionSelectors_[4] = IMMSAFacet.installModule.selector;
            facetFunctionSelectors_[5] = IMMSAFacet.uninstallModule.selector;
            facetFunctionSelectors_[6] = IMMSAFacet.accountId.selector;
            facetFunctionSelectors_[7] = IMMSAFacet
                .supportsExecutionMode
                .selector;
            facetFunctionSelectors_[8] = IMMSAFacet.supportsModule.selector;
            facetFunctionSelectors_[9] = IMMSAFacet.isModuleInstalled.selector;
            facetFunctionSelectors_[10] = IMMSAFacet.initMMSA.selector;
            facetFunctionSelectors_[11] = IMMSAFacet
                .getModulesPaginated
                .selector;
            facetFunctionSelectors_[12] = IMMSAFacet
                .mmsaIsValidSignature
                .selector;
            facetFunctionSelectors_[13] = IMMSAFacet.installValidations.selector;
        } else if (_facet == mscaFacet) {
            facetFunctionSelectors_[0] = IStandardExecutor.execute.selector;
            facetFunctionSelectors_[1] = IStandardExecutor
                .executeBatch
                .selector;
            facetFunctionSelectors_[2] = IModuleExecutor
                .executeFromModule
                .selector;
            facetFunctionSelectors_[3] = IModuleExecutor
                .executeFromModuleExternal
                .selector;
            facetFunctionSelectors_[4] = IMSCAFacet.mscaFallback.selector;
            facetFunctionSelectors_[5] = IMSCAFacet
                .initializeMSCAModules
                .selector;
            facetFunctionSelectors_[6] = IModuleManager.installModule.selector;
            facetFunctionSelectors_[7] = IModuleManager
                .uninstallModule
                .selector;
            facetFunctionSelectors_[8] = IAccountLoupe
                .getExecutionFunctionConfig
                .selector;
            facetFunctionSelectors_[9] = IAccountLoupe
                .getExecutionHooks
                .selector;
            facetFunctionSelectors_[10] = IAccountLoupe
                .getPreValidationHooks
                .selector;
            facetFunctionSelectors_[11] = IAccountLoupe
                .getInstalledModules
                .selector;
        }
    }

    /**
     * @notice Get all the facet addresses used by a diamond.
     * @return facetAddresses_
     */
    function facetAddresses()
        external
        view
        override
        returns (address[] memory facetAddresses_)
    {
        facetAddresses_[0] = diamondCutFacet;
        facetAddresses_[1] = accountFacetV2;
        facetAddresses_[2] = tokenReceiverFacet;
        facetAddresses_[3] = diamondLoupeFacet;
        facetAddresses_[4] = mmsaFacet;
        facetAddresses_[5] = mscaFacet;
    }

    /** @notice Gets the facet that supports the given selector.
     * @dev If facet is not found return address(0).
     * @param _functionSelector The function selector.
     * @return facetAddress_ The facet address.
     */
    function facetAddress(
        bytes4 _functionSelector
    ) external view override returns (address facetAddress_) {
        if (
            _functionSelector == BaseAccount.validateUserOp.selector ||
            _functionSelector == IAccountFacetV2.executeBatch.selector ||
            _functionSelector == IAccountFacetV2.executeSingle.selector ||
            _functionSelector == IAccountFacetV2.nonce.selector ||
            _functionSelector == BaseAccount.entryPoint.selector ||
            _functionSelector == IAccountFacetV2.addValidatorSystem.selector ||
            _functionSelector ==
            IAccountFacetV2.removeValidatorSystem.selector ||
            _functionSelector == IAccountFacetV2.getValidatorSystem.selector
        ) {
            facetAddress_ = accountFacetV2;
        } else if (
            _functionSelector == IMMSAFacet.execute.selector ||
            _functionSelector == IMMSAFacet.executeFromExecutor.selector ||
            _functionSelector == IMMSAFacet.initMMSA.selector ||
            _functionSelector == IMMSAFacet.mmsaFallback.selector ||
            _functionSelector == IMMSAFacet.installModule.selector ||
            _functionSelector == IMMSAFacet.uninstallModule.selector ||
            _functionSelector == IMMSAFacet.installValidations.selector ||
            _functionSelector == IMMSAFacet.mmsaStaticFallback.selector ||
            _functionSelector == IMMSAFacet.mmsaIsValidSignature.selector ||
            _functionSelector == IMMSAFacet.accountId.selector ||
            _functionSelector == IMMSAFacet.supportsExecutionMode.selector ||
            _functionSelector == IMMSAFacet.supportsModule.selector ||
            _functionSelector == IMMSAFacet.isModuleInstalled.selector ||
            _functionSelector == IMMSAFacet.getModulesPaginated.selector
        ) {
            facetAddress_ = mmsaFacet;
        } else if (
            _functionSelector == IStandardExecutor.execute.selector ||
            _functionSelector == IStandardExecutor.executeBatch.selector ||
            _functionSelector == IModuleExecutor.executeFromModule.selector ||
            _functionSelector ==
            IModuleExecutor.executeFromModuleExternal.selector ||
            _functionSelector == IMSCAFacet.mscaFallback.selector ||
            _functionSelector == IMSCAFacet.initializeMSCAModules.selector ||
            _functionSelector == IModuleManager.installModule.selector ||
            _functionSelector == IModuleManager.uninstallModule.selector ||
            _functionSelector ==
            IAccountLoupe.getExecutionFunctionConfig.selector ||
            _functionSelector == IAccountLoupe.getExecutionHooks.selector ||
            _functionSelector == IAccountLoupe.getPreValidationHooks.selector ||
            _functionSelector == IAccountLoupe.getInstalledModules.selector
        ) {
            facetAddress_ = mscaFacet;
        } else if (_functionSelector == IDiamondCut.diamondCut.selector) {
            facetAddress_ = diamondCutFacet;
        } else if (
            _functionSelector == IERC721Receiver.onERC721Received.selector ||
            _functionSelector == IERC1155Receiver.onERC1155Received.selector ||
            _functionSelector ==
            IERC1155Receiver.onERC1155BatchReceived.selector ||
            _functionSelector == IERC777Recipient.tokensReceived.selector ||
            _functionSelector == IERC677Receiver.onTokenTransfer.selector
        ) {
            facetAddress_ = tokenReceiverFacet;
        } else if (
            _functionSelector == IDiamondLoupe.facets.selector ||
            _functionSelector ==
            IDiamondLoupe.facetFunctionSelectors.selector ||
            _functionSelector == IDiamondLoupe.facetAddresses.selector ||
            _functionSelector == IDiamondLoupe.facetAddress.selector ||
            _functionSelector == IERC165.supportsInterface.selector ||
            _functionSelector == IStorageLoupe.facetsFromStorage.selector ||
            _functionSelector ==
            IStorageLoupe.facetFunctionSelectorsFromStorage.selector ||
            _functionSelector ==
            IStorageLoupe.facetAddressesFromStorage.selector ||
            _functionSelector == IStorageLoupe.facetAddressFromStorage.selector
        ) {
            facetAddress_ = diamondLoupeFacet;
        }
    }
}
