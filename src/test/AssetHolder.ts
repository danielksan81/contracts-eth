/// <reference types="truffle-typings" />
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

class Authorization {
  channelID: string;
  participant: string;
  receiver: string;
  amount: string;

  constructor(_channelID: string, _participant: string, _receiver: string, _amount: string) {
    this.channelID = _channelID;
    this.participant = _participant;
    this.receiver = _receiver;
    this.amount = _amount;
  }

  serialize() {
    return {
      channelID: this.channelID,
      participant: this.participant,
      receiver: this.receiver,
      amount: this.amount};
  }

  encode() {
    return web3.eth.abi.encodeParameters(
      ['bytes32','address','address','uint256'],
      [web3.utils.rightPad(this.channelID, 64, "0"),
      this.participant,
      this.receiver,
      web3.utils.padLeft(this.amount, 64, "0")]);
  }
}

async function sign(data: string, account: string) {
  let sig = await web3.eth.sign(web3.utils.soliditySha3(data), account);
  // fix wrong v value (add 27)
  let v = sig.slice(130, 132);
  return sig.slice(0,130) + (parseInt(v, 16)+27).toString(16);
}

function ether(x: number): BN { return web3.utils.toWei(web3.utils.toBN(x), "ether"); }

contract("AssetHolderETH", async (accounts) => {
  let ah: AssetHolderETHInstance;
  let channelID = hash("1234", "asdfasdf");
  let parts = [accounts[1], accounts[2]];
  let balance = [ether(10), ether(20)];
  const timeout = 60;
  let newBalances = [ether(20), ether(10)];
  let A = 0
  let B = 1

  it("account[0] should deploy the AssetHolderETH contract", async () => {
      ah = await AssetHolderETH.new(accounts[0]);
      let adj = await ah.adjudicator();
      assert(adj == accounts[0]);
  });

  async function assertHoldings(id: string, amount: BN) {
    let c = await ah.holdings(id);
    assert(amount.eq(c), "Wrong holdings");
  }

  it("set outcome of asset holder not from adjudicator", async () => {
    await truffleAssert.reverts(
      ah.setOutcome(channelID, parts, newBalances, [], [], {from: parts[A]}),
    );
  });

  it("a deposits 9 eth into a channel", async () => {
    let id = hash(channelID, parts[A]);
    await truffleAssert.eventEmitted(
      await ah.deposit(id, ether(9), {value: ether(9), from: parts[A]}),
      'Deposited',
      (ev: any) => {return ev.fundingID == id; }
    );
    assertHoldings(id, ether(9));
  });

  it("b deposits 20 eth into a channel", async () => {
    let id = hash(channelID, parts[B]);
    let amount = balance[B];
    await truffleAssert.eventEmitted(
      await ah.deposit(id, amount, {value: amount, from: parts[B]}),
      'Deposited',
      (ev: any) => { return ev.fundingID == id; }
    );
    assertHoldings(id, amount);
  });

  it("a sends too little money with call", async () => {
    let id = hash(channelID, parts[A]);
    await truffleAssert.reverts(
      ah.deposit(id, ether(10), {value: ether(1), from: parts[A]})
    );
    assertHoldings(id, ether(9));
  });

  it("a tops up her channel with 1 eth", async () => {
    let id = hash(channelID, parts[A]);
    await truffleAssert.eventEmitted(
      await ah.deposit(id, ether(1), {value: ether(1), from: parts[A]}),
      'Deposited',
      (ev: any) => { return ev.fundingID == id; }
    );
    assertHoldings(id, balance[A]);
  });

  it("set outcome of the asset holder", async () => {
    assert(newBalances.length == parts.length);
    assert(await ah.settled(channelID) == false);
    await truffleAssert.eventEmitted(
      await ah.setOutcome(channelID, parts, newBalances, [], [], {from: accounts[0]}),
      'OutcomeSet' ,
      (ev: any) => { return ev.channelID == channelID }
    );
    assert(await ah.settled(channelID) == true);
    for (var i = 0; i < parts.length; i++) {
      let id = hash(channelID, parts[i]);
      await assertHoldings(id, newBalances[i]);
    }
  });

  it("set outcome of asset holder twice", async () => {
    await truffleAssert.reverts(
      ah.setOutcome(channelID, parts, newBalances, [], [], {from: accounts[0]})
    );
  });

  it("withdraw with invalid signature", async () => {
    let authorization = new Authorization(channelID, parts[A], parts[B], newBalances[A].toString());
    let signature = await sign(authorization.encode(), parts[B]);
    await truffleAssert.reverts(
      ah.withdraw(authorization, signature, {from: accounts[3]})
    );
  });

  it("withdraw with valid signature, invalid balance", async () => {
    let authorization = new Authorization(channelID, parts[A], parts[B], ether(30).toString());
    let signature = await sign(authorization.encode(), parts[A]);
    await truffleAssert.reverts(
      ah.withdraw(authorization, signature, {from: accounts[3]})
    );
  });

  it("a withdraws with valid allowance 20 eth", async () => {
    let balanceBefore = await web3.eth.getBalance(parts[A]);
    let authorization = new Authorization(channelID, parts[A], parts[A], newBalances[A].toString());
    let signature = await sign(authorization.encode(), parts[A]);
    await truffleAssert.passes(
      await ah.withdraw(authorization, signature, {from: accounts[3]})
    );
    let balanceAfter = await web3.eth.getBalance(parts[A]);
    assert(toBN(balanceBefore).add(ether(20)).eq(toBN(balanceAfter)));
  });

  it("b withdraws with valid allowance 10 eth", async () => {
    let balanceBefore = await web3.eth.getBalance(parts[B]);
    let authorization = new Authorization(channelID, parts[B], parts[B], newBalances[B].toString());
    let signature = await sign(authorization.encode(), parts[B]);
    await truffleAssert.passes(
      await ah.withdraw(authorization, signature, {from: accounts[3]})
    );
    let balanceAfter = await web3.eth.getBalance(parts[B]);
    assert(toBN(balanceBefore).add(ether(10)).eq(toBN(balanceAfter)));
  });

  it("overdraw with valid allowance", async () => {
    let authorization = new Authorization(channelID, parts[A], parts[B], newBalances[A].toString());
    let signature = await sign(authorization.encode(), parts[A]);
    await truffleAssert.reverts(
      ah.withdraw(authorization, signature, {from: accounts[3]})
    );
  });

  // check withdrawal after a party refuses to deposit funds into asset holder
  it("a deposits 1 eth into a channel", async () => {
    let channelID = hash("12345", "asdfasdf");
    let id = hash(channelID, parts[A]);
    truffleAssert.eventEmitted(
      await ah.deposit(id, ether(1), {value: ether(1), from: accounts[3]}),
      'Deposited',
      (ev: any) => {return ev.fundingID == id; }
    );
    assertHoldings(id, ether(1));
  });

  it("set outcome of the asset holder with deposit refusal", async () => {
    let channelID = hash("12345", "asdfasdf");
    assert(newBalances.length == parts.length);
    assert(await ah.settled(channelID) == false);
    await truffleAssert.eventEmitted(
      await ah.setOutcome(channelID, parts, newBalances, [], [], {from: accounts[0]}),
      'OutcomeSet' ,
      (ev: any) => { return ev.channelID == channelID; }
    );
    assert(await ah.settled(channelID) == true);
    let id = hash(channelID, parts[A]);
    assertHoldings(id, ether(1));
  });

  it("a fails to withdraw 2 eth after b's deposit refusal", async () => {
    let channelID = hash("12345", "asdfasdf");
    let authorization = new Authorization(channelID, parts[A], parts[A], ether(2).toString());
    let signature = await sign(authorization.encode(), parts[A]);
    await truffleAssert.reverts(
      ah.withdraw(authorization, signature, {from: accounts[3]})
    );
  });

  it("a withdraws 1 eth after b's deposit refusal", async () => {
    let balanceBefore = await web3.eth.getBalance(parts[A]);
    let channelID = hash("12345", "asdfasdf");
    let authorization = new Authorization(channelID, parts[A], parts[A], ether(1).toString());
    let signature = await sign(authorization.encode(), parts[A]);
    await truffleAssert.passes(
      await ah.withdraw(authorization, signature, {from: accounts[3]})
    );
    let balanceAfter = await web3.eth.getBalance(parts[A]);
    assert(toBN(balanceBefore).add(ether(1)).eq(toBN(balanceAfter)));
  });

});
