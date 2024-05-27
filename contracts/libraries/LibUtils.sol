// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

import {IDiamondLoupe} from "../facets/base/interfaces/IDiamondLoupe.sol";

library LibUtils {
    // Internal utility functions
    function mergeArrays(
        bytes4[] memory _array1,
        bytes4[] memory _array2
    ) internal pure returns (bytes4[] memory) {
        uint256 length1 = _array1.length;
        uint256 length2 = _array2.length;
        bytes4[] memory mergedArray = new bytes4[](length1 + length2);

        for (uint256 i; i < length1; ) {
            mergedArray[i] = _array1[i];
            unchecked {
                ++i;
            }
        }

        for (uint256 i; i < length2; ) {
            mergedArray[length1 + i] = _array2[i];
            unchecked {
                ++i;
            }
        }

        return mergedArray;
    }

    function removeFacetElement(
        IDiamondLoupe.Facet[] memory _facets,
        uint256 _index
    ) internal pure returns (IDiamondLoupe.Facet[] memory) {
        require(_index < _facets.length, "Invalid index");
        require(_facets.length != 0, "Invalid array");

        // Create a new array with a length of `_facets.length - 1`
        IDiamondLoupe.Facet[] memory newArray = new IDiamondLoupe.Facet[](
            _facets.length - 1
        );
        uint256 newArrayLength = newArray.length;
        // Iterate over the original array, skipping the element at the specified `index`
        for (uint256 i; i < newArrayLength; ) {
            if (i < _index) {
                newArray[i] = _facets[i];
            } else {
                newArray[i] = _facets[i + 1];
            }
            unchecked {
                ++i;
            }
        }

        return newArray;
    }

    function removeElement(
        bytes4[] memory _array,
        uint256 _index
    ) internal pure returns (bytes4[] memory) {
        require(_index < _array.length, "Invalid index");
        require(_array.length != 0, "Invalid array");

        bytes4[] memory newArray = new bytes4[](_array.length - 1);
        uint256 newArrayLength = newArray.length;
        for (uint256 i; i < newArrayLength; ) {
            if (i < _index) {
                newArray[i] = _array[i];
            } else {
                newArray[i] = _array[i + 1];
            }
            unchecked {
                ++i;
            }
        }

        return newArray;
    }

    function setValue(
        bytes4[] memory _keys,
        address[] memory _values,
        bytes4 _key,
        address _value
    ) internal pure returns (bytes4[] memory, address[] memory) {
        uint256 index = findIndex(_keys, _key);
        uint256 keysLength = _keys.length;
        if (index < keysLength) {
            _values[index] = _value;
        } else {
            // Create new storage arrays
            bytes4[] memory newKeys = new bytes4[](keysLength + 1);
            address[] memory newValues = new address[](_values.length + 1);

            // Copy values to the new storage arrays
            for (uint256 i; i < keysLength; ) {
                newKeys[i] = _keys[i];
                newValues[i] = _values[i];

                unchecked {
                    ++i;
                }
            }

            // Add the new key-value pair
            newKeys[keysLength] = _key;
            newValues[_values.length] = _value;

            return (newKeys, newValues);
        }

        // If the key already exists, return the original arrays
        return (_keys, _values);
    }

    function getValue(
        bytes4[] memory _keys,
        address[] memory _values,
        bytes4 _key
    ) internal pure returns (address) {
        uint256 index = findIndex(_keys, _key);
        if (index >= _keys.length) return address(0);

        return _values[index];
    }

    function findIndex(
        bytes4[] memory _keys,
        bytes4 _key
    ) internal pure returns (uint256) {
        uint256 keysLength = _keys.length;
        for (uint256 i; i < keysLength; ) {
            if (_keys[i] == _key) {
                return i;
            }
            unchecked {
                ++i;
            }
        }
        return keysLength;
    }
}
