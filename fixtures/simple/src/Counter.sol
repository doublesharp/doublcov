// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract Counter {
    uint256 public number;

    function setNumber(uint256 newNumber) public {
        if (newNumber > 10) {
            number = newNumber;
        } else {
            number = 1;
        }
    }

    function increment() public {
        number++;
    }
}
