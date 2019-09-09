import { assert, expect, should } from "chai";
should();
const truffleAssert = require('truffle-assertions');
import { AssetHolderETHContract, AssetHolderETHInstance } from "../../types/truffle-contracts";
import Web3 from "web3";

var web3 = new Web3(Web3.givenProvider || 'http://127.0.0.1:7545/');
const AssetHolderETH = artifacts.require<AssetHolderETHContract>("AssetHolderETH");
const toBN = web3.utils.toBN;

function hash(channelID: string, participant: string) {
  return web3.utils.soliditySha3(channelID, participant);
}

function Authorize(channelID: string, authorizer: string, receiver: string, amount: BN) {
  return web3.eth.abi.encodeParameters(
    ['bytes32','address','address','uint256'],
    [web3.utils.rightPad(channelID, 64, "0"),
    authorizer,
    receiver,
    web3.utils.padLeft(amount.toString(), 64, "0")]);
}

async function sign(data: string, account: string) {
  let sig = await web3.eth.sign(web3.utils.soliditySha3(data), account);
  console.log(sig);
  return sig;
}

function ether(x: number): BN { return web3.utils.toWei(web3.utils.toBN(x), "ether"); }

contract("AssetHolderETH", async (accounts) => {
  let ah: AssetHolderETHInstance;
  let channelID = hash("1234", "asdfasdf");
  let participants = [accounts[1], accounts[2]];
  let balance = {A: ether(10), B: ether(20)};
  const timeout = 60;

  it("account[0] should deploy the AssetHolderETH contract", async () => {
      ah = await AssetHolderETH.deployed();
      let adj = await ah.Adjudicator();
      assert(adj == accounts[0]);
  });

  async function assertHoldings(id: string, amount: BN) {
    let c = await ah.holdings(id);
    assert(amount.toString() == c.toString(), "Wrong holdings");
  }

  it("a deposits money into a channel", async () => {
    let id = hash(channelID, participants[0]);
    let amount = balance.A;
    truffleAssert.eventEmitted(
      await ah.deposit(id, amount, {value: amount, from: accounts[1]}),
      'Deposited',
      (ev: any) => {return ev.participantID == id; }
    );
    assertHoldings(id, amount);
  });

  it("b deposits money into a channel", async () => {
    let id = hash(channelID, participants[1]);
    let amount = balance.B;
    truffleAssert.eventEmitted(
      await ah.deposit(id, amount, {value: amount, from: accounts[1]}),
      'Deposited',
      (ev: any) => { return ev.participantID == id; }
    );
    assertHoldings(id, amount);
  });

let newBalances = [ether(20), ether(10)];
  it("set outcome of the asset holder", async () => {
    assert(newBalances.length == participants.length);
    assert(await ah.settled(channelID) == false);
    truffleAssert.eventEmitted(
      await ah.setOutcome(channelID, participants, newBalances, {from: accounts[0]}),
      'OutcomeSet' ,
      (ev: any) => { return ev.channelID == channelID }
    );
    assert(await ah.settled(channelID) == true);
    var i;
    for (i = 0; i < participants.length; i++) {
      let id = hash(channelID, participants[i]);
      await assertHoldings(id, newBalances[i]);
    }
  });

  it("withdraw with allowance", async () => {
    let authorization = Authorize(channelID, participants[0], participants[1], newBalances[0]);
    let signature = await sign(authorization, participants[0]);
    await truffleAssert.passes(
      await ah.withdraw(authorization, signature, {from: accounts[3]})
    );
  });
});
