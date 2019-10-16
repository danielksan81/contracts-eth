// Copyright (c) 2019 The Perun Authors. All rights reserved.
// This file is part of go-perun. Use of this source code is governed by a
// MIT-style license that can be found in the LICENSE file.

pragma solidity 0.5.11;
pragma experimental ABIEncoderV2;

import "./PerunTypes.sol";
import "./ValidTransition.sol";
import "./AssetHolder.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/cryptography/ECDSA.sol";

contract Adjudicator {

	using SafeMath for uint256;

	// Mapping channelID => H(parameters, state, timeout)
	mapping(bytes32 => bytes32) public disputeRegistry;

	event Registered(bytes32 indexed channelID, uint256 version);
	event Refuted(bytes32 indexed channelID, uint256 version);
	event Responded(bytes32 indexed channelID, uint256 version);
	event Stored(bytes32 indexed channelID, uint256 timeout);
	event FinalStateRegistered(bytes32 indexed channelID);
	event Payout(bytes32 indexed channelID);

	modifier beforeTimeout(uint256 timeout)
	{
		require(now < timeout, 'function called after timeout');
		_;
	}

	function register(
		PerunTypes.Params memory p,
		PerunTypes.State memory s,
		bytes[] memory sigs)
	public
	{
		bytes32 channelID = calculateChannelID(p);
		require(s.channelID == channelID, 'tried registering invalid channelID');
		require(disputeRegistry[channelID] == bytes32(0), 'a dispute was already registered');
		validateSignatures(p, s, sigs);
		storeChallenge(p, s, channelID);
		emit Registered(channelID, s.version);
	}

	function refute(
		PerunTypes.Params memory p,
		PerunTypes.State memory old,
		uint256 timeout,
		PerunTypes.State memory s,
		bytes[] memory sigs)
	public beforeTimeout(timeout)
	{
		require(s.version > old.version, 'only a refutation with a newer state is valid');
		bytes32 channelID = calculateChannelID(p);
		require(s.channelID == channelID, 'tried refutation with invalid channelID');
		require(disputeRegistry[channelID] == hashDispute(p, old, timeout), 'provided wrong old state/timeout');
		validateSignatures(p, s, sigs);
		storeChallenge(p, s, channelID);
		emit Refuted(channelID, s.version);
	}

	function respond(
		PerunTypes.Params memory p,
		PerunTypes.State memory old,
		uint256 timeout,
		PerunTypes.State memory s,
		bytes memory sig)
	public beforeTimeout(timeout)
	{
		bytes32 channelID = calculateChannelID(p);
		require(s.channelID == channelID, 'tried to respond with invalid channelID');
		require(disputeRegistry[channelID] == hashDispute(p, old, timeout), 'provided wrong old state/timeout');
		address signer = recoverSigner(s, sig);
		require(p.participants[old.moverIdx] == signer, 'moverIdx is not set to the id of the sender');
		validTransition(p, old, s);
		storeChallenge(p, s, channelID);
		emit Responded(channelID, s.version);
	}

	function concludeChallenge(
		PerunTypes.Params memory p,
		PerunTypes.State memory s,
		uint256 timeout)
	public
	{
		require(now >= timeout, 'Can only conclude after timeout');
		bytes32 channelID = calculateChannelID(p);
		require(disputeRegistry[channelID] == hashDispute(p, s, timeout), 'provided wrong old state/timeout');
		payout(channelID, p, s);
	}

	function registerFinalState(
		PerunTypes.Params memory p,
		PerunTypes.State memory s,
		bytes[] memory sigs)
	public
	{
		require(s.isFinal == true, 'only accept final states');
		bytes32 channelID = calculateChannelID(p);
		require(s.channelID == channelID, 'tried registering invalid channelID');
		require(disputeRegistry[channelID] == bytes32(0), 'a dispute was already registered');
		validateSignatures(p, s, sigs);
		payout(channelID, p, s);
		emit FinalStateRegistered(channelID);
	}

	function calculateChannelID(PerunTypes.Params memory p) internal pure returns (bytes32) {
		return keccak256(abi.encode(p.challengeDuration, p.nonce, p.app, p.participants));
	}

	function storeChallenge(
		PerunTypes.Params memory p,
		PerunTypes.State memory s,
		bytes32 channelID)
	internal
	{
		uint256 timeout = now.add(p.challengeDuration);
		disputeRegistry[channelID] = hashDispute(p, s, timeout);
		emit Stored(channelID, timeout);
	}

	function hashDispute(
		PerunTypes.Params memory p,
		PerunTypes.State memory s,
		uint256 timeout)
	internal pure returns (bytes32)
	{
		return keccak256(abi.encode(p, s, timeout));
	}

	function validTransition(
		PerunTypes.Params memory p,
		PerunTypes.State memory old,
		PerunTypes.State memory s)
	internal pure
	{
		require(s.version == old.version + 1, 'can only advance the version counter by one');
		checkAssetPreservation(old.outcome, s.outcome, p.participants.length);
		ValidTransitioner va = ValidTransitioner(p.app);
		require(va.validTransition(p, old, s), 'invalid new state');
	}

	function checkAssetPreservation(
		PerunTypes.Allocation memory oldAlloc,
		PerunTypes.Allocation memory newAlloc,
		uint256 participantsLength)
	internal pure
	{
		assert(oldAlloc.balances.length == newAlloc.balances.length);
		assert(oldAlloc.assets.length == newAlloc.assets.length);
		for (uint256 i = 0; i < newAlloc.assets.length; i++) {
			require(oldAlloc.assets[i] == newAlloc.assets[i], 'asset addresses mismatch');
			uint256 sumOld = 0;
			uint256 sumNew = 0;
			assert(oldAlloc.balances[i].length == newAlloc.balances[i].length);
			assert(oldAlloc.balances[i].length == participantsLength);
			for (uint256 k = 0; k < newAlloc.balances[i].length; k++) {
				sumOld = sumOld.add(oldAlloc.balances[i][k]);
				sumNew = sumNew.add(newAlloc.balances[i][k]);
			}
			require(sumOld == sumNew, 'Sum of balances for an asset must be equal');
		}
		// SubAlloc's currently not implemented
		require(oldAlloc.locked.length == 1, 'SubAlloc currently not implemented');
		require(newAlloc.locked.length == 1, 'SubAlloc currently not implemented');
	}


	function payout(
		bytes32 channelID,
		PerunTypes.Params memory p,
		PerunTypes.State memory s)
	internal
	{
		for (uint256 i = 0; i < s.outcome.assets.length; i++) {
			AssetHolder a = AssetHolder(s.outcome.assets[i]);
			assert(s.outcome.balances[i].length == p.participants.length);
			a.setOutcome(channelID, p.participants, s.outcome.balances[i]);
		}
		emit Payout(channelID);
	}

	function validateSignatures(
		PerunTypes.Params memory p,
		PerunTypes.State memory s,
		bytes[] memory sigs)
	internal pure
	{
		assert(p.participants.length == sigs.length);
		for (uint256 i = 0; i < sigs.length; i++) {
			address signer = recoverSigner(s, sigs[i]);
			require(p.participants[i] == signer, 'invalid signature');
		}
	}

	function recoverSigner(
		PerunTypes.State memory s,
		bytes memory sig)
	internal pure returns (address)
	{
		bytes memory prefix = '\x19Ethereum Signed Message:\n32';
		bytes memory subAlloc = abi.encode(s.outcome.locked[0].ID, s.outcome.locked[0].balances);
		bytes memory outcome = abi.encode(s.outcome.assets, s.outcome.balances, subAlloc);
		bytes memory state = abi.encode(s.channelID, s.moverIdx, s.version, outcome, s.appData, s.isFinal);
		bytes32 h = keccak256(state);
		bytes32 prefixedHash = keccak256(abi.encodePacked(prefix, h));
		address recoveredAddr = ECDSA.recover(prefixedHash, sig);
		require(recoveredAddr != address(0));
		return recoveredAddr;
	}

}