// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IERC7484 {
    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*          Check with Registry internal attesters            */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    function check(address module) external view;

    function checkForAccount(
        address smartAccount,
        address module
    ) external view;

    function check(address module, uint256 moduleType) external view;

    function checkForAccount(
        address smartAccount,
        address module,
        uint256 moduleType
    ) external view;

    /**
     * Allows Smart Accounts - the end users of the registry - to appoint
     * one or many attesters as trusted.
     * @dev this function reverts, if address(0), or duplicates are provided in attesters[]
     *
     * @param threshold The minimum number of attestations required for a module
     *                  to be considered secure.
     * @param attesters The addresses of the attesters to be trusted.
     */
    function trustAttesters(
        uint8 threshold,
        address[] calldata attesters
    ) external;

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*              Check with external attester(s)               */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    function check(
        address module,
        address[] calldata attesters,
        uint256 threshold
    ) external view;

    function check(
        address module,
        uint256 moduleType,
        address[] calldata attesters,
        uint256 threshold
    ) external view;
}
