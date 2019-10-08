// Copyright (c) 2019 The Perun Authors. All rights reserved.
// This file is part of go-perun. Use of this source code is governed by a
// MIT-style license that can be found in the LICENSE file.

pragma solidity 0.5.11;
pragma experimental ABIEncoderV2;

library PerunTypes {

	struct Params{
		uint256 challengeDuration;
		uint256 nonce;
		address app;
		address[] participants;
	}

	struct State {
		bytes32 channelID;
		uint64 moverIdx;
		uint64 version;
		Allocation outcome;
		bytes appData;
		bool isFinal;
	}

	struct Allocation {
		address[] assets;
		uint256[][] balances;
		SubAlloc[] locked;
	}

	struct SubAlloc {
		bytes32 ID;
		uint256[] balances;
	}

}