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

function Params(app: string, challengeDuration: BN, participants: string[]) {
  return web3.eth.abi.encodeParameters(
    ['address','uint256','address[]'],
    [app,
    web3.utils.padLeft(challengeDuration.toString(), 64, "0"),
    participants]);
}

function State(channelID: string, moverIdx: BN, version: BN, outcome: string, appData: string, isFinal: string) {
  return web3.eth.abi.encodeParameters(
    ['bytes32','uint64','uint64','bytes','bytes','bool'],
    [channelID,
    web3.utils.padLeft(moverIdx.toString(), 64, "0"),
    web3.utils.padLeft(version.toString(), 64, "0"),
    outcome,
    appData,
    isFinal]);
}

function Allocation(assets: string[], balances: BN[][], locked: string[]) {
  return web3.eth.abi.encodeParameters(
    ['address[]','uint256[][]','bytes[]'],
    [assets, balances, locked]);
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
  let ad = await Adjudicator.deployed();
  let channelID = hash("1234", "asdfasdf");
  let participants = [accounts[1], accounts[2]];
  let balance = {A: ether(10), B: ether(20)};
  const timeout = 60;
  let newBalances = [ether(20), ether(10)];
/*

  it("set outcome of asset holder not from adjudicator", async () => {
    truffleAssert.reverts(
      ah.setOutcome(channelID, participants, newBalances, {from: accounts[1]}),
    );
  });
  it("a tries to register a wrong state", async () => {
    let id = hash(channelID, participants[0]);
    truffleAssert.eventEmitted(
      await ah.deposit(id, ether(9), {value: ether(9), from: accounts[1]}),
      'Deposited',
      (ev: any) => {return ev.participantID == id; }
    );
    assertHoldings(id, ether(9));
  });
*/
});
