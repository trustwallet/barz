// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

library LibVerification {
    // keccak256(
    //     "EIP712Domain(uint256 chainId,address verifyingContract)"
    // );
    bytes32 internal constant DOMAIN_SEPARATOR_TYPEHASH = 0x47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218;
    // keccak256("BarzMessage(bytes message)")
    bytes32 internal constant BARZ_MSG_TYPEHASH = 0xb1bcb804a4a3a1af3ee7920d949bdfd417ea1b736c3552c8d6563a229a619100;

    function domainSeparator() internal view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_SEPARATOR_TYPEHASH, block.chainid, address(this)));
    }

    function encodeMessageData(bytes memory message) internal view returns (bytes memory) {
        bytes32 messageHash = keccak256(abi.encode(BARZ_MSG_TYPEHASH, keccak256(message)));
        return abi.encodePacked("\x19\x01", domainSeparator(), messageHash);
    }

    function getMessageHash(bytes32 message) internal view returns (bytes32) {
        return keccak256(encodeMessageData(abi.encode(message)));
    }

}