// Copyright (c) 2019 The Perun Authors. All rights reserved.
// This file is part of go-perun. Use of this source code is governed by a
// MIT-style license that can be found in the LICENSE file.

pragma solidity 0.5.11;
pragma experimental ABIEncoderV2;
import './AssetHolder.sol';
import 'openzeppelin-solidity/contracts/math/SafeMath.sol';

contract AssetHolderETH is AssetHolder {

	using SafeMath for uint256;

	constructor(address _adjudicator) public {
		Adjudicator = _adjudicator;
	}

	function deposit(bytes32 participantID, uint256 amount) public payable {
		require(msg.value == amount, 'Insufficent ETH for deposit');
		holdings[participantID] = holdings[participantID].add(amount);
		emit Deposited(participantID);
	}

	function withdraw(bytes memory authorization, bytes memory signature) public {
		WithdrawalAuth memory auth = abi.decode(
			authorization,
			(WithdrawalAuth)
		);
		require(settled[auth.channelID], 'channel not settled');
		require(verifySignature(authorization, signature, auth.participant), 'signature verification failed');
		bytes32 id = keccak256(abi.encodePacked(auth.channelID, auth.participant));
		require(holdings[id] >= auth.amount, 'insufficient ETH for withdraw');
		// Decrease holdings, then transfer the money.
		holdings[id] = holdings[id].sub(auth.amount);
		auth.receiver.transfer(auth.amount);
	}
}