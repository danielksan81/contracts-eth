// Copyright (c) 2019 The Perun Authors. All rights reserved.
// This file is part of go-perun. Use of this source code is governed by a
// MIT-style license that can be found in the LICENSE file.

pragma solidity 0.5.11;
pragma experimental ABIEncoderV2;

import "./PerunTypes.sol";
import "./ValidTransition.sol";
import 'openzeppelin-solidity/contracts/math/SafeMath.sol';

contract PaymentApp is ValidTransitioner {
    
    using SafeMath for uint256;

	function validTransition(
	    PerunTypes.Params calldata params,
		PerunTypes.State calldata from,
		PerunTypes.State calldata to) 
	external pure returns (bool)
	{
	    require(from.channelID == to.channelID);
	    require(from.appData.length == 0);
	    require(to.appData.length == 0);
	    require(!from.isFinal);
	    
        require(validPayment(from.outcome, to.outcome, from.moverIdx));
	}
	
	function validPayment(
		PerunTypes.Allocation memory oldAlloc,
		PerunTypes.Allocation memory newAlloc,
		uint256 sender)
	internal pure returns (bool)
	{
		assert(oldAlloc.assets.length == newAlloc.assets.length);
		for (uint256 i = 0; i < newAlloc.assets.length; i++) {
			require(oldAlloc.assets[i] == newAlloc.assets[i]);
			uint256 sumOld = 0;
			uint256 sumNew = 0;
			assert(oldAlloc.balances[i].length == newAlloc.balances[i].length);
			for (uint256 k = 0; k < newAlloc.balances[i].length; k++) {
			    // only sender can send money
			    if(sender == k)
			        require(newAlloc.balances[i][k] <= oldAlloc.balances[i][k]);
			    else 
			        require(newAlloc.balances[i][k] >= oldAlloc.balances[i][k]);
			    // calculate sum
				sumOld = sumOld.add(oldAlloc.balances[i][k]);
				sumNew = sumNew.add(newAlloc.balances[i][k]);
			}
			require(sumOld == sumNew, 'Sum of balances for an asset must be equal');
		}
		// SubAlloc's currently not implemented
		require(oldAlloc.locked.length == 0, 'SubAlloc currently not implemented');
		require(newAlloc.locked.length == 0, 'SubAlloc currently not implemented');
		return true;
	}
}