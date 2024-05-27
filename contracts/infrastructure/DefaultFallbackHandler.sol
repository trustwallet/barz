// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {IERC777Recipient} from "@openzeppelin/contracts/token/ERC777/IERC777Recipient.sol";
import {BaseAccount} from "../aa-4337/core/BaseAccount.sol";
import {DefaultLibDiamond} from "../libraries/DefaultLibDiamond.sol";
import {IDiamondCut} from "../facets/base/interfaces/IDiamondCut.sol";
import {IAccountFacet} from "../facets/interfaces/IAccountFacet.sol";
import {IStorageLoupe} from "../facets/base/interfaces/IStorageLoupe.sol";
import {IDiamondLoupe} from "../facets/base/interfaces/IDiamondLoupe.sol";
import {IERC677Receiver} from "../interfaces/ERC/IERC677Receiver.sol";
import {IERC165} from "../interfaces/ERC/IERC165.sol";

/**
 * @title DefaultFallbackHandler
 * @dev A default fallback handler for Barz
 * @author David Yongjun Kim (@Powerstream3604)
 */
contract DefaultFallbackHandler is IDiamondLoupe {
    /**
     * @notice Sets the middleware diamond for Barz wallet as a fallback handler
     * @dev This contract is also a diamond that holds the default facets to reduce gas cost for wallet activation.
     *      Within the constructor this conducts diamond cut to initially setup the diamond. This is a non-upgradeable contract
     * @param _diamondCutFacet Address if diamond cut facet
     * @param _accountFacet Address account facet
     * @param _tokenReceiverFacet Address of token receiver facet
     * @param _diamondLoupeFacet Address of diamond loupe facet
     */
    constructor(
        address _diamondCutFacet,
        address _accountFacet,
        address _tokenReceiverFacet,
        address _diamondLoupeFacet
    ) payable {
        IDiamondCut.FacetCut[] memory cut = new IDiamondCut.FacetCut[](4);
        bytes4[] memory functionSelectors = new bytes4[](1);
        functionSelectors[0] = IDiamondCut.diamondCut.selector;

        bytes4[] memory accountFunctionSelectors = new bytes4[](5);
        accountFunctionSelectors[0] = IAccountFacet.execute.selector;
        accountFunctionSelectors[1] = IAccountFacet.executeBatch.selector;
        accountFunctionSelectors[2] = BaseAccount.validateUserOp.selector;
        accountFunctionSelectors[3] = BaseAccount.getNonce.selector;
        accountFunctionSelectors[4] = BaseAccount.entryPoint.selector;

        bytes4[] memory receiverFacetSelectors = new bytes4[](5);
        receiverFacetSelectors[0] = IERC721Receiver.onERC721Received.selector;
        receiverFacetSelectors[1] = IERC1155Receiver.onERC1155Received.selector;
        receiverFacetSelectors[2] = IERC1155Receiver
            .onERC1155BatchReceived
            .selector;
        receiverFacetSelectors[3] = IERC777Recipient.tokensReceived.selector;
        receiverFacetSelectors[4] = IERC677Receiver.onTokenTransfer.selector;

        bytes4[] memory loupeFacetSelectors = new bytes4[](9);
        loupeFacetSelectors[0] = IDiamondLoupe.facets.selector;
        loupeFacetSelectors[1] = IDiamondLoupe.facetFunctionSelectors.selector;
        loupeFacetSelectors[2] = IDiamondLoupe.facetAddresses.selector;
        loupeFacetSelectors[3] = IDiamondLoupe.facetAddress.selector;
        loupeFacetSelectors[4] = IERC165.supportsInterface.selector;
        loupeFacetSelectors[5] = IStorageLoupe.facetsFromStorage.selector;
        loupeFacetSelectors[6] = IStorageLoupe
            .facetFunctionSelectorsFromStorage
            .selector;
        loupeFacetSelectors[7] = IStorageLoupe
            .facetAddressesFromStorage
            .selector;
        loupeFacetSelectors[8] = IStorageLoupe.facetAddressFromStorage.selector;

        {
            cut[0] = IDiamondCut.FacetCut({
                facetAddress: _diamondCutFacet,
                action: IDiamondCut.FacetCutAction.Add,
                functionSelectors: functionSelectors
            });
            cut[1] = IDiamondCut.FacetCut({
                facetAddress: _accountFacet,
                action: IDiamondCut.FacetCutAction.Add,
                functionSelectors: accountFunctionSelectors
            });
            cut[2] = IDiamondCut.FacetCut({
                facetAddress: _tokenReceiverFacet,
                action: IDiamondCut.FacetCutAction.Add,
                functionSelectors: receiverFacetSelectors
            });
            cut[3] = IDiamondCut.FacetCut({
                facetAddress: _diamondLoupeFacet,
                action: IDiamondCut.FacetCutAction.Add,
                functionSelectors: loupeFacetSelectors
            });

            DefaultLibDiamond.diamondCut(cut, address(0), "");
        }
    }

    /**
     * @notice Returns the facet information of call facets registered to this diamond.
     * @return facets_ The facet struct array including all facet information
     */
    function facets() external view override returns (Facet[] memory facets_) {
        DefaultLibDiamond.DiamondStorage storage ds = DefaultLibDiamond
            .diamondStorage();
        uint256 numFacets = ds.facetAddresses.length;
        facets_ = new Facet[](numFacets);
        for (uint256 i; i < numFacets; ) {
            address facetAddress_ = ds.facetAddresses[i];
            facets_[i].facetAddress = facetAddress_;
            facets_[i].functionSelectors = ds
                .facetFunctionSelectors[facetAddress_]
                .functionSelectors;
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Gets all the function selectors provided by a facet.
     * @param _facet The facet address.
     * @return facetFunctionSelectors_
     */
    function facetFunctionSelectors(
        address _facet
    ) external view override returns (bytes4[] memory facetFunctionSelectors_) {
        facetFunctionSelectors_ = DefaultLibDiamond
            .diamondStorage()
            .facetFunctionSelectors[_facet]
            .functionSelectors;
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
        facetAddresses_ = DefaultLibDiamond.diamondStorage().facetAddresses;
    }

    /** @notice Gets the facet that supports the given selector.
     * @dev If facet is not found return address(0).
     * @param _functionSelector The function selector.
     * @return facetAddress_ The facet address.
     */
    function facetAddress(
        bytes4 _functionSelector
    ) external view override returns (address facetAddress_) {
        facetAddress_ = DefaultLibDiamond
            .diamondStorage()
            .selectorToFacetAndPosition[_functionSelector]
            .facetAddress;
    }
}
