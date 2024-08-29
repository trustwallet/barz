// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

contract TestCounter {
    int private count = 0;

    event CounterIncremented(int count);
    event CounterDecremented(int count);

    function incrementCounter() public {
        count += 1;
        emit CounterIncremented(count);
    }

    function decrementCounter() public {
        count -= 1;
        emit CounterIncremented(count);
    }

    function getCount() public view returns (int) {
        return count;
    }

    function incrementWithRevert() public {
        count += 1;
        revert("CounterReverted");
    }
}
