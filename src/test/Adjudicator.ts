import { assert, expect, should } from "chai";
should();
const truffleAssert = require('truffle-assertions');
import { AdjudicatorContract, AdjudicatorInstance } from "../../types/truffle-contracts";
import Web3 from "web3";

var web3 = new Web3(Web3.givenProvider || 'http://127.0.0.1:7545/');
const Adjudicator = artifacts.require<AdjudicatorContract>("Adjudicator");
const toBN = web3.utils.toBN;

function hash(channelID: string, participant: string) {
  return web3.utils.soliditySha3(channelID, participant);
}

function Params(_app: string, _challengeDuration: string, _participants: string[]) {
  return {app: _app, challengeDuration: _challengeDuration, participants: _participants}
}

function State(_channelID: string, _moverIdx: string, _version: string,
  _outcome: {assets: string[], balances: string[][], locked: {ID: string, balances: string[]}[]},
  _appData: string, _isFinal: boolean) {
  return {channelID: _channelID, moverIdx: _moverIdx, version: _version, outcome: _outcome, appData: _appData, isFinal: _isFinal}
}

function Allocation(_assets: string[], _balances: string[][], _locked: {ID: string, balances: string[]}[]) {
  return {assets: _assets, balances: _balances, locked: _locked}
}

function SubAlloc(id: string, _balances: string[]) {
  return {ID: id, balances: _balances}
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
  let channelID = hash("1234", "asdfasdf");
  let participants = [accounts[1], accounts[2]];
  let balance = {A: ether(10), B: ether(20)};
  const timeout = 60;
  let newBalances = [ether(20), ether(10)];

  it("account[0] should deploy the Adjudicator contract", async () => {
      ad = await Adjudicator.deployed();
  });

  it("register invalid state", async () => {
    let params = Params(accounts[0], "1", [accounts[1], accounts[2]]);
    let suballoc = SubAlloc(accounts[0],[]);
    let outcome = Allocation([accounts[0]], [["0"],["0"]], [suballoc]);
    let state = State(channelID, "0", "0", outcome, "0x00", false);
    let sigs = ["0x001"]//[sign(state, participants[0]), sign(state, participants[1])];
    truffleAssert.reverts(
      ad.register(
        params,
        state,
        sigs,
        {from: accounts[1]}),
    );
  });

});
