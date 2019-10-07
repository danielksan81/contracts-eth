import { assert, expect, should } from "chai";
should();
const truffleAssert = require('truffle-assertions');
import { AdjudicatorContract, AdjudicatorInstance } from "../../types/truffle-contracts";
import Web3 from "web3";

var web3 = new Web3(Web3.givenProvider || 'http://127.0.0.1:7545/');
const Adjudicator = artifacts.require<AdjudicatorContract>("Adjudicator");
const toBN = web3.utils.toBN;

class Params {
  app: string;
  challengeDuration: string;
  participants: string[];

  constructor(_app: string, _challengeDuration: string, _participants: string[]) {
    this.app = _app;
    this.challengeDuration = _challengeDuration;
    this.participants = _participants;
  }

  serialize() {
    return {app: this.app, challengeDuration: this.challengeDuration, participants: this.participants};
  }

  encode() {
    return web3.eth.abi.encodeParameters(
      ['uint256','address','address[]'],
      [web3.utils.padLeft(this.challengeDuration, 64, "0"),
      this.app,
      this.participants]);
  }
}

class State {
  channelID: string;
  moverIdx: string;
  version: string;
  outcome: Allocation;
  appData: string;
  isFinal: boolean;

  constructor(_channelID: string, _moverIdx: string, _version: string, _outcome: Allocation, _appData: string, _isFinal: boolean) {
    this.channelID = _channelID;
    this.moverIdx = _moverIdx;
    this.version = _version;
    this.outcome = _outcome;
    this.appData = _appData;
    this.isFinal = _isFinal;
  }

  serialize() {
    return {channelID: this.channelID, moverIdx: this.moverIdx, version: this.version,
      outcome: this.outcome.serialize(), appData: this.appData, isFinal: this.isFinal}
  }

  encode() {
    return web3.eth.abi.encodeParameters(
      ['bytes32','uint64','uint64','bytes','bytes','bool'],
      [this.channelID,
      web3.utils.padLeft(this.moverIdx, 64, "0"),
      web3.utils.padLeft(this.version, 64, "0"),
      this.outcome.encode(),
      this.appData,
      this.isFinal]);
  }
}

class Allocation {
  assets: string[];
  balances: string[][];
  locked: SubAlloc[];

  constructor(_assets: string[], _balances: string[][], _locked: SubAlloc[]) {
    this.assets = _assets;
    this.balances = _balances;
    this.locked = _locked;
  }

  serialize() {
    var _locked = [];
      for (var i = 0; i < this.locked.length; i++) {
        _locked.push(this.locked[i].serialize());
    }
    return {assets: this.assets, balances: this.balances, locked: _locked};
  }

  encode() {
    var _locked = this.locked[0].encode();
    return web3.eth.abi.encodeParameters(
      ['address[]','uint256[][]','bytes'],
      [this.assets, this.balances, _locked]);
  }
}

class SubAlloc {
  id: string;
  balances: string[];

  constructor(id: string, _balances: string[]) {
    this.id = id;
    this.balances = _balances;
  }

  serialize() {
     return {ID: this.id, balances: this.balances};
  }

  encode() {
    return web3.eth.abi.encodeParameters(
      ['bytes32','uint256[]'],
      [web3.utils.padRight(this.id, 64, "0"), this.balances]);
  }
}

function hash(message: string) {
  return web3.utils.soliditySha3(message);
}

async function sign(data: string, account: string) {
  let sig = await web3.eth.sign(web3.utils.soliditySha3(data), account);
  // fix wrong v value (set to 27 or 28)
  let v = sig.slice(130, 132);
  if(v == "00"){
    sig = sig.slice(0,130) + "1b";
  } else {
    sig = sig.slice(0,130) + "1c";
  }
  return sig;
}

function ether(x: number): BN { return web3.utils.toWei(web3.utils.toBN(x), "ether"); }

