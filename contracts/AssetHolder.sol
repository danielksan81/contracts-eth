// Copyright (c) 2019 The Perun Authors. All rights reserved.
// This file is part of go-perun. Use of this source code is governed by a
// MIT-style license that can be found in the LICENSE file.

pragma solidity 0.5.11;
pragma experimental ABIEncoderV2;
import 'openzeppelin-solidity/contracts/math/SafeMath.sol';
import 'openzeppelin-solidity/contracts/cryptography/ECDSA.sol';

// AssetHolder is an abstract contract that holds the funds for a Perun state channel.
contract AssetHolder {

    using SafeMath for uint256;

	// Mapping H(channelID||participant) => money
	mapping(bytes32 => uint256) public holdings;
	// Mapping channelID => settled
	mapping(bytes32 => bool) public settled;

	address public Adjudicator;
	// Only the adjudicator can call this method.
	modifier onlyAdjudicator {
		require(msg.sender == Adjudicator,
			'This method can only be called from the adjudicator contract');
		_;
	}

	// SetOutcome is called by the Adjudicator to set the final outcome of a channel.
	function setOutcome(bytes32 channelID, address[] calldata parts, uint256[] calldata newBals) external onlyAdjudicator {
		assert(parts.length == newBals.length);
		assert(settled[channelID] == false);

		uint256 sumHeld = 0;
		uint256 sumOutcome = 0;

		bytes32[] memory calculatedIDs = new bytes32[](parts.length);
		for (uint256 i = 0; i < parts.length; i++) {
			bytes32 id = keccak256(abi.encodePacked(channelID, parts[i]));
			// Save calculated ids to save gas.
			calculatedIDs[i] = id;
			// Compute old balances.
			sumHeld = sumHeld.add(holdings[id]);
			// Compute new balances.
			sumOutcome = sumOutcome.add(newBals[i]);
		}

		// We allow overfunding channels, who overfunds loses their funds.
		if (sumHeld >= sumOutcome) {
			for (uint256 i = 0; i < parts.length; i++) {
				holdings[calculatedIDs[i]] = newBals[i];
			}
		}
		settled[channelID] = true;
		emit OutcomeSet(channelID);
	}

	// VerifySignature verifies whether a piece of data was signed correctly.
	function verifySignature(bytes memory data, bytes memory signature, address signer) internal pure returns (bool) {
	    bytes memory prefix = '\x19Ethereum Signed Message:\n32';
        bytes32 h = keccak256(data);
        bytes32 prefixedHash = keccak256(abi.encodePacked(prefix, h));
	    return ECDSA.recover(prefixedHash, signature) == signer;
	}


	// WithdrawalAuthorization authorizes a on-chain public key to withdraw
	// from an ephemeral key.
	struct WithdrawalAuth {
        bytes32 channelID; // ChannelID that should be spend.
        address participant; // The account used to sign commitment transitions.
        address payable receiver; // The receiver of the authorization.
        uint256 amount; // The amount that can be withdrawn.
    }

    function deposit(bytes32 participantID, uint256 amount) public payable;
    function withdraw(bytes memory authorization, bytes memory signature) public;

	event OutcomeSet(
		bytes32 indexed channelID
	);

	event Deposited(
		bytes32 indexed participantID
	);
}
