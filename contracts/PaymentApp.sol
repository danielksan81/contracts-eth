// Copyright (c) 2019 Chair of Applied Cryptography, Technische Universität
// Darmstadt, Germany. All rights reserved. This file is part of go-perun. Use
// of this source code is governed by a MIT-style license that can be found in
// the LICENSE file.

pragma solidity ^0.5.13;
pragma experimental ABIEncoderV2;

import "./Channel.sol";
import "./App.sol";
import "./SafeMath.sol";

/**
 * @title A PaymentApp to be used in a state channel.
 * @author The Perun Authors
 * @dev The PaymentApp implements the validTransition function of the App interface.
 */
contract PaymentApp is App {

    using SafeMath for uint256;

    /**
     * @notice ValidTransition checks if there exists a valid transition between two states.
     * @dev ValidTransition should revert on an invalid transition.
     * @param params The parameters of the channel.
     * @param from The current state.
     * @param to The proposed next state.
     * @param actorIdx Index of the actor who signed this transition.
     */
    function validTransition(
        Channel.Params calldata params,
        Channel.State calldata from,
        Channel.State calldata to,
        uint256 actorIdx)
    external pure
    {
        require(from.appData.length == 0, "appData not needed in PaymentApp");
        require(to.appData.length == 0, "appData not needed in PaymentApp");
        // SubAllocs currently not implemented
        require(from.outcome.locked.length == 0, "SubAlloc currently not implemented");
        require(to.outcome.locked.length == 0, "SubAlloc currently not implemented");

        for (uint256 i = 0; i < from.outcome.balances.length; i++) {
            for (uint256 k = 0; k < from.outcome.balances[i].length; k++) {
                // only sender can send money
                if(k == actorIdx)
                    require(to.outcome.balances[i][k] <= from.outcome.balances[i][k], "only sender can send money");
                else
                    require(to.outcome.balances[i][k] >= from.outcome.balances[i][k], "only non-sender can receive money");
            }
        }
    }
}
