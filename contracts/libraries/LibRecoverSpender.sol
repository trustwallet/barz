// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.21;

/**
 * @title RecoverSpender
 * @dev Library to determine the action and spender of calldata
 * @author Ruslan Serebriakov (@rsrbk)
 */
library LibRecoverSpender {
    // ERC20, ERC721 & ERC1155 transfers & approvals
    bytes4 private constant ERC20_TRANSFER =
        bytes4(keccak256("transfer(address,uint256)"));
    bytes4 private constant ERC20_APPROVE =
        bytes4(keccak256("approve(address,uint256)"));
    bytes4 private constant ERC20_INCREASE_ALLOWANCE =
        bytes4(keccak256("increaseAllowance(address,uint256)"));
    bytes4 private constant ERC20_DECREASE_ALLOWANCE =
        bytes4(keccak256("decreaseAllowance(address,uint256)"));
    bytes4 private constant ERC721_SET_APPROVAL_FOR_ALL =
        bytes4(keccak256("setApprovalForAll(address,bool)"));
    bytes4 private constant ERC721_TRANSFER_FROM =
        bytes4(keccak256("transferFrom(address,address,uint256)"));
    bytes4 private constant ERC721_SAFE_TRANSFER_FROM =
        bytes4(keccak256("safeTransferFrom(address,address,uint256)"));
    bytes4 private constant ERC721_SAFE_TRANSFER_FROM_BYTES =
        bytes4(keccak256("safeTransferFrom(address,address,uint256,bytes)"));
    bytes4 private constant ERC1155_SAFE_TRANSFER_FROM =
        bytes4(
            keccak256("safeTransferFrom(address,address,uint256,uint256,bytes)")
        );
    bytes4 private constant ERC1155_SAFE_BATCH_TRANSFER_FROM =
        bytes4(
            keccak256(
                "safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)"
            )
        );

    /**
     * @notice Helper method to recover the spender from a contract call.
     * The method returns the contract unless the call is to a standard method of a ERC20/ERC721/ERC1155 token
     * in which case the spender is recovered from the data.
     * @param _to The target contract.
     * @param _data The data payload.
     */
    function _recover(
        address _to,
        bytes memory _data
    ) internal pure returns (address spender) {
        if (_data.length >= 68) {
            bytes4 methodId;
            // solhint-disable-next-line no-inline-assembly
            assembly {
                methodId := mload(add(_data, 0x20))
            }
            if (
                methodId == ERC20_TRANSFER ||
                methodId == ERC20_APPROVE ||
                methodId == ERC20_INCREASE_ALLOWANCE ||
                methodId == ERC20_DECREASE_ALLOWANCE ||
                methodId == ERC721_SET_APPROVAL_FOR_ALL
            ) {
                // solhint-disable-next-line no-inline-assembly
                assembly {
                    spender := mload(add(_data, 0x24))
                }
                return spender;
            }
            if (
                methodId == ERC721_TRANSFER_FROM ||
                methodId == ERC721_SAFE_TRANSFER_FROM ||
                methodId == ERC721_SAFE_TRANSFER_FROM_BYTES ||
                methodId == ERC1155_SAFE_TRANSFER_FROM ||
                methodId == ERC1155_SAFE_BATCH_TRANSFER_FROM
            ) {
                // solhint-disable-next-line no-inline-assembly
                assembly {
                    spender := mload(add(_data, 0x44))
                }
                return spender;
            }
        }

        spender = _to;
    }
}