contract("Adjudicator", async (accounts) => {
  let ad: AdjudicatorInstance;
  let participants = [accounts[1], accounts[2]];
  let balance = {A: ether(10), B: ether(20)};
  const timeout = 60;
  let newBalances = [ether(20), ether(10)];

  it("account[0] should deploy the Adjudicator contract", async () => {
      ad = await Adjudicator.deployed();
  });

  it("register invalid channelID", async () => {
    let params = new Params(accounts[0], "30", [accounts[1], accounts[2]]);
    // calculate channelID wrong:
    let channelID = hash("asdf");
    let suballoc = new SubAlloc(accounts[0],["0x00"]);
    let outcome = new Allocation([accounts[0]], [["0"],["0"]], [suballoc]);
    let state = new State(channelID, "0", "0", outcome, "0x00", false);
    let stateHash = hash(state.encode());
    let sigs = [await sign(state.encode(), participants[0]), await sign(state.encode(), participants[1])];
    truffleAssert.reverts(
      ad.register(
        params.serialize(),
        state.serialize(),
        sigs,
        {from: accounts[1]}),
    );
  });

  it("registering state with invalid signatures fails", async () => {
    let params = new Params(accounts[0], "30", [participants[0], participants[1]]);
    let channelID = hash(params.encode());
    let suballoc = new SubAlloc(accounts[0],["0x00"]);
    let outcome = new Allocation([accounts[0]], [["0"],["0"]], [suballoc]);
    let state = new State(channelID, "0", "0", outcome, "0x00", false);
    let stateHash = hash(state.encode());
    let sigs = [await sign(state.encode(), participants[0]), await sign(state.encode(), accounts[0])];
    await truffleAssert.reverts(
      ad.register(
        params.serialize(),
        state.serialize(),
        sigs,
        {from: accounts[1]}),
    );
  });

  let validState: State;
  let validStateTimeout: string;

  it("register valid state", async () => {
    let params = new Params(accounts[0], "30", [participants[0], participants[1]]);
    let channelID = hash(params.encode());
    let suballoc = new SubAlloc(accounts[0],["0x00"]);
    let outcome = new Allocation([accounts[0]], [["0"],["0"]], [suballoc]);
    let state = new State(channelID, "0", "4", outcome, "0x00", false);
    let stateHash = hash(state.encode());
    let sigs = [await sign(state.encode(), participants[0]), await sign(state.encode(), participants[1])];
    truffleAssert.eventEmitted(
      await ad.register(
        params.serialize(),
        state.serialize(),
        sigs,
        {from: accounts[1]}),
      'Stored',
      (ev: any) => {
        validStateTimeout = ev.timeout;
        return ev.channelID == channelID;
      }
    );
    validState = state;
  });

  it("registering state twice fails", async () => {
    let params = new Params(accounts[0], "30", [participants[0], participants[1]]);
    let channelID = hash(params.encode());
    let suballoc = new SubAlloc(accounts[0],["0x00"]);
    let outcome = new Allocation([accounts[0]], [["0"],["0"]], [suballoc]);
    let state = new State(channelID, "0", "4", outcome, "0x00", false);
    let stateHash = hash(state.encode());
    let sigs = [await sign(state.encode(), participants[0]), await sign(state.encode(), participants[1])];
    await truffleAssert.reverts(
      ad.register(
        params.serialize(),
        state.serialize(),
        sigs,
        {from: accounts[1]}),
    );
  });

  it("refuting with old state fails", async () => {
    let params = new Params(accounts[0], "30", [participants[0], participants[1]]);
    let channelID = hash(params.encode());
    let suballoc = new SubAlloc(accounts[0],["0x00"]);
    let outcome = new Allocation([accounts[0]], [["0"],["0"]], [suballoc]);
    let state = new State(channelID, "0", "3", outcome, "0x00", false);
    let stateHash = hash(state.encode());
    let sigs = [await sign(state.encode(), participants[0]), await sign(state.encode(), participants[1])];
    await truffleAssert.reverts(
      ad.refute(
        params.serialize(),
        validState.serialize(),
        validStateTimeout,
        state.serialize(),
        sigs,
        {from: accounts[1]}),
    );
  });

  it("refuting with wrong timeout fails", async () => {
    let params = new Params(accounts[0], "30", [participants[0], participants[1]]);
    let channelID = hash(params.encode());
    let suballoc = new SubAlloc(accounts[0],["0x00"]);
    let outcome = new Allocation([accounts[0]], [["0"],["0"]], [suballoc]);
    let state = new State(channelID, "0", "5", outcome, "0x00", false);
    let stateHash = hash(state.encode());
    let sigs = [await sign(state.encode(), participants[0]), await sign(state.encode(), participants[1])];
    await truffleAssert.reverts(
      ad.refute(
        params.serialize(),
        validState.serialize(),
        validStateTimeout + "1",
        state.serialize(),
        sigs,
        {from: accounts[1]}),
    );
  });

  it("refuting with wrong channelID fails", async () => {
    let params = new Params(accounts[0], "30", [participants[0], participants[1]]);
    let channelID = hash("asdf");
    let suballoc = new SubAlloc(accounts[0],["0x00"]);
    let outcome = new Allocation([accounts[0]], [["0"],["0"]], [suballoc]);
    let state = new State(channelID, "0", "5", outcome, "0x00", false);
    let stateHash = hash(state.encode());
    let sigs = [await sign(state.encode(), participants[0]), await sign(state.encode(), participants[1])];
    await truffleAssert.reverts(
      ad.refute(
        params.serialize(),
        validState.serialize(),
        validStateTimeout + "1",
        state.serialize(),
        sigs,
        {from: accounts[1]}),
    );
  });

  it("refuting with invalid signatures fails", async () => {
    let params = new Params(accounts[0], "30", [participants[0], participants[1]]);
    let channelID = hash("asdf");
    let suballoc = new SubAlloc(accounts[0],["0x00"]);
    let outcome = new Allocation([accounts[0]], [["0"],["0"]], [suballoc]);
    let state = new State(channelID, "0", "5", outcome, "0x00", false);
    let stateHash = hash(state.encode());
    let sigs = [await sign(state.encode(), participants[0]), await sign(state.encode(), participants[0])];
    await truffleAssert.reverts(
      ad.refute(
        params.serialize(),
        validState.serialize(),
        validStateTimeout,
        state.serialize(),
        sigs,
        {from: accounts[1]}),
      );
  });

  it("refuting with correct state succeeds", async () => {
    let params = new Params(accounts[0], "30", [participants[0], participants[1]]);
    let channelID = hash(params.encode());
    let suballoc = new SubAlloc(accounts[0],["0x00"]);
    let outcome = new Allocation([accounts[0]], [["0"],["0"]], [suballoc]);
    let state = new State(channelID, "0", "5", outcome, "0x00", false);
    let stateHash = hash(state.encode());
    let sigs = [await sign(state.encode(), participants[0]), await sign(state.encode(), participants[1])];
    truffleAssert.eventEmitted(
      await ad.refute(
        params.serialize(),
        validState.serialize(),
        validStateTimeout,
        state.serialize(),
        sigs,
        {from: accounts[1]}),
      'Stored',
      (ev: any) => {
        validStateTimeout = ev.timeout;
        return ev.channelID == channelID;
      }
    );
  });


});
