// Copyright (c) 2019 The Perun Authors. All rights reserved.
// This file is part of go-perun. Use of this source code is governed by a
// MIT-style license that can be found in the LICENSE file.

pragma solidity ^0.5.13;
pragma experimental ABIEncoderV2;
import "./AssetHolder.sol";
import "./SafeMath.sol";
import "./Sig.sol";
import "./IERC20.sol";

contract AssetHolderERC20 is AssetHolder {

	using SafeMath for uint256;

	IERC20 token;

	constructor(address _adjudicator, address tokenAddr) public {
		adjudicator = _adjudicator;
		token = IERC20(tokenAddr);
	}

	// Deposit is used to deposit money into a channel
	// The parameter fundingID = H(channelID||address)
	// This hides both the channelID as well as the participant address until a channel is settled.
	function deposit(bytes32 fundingID, uint256 amount) external payable {
		require(msg.value == 0, "message value should be 0 for token deposit");
		require(token.transferFrom(msg.sender, address(this), amount), "transferFrom failed");
		holdings[fundingID] = holdings[fundingID].add(amount);
		emit Deposited(fundingID, amount);
	}

	function withdraw(WithdrawalAuth memory authorization, bytes memory signature) public {
		require(settled[authorization.channelID], "channel not settled");
		require(Sig.verify(abi.encode(authorization), signature, authorization.participant), "signature verification failed");
		bytes32 id = calcFundingID(authorization.channelID, authorization.participant);
		require(holdings[id] >= authorization.amount, "insufficient ETH for withdrawal");
		// Decrease holdings, then transfer the money.
		holdings[id] = holdings[id].sub(authorization.amount);
		token.transfer(authorization.receiver, authorization.amount);
	}
}
