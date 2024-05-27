// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import {IERC777Recipient} from "@openzeppelin/contracts/token/ERC777/IERC777Recipient.sol";
import {IERC165} from "../../interfaces/ERC/IERC165.sol";
import {IERC1271} from "../../interfaces/ERC/IERC1271.sol";
import {IERC677Receiver} from "../../interfaces/ERC/IERC677Receiver.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {LibDiamond} from "../../libraries/LibDiamond.sol";
import {LibLoupe} from "../../libraries/LibLoupe.sol";
import {LibUtils} from "../../libraries/LibUtils.sol";
import {IDiamondCut} from "../../facets/base/interfaces/IDiamondCut.sol";
import {IStorageLoupe} from "./interfaces/IStorageLoupe.sol";
import {IDiamondLoupe} from "./interfaces/IDiamondLoupe.sol";

/**
 * @title DiamondLoupe Facet
 * @dev DiamondLoupe contract compatible with EIP-2535
 * @author David Yongjun Kim (@Powerstream3604)
 */
contract DiamondLoupeFacet is IDiamondLoupe, IStorageLoupe, IERC165 {
    // Diamond Loupe Functions
    ////////////////////////////////////////////////////////////////////
    /// These functions are expected to be called frequently by tools off-chain.

    /**
     * @notice Gets all facets and their selectors.
     * @dev Barz uses a special architecture called default fallback handler. Default Fallback handler is used as a middleware
     *      that holds the mapping of facet function selector and facet address that Barz uses. This helps Barz to reduce
     *      significant amount of gas during the initialization process.
     *      Hence, this method aggregates both the facet information from DefaulFallbackHandler and in diamond storage and shows the data to users.
     * @return facets_ Facet
     */
    function facets() public view override returns (Facet[] memory facets_) {
        Facet[] memory defaultFacet = LibDiamond
            .diamondStorage()
            .defaultFallbackHandler
            .facets();
        Facet[] memory _facets = LibLoupe.facets();
        uint256 numFacets = _facets.length;
        bytes4[] memory keys;
        address[] memory values;
        for (uint256 i; i < numFacets; ) {
            uint256 selectorsLength = _facets[i].functionSelectors.length;
            for (uint256 j; j < selectorsLength; ) {
                (keys, values) = LibUtils.setValue(
                    keys,
                    values,
                    _facets[i].functionSelectors[j],
                    _facets[i].facetAddress
                );
                unchecked {
                    ++j;
                }
            }
            unchecked {
                ++i;
            }
        }
        {
            bool iIncrement;
            for (uint256 i; i < defaultFacet.length; ) {
                bool jIncrement;
                for (
                    uint256 j;
                    j < defaultFacet[i].functionSelectors.length;

                ) {
                    if (
                        LibUtils.getValue(
                            keys,
                            values,
                            defaultFacet[i].functionSelectors[j]
                        ) != address(0)
                    ) {
                        if (defaultFacet[i].functionSelectors.length == 1) {
                            defaultFacet = LibUtils.removeFacetElement(
                                defaultFacet,
                                i
                            );
                            iIncrement = true;
                            break;
                        }
                        defaultFacet[i].functionSelectors = LibUtils
                            .removeElement(
                                defaultFacet[i].functionSelectors,
                                j
                            );
                        jIncrement = true;
                    }
                    if (!jIncrement) {
                        unchecked {
                            ++j;
                        }
                    } else {
                        jIncrement = false;
                    }
                }
                if (!iIncrement) {
                    unchecked {
                        ++i;
                    }
                } else {
                    iIncrement = false;
                }
            }
        }
        {
            uint256 facetLength = numFacets + defaultFacet.length;
            facets_ = new Facet[](facetLength);
            uint256 defaultFacetIndex;
            for (uint256 i; i < facetLength; ) {
                if (i < numFacets) {
                    facets_[i] = _facets[i];
                    bool jIncrementor;
                    for (uint256 j; j < defaultFacet.length; ) {
                        if (
                            facets_[i].facetAddress ==
                            defaultFacet[j].facetAddress
                        ) {
                            facets_[i].functionSelectors = LibUtils.mergeArrays(
                                _facets[i].functionSelectors,
                                defaultFacet[j].functionSelectors
                            );
                            defaultFacet = LibUtils.removeFacetElement(
                                defaultFacet,
                                j
                            );
                            jIncrementor = true;
                            {
                                facets_ = LibUtils.removeFacetElement(
                                    facets_,
                                    facets_.length - 1
                                );
                            }
                            --facetLength;
                        }
                        if (!jIncrementor) {
                            unchecked {
                                ++j;
                            }
                        } else {
                            jIncrementor = false;
                        }
                    }
                } else {
                    facets_[i] = defaultFacet[defaultFacetIndex];
                    ++defaultFacetIndex;
                }
                unchecked {
                    ++i;
                }
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
        Facet[] memory facet = facets();
        uint256 facetLength = facet.length;
        for (uint256 i; i < facetLength; ) {
            if (facet[i].facetAddress == _facet)
                return facet[i].functionSelectors;
            unchecked {
                ++i;
            }
        }
        return facetFunctionSelectors_;
    }

    /**
     * @notice Get all the facet addresses used by Barz.
     * @return facetAddresses_
     */
    function facetAddresses()
        external
        view
        override
        returns (address[] memory facetAddresses_)
    {
        Facet[] memory facet = facets();
        uint256 facetLength = facet.length;
        facetAddresses_ = new address[](facetLength);
        for (uint256 i; i < facetLength; ) {
            facetAddresses_[i] = facet[i].facetAddress;
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Gets the facet that supports the given selector.
     * @dev If facet is not found return address(0).
     * @param _functionSelector The function selector.
     * @return facetAddress_ The facet address.
     */
    function facetAddress(
        bytes4 _functionSelector
    ) external view override returns (address facetAddress_) {
        LibDiamond.DiamondStorage storage ds = LibDiamond.diamondStorage();

        facetAddress_ = address(bytes20(ds.facets[_functionSelector]));
        if (facetAddress_ == address(0)) {
            facetAddress_ = IDiamondLoupe(ds.defaultFallbackHandler)
                .facetAddress(_functionSelector);
        }
    }

    /**
     * @notice SupportInterface to be compatible with EIP 165
     * @param _interfaceId Interface ID for detecting the interface
     * @return isSupported Bool value showing if the standard is supported in the contract
     */
    function supportsInterface(
        bytes4 _interfaceId
    ) external view override returns (bool isSupported) {
        isSupported =
            _interfaceId == type(IERC165).interfaceId ||
            _interfaceId == IDiamondCut.diamondCut.selector ||
            _interfaceId == type(IDiamondLoupe).interfaceId ||
            _interfaceId == type(IERC1155Receiver).interfaceId ||
            _interfaceId == type(IERC721Receiver).interfaceId ||
            _interfaceId == type(IERC777Recipient).interfaceId ||
            _interfaceId == IERC1271.isValidSignature.selector ||
            _interfaceId == type(IERC677Receiver).interfaceId ||
            LibDiamond.diamondStorage().supportedInterfaces[_interfaceId];
    }

    /**
     * @notice Returns the facet from the diamond storage. This excludes the facets from the default fallback handler
     * @return facets_ Facet information attached directly to diamond storage
     */
    function facetsFromStorage()
        external
        view
        override
        returns (Facet[] memory facets_)
    {
        facets_ = LibLoupe.facets();
    }

    /**
     * @notice Returns the facet address attached to the given function selector. This excludes the facets from the default fallback handler
     * @param _functionSelector Function selector to fetch the facet address from diamond storage
     * @return facetAddress_ Facet address mapped with the function selector
     */
    function facetAddressFromStorage(
        bytes4 _functionSelector
    ) external view override returns (address facetAddress_) {
        facetAddress_ = LibLoupe.facetAddress(_functionSelector);
    }

    /**
     * @notice Returns all facet addresses attached directly to diamond storage. This excludes the facets from the default fallback handler
     * @return facetAddresses_ All facet addresses attached directly to diamond storage
     */
    function facetAddressesFromStorage()
        external
        view
        override
        returns (address[] memory facetAddresses_)
    {
        facetAddresses_ = LibLoupe.facetAddresses();
    }

    /**
     * @notice Returns function selectors of given facet address attached directly to diamond storage. This excludes the facets from the default fallback handler
     * @param _facet Facet address to fetch the facet function selectors from diamond storage
     * @return facetFunctionSelectors_ Facet function selectors of the given facet address
     */
    function facetFunctionSelectorsFromStorage(
        address _facet
    ) external view override returns (bytes4[] memory facetFunctionSelectors_) {
        facetFunctionSelectors_ = LibLoupe.facetFunctionSelectors(_facet);
    }
}
