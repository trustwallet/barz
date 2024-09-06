// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.26;

library LibFacetGuard {
    bytes32 constant FACET_GUARD = keccak256("Barz.FACET.GUARD");

    function enforceFacetValidation() internal view {
        bytes32 facetGuard = FACET_GUARD;
        assembly {
            if iszero(tload(facetGuard)) {
                revert(0, 0)
            }
        }
    }

    function allowFacetValidation() internal {
        bytes32 facetGuard = FACET_GUARD;
        assembly {
            if iszero(eq(tload(facetGuard), 0)) {
                revert(0, 0)
            }
            tstore(facetGuard, 1)
        }
    }

    function closeFacetValidation() internal {
        bytes32 facetGuard = FACET_GUARD;
        assembly {
            if iszero(eq(tload(facetGuard), 0)) {
                tstore(facetGuard, 0)
            }
        }
    }
}
