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
  // fix wrong v value (add 27)
  let v = sig.slice(130, 132);
  return sig.slice(0,130) + (parseInt(v, 16)+27).toString(16);
}

function ether(x: number): BN { return web3.utils.toWei(web3.utils.toBN(x), "ether"); }

contract("AssetHolderETH", async (accounts) => {
  let ah: AssetHolderETHInstance;
  let channelID = hash("1234", "asdfasdf");
  let participants = [accounts[1], accounts[2]];
  let balance = {A: ether(10), B: ether(20)};
  const timeout = 60;
  let newBalances = [ether(20), ether(10)];

  it("account[0] should deploy the AssetHolderETH contract", async () => {
      ah = await AssetHolderETH.new(accounts[0]);
      let adj = await ah.Adjudicator();
      assert(adj == accounts[0]);
  });

  async function assertHoldings(id: string, amount: BN) {
    let c = await ah.holdings(id);
    assert(amount.toString() == c.toString(), "Wrong holdings");
  }

  it("set outcome of asset holder not from adjudicator", async () => {
    await truffleAssert.reverts(
      ah.setOutcome(channelID, participants, newBalances, [], [], {from: accounts[1]}),
    );
  });

  it("a deposits 9 eth into a channel", async () => {
    let id = hash(channelID, participants[0]);
    await truffleAssert.eventEmitted(
      await ah.deposit(id, ether(9), {value: ether(9), from: accounts[1]}),
      'Deposited',
      (ev: any) => {return ev.participantID == id; }
    );
    assertHoldings(id, ether(9));
  });

  it("b deposits 20 eth into a channel", async () => {
    let id = hash(channelID, participants[1]);
    let amount = balance.B;
    await truffleAssert.eventEmitted(
      await ah.deposit(id, amount, {value: amount, from: accounts[2]}),
      'Deposited',
      (ev: any) => { return ev.participantID == id; }
    );
    assertHoldings(id, amount);
  });

  it("a sends to little money with call", async () => {
    let id = hash(channelID, participants[0]);
    await truffleAssert.reverts(
      ah.deposit(id, ether(10), {value: ether(1), from: accounts[1]})
    );
    assertHoldings(id, ether(9));
  });

  it("a tops up her channel with 1 eth", async () => {
    let id = hash(channelID, participants[0]);
    await truffleAssert.eventEmitted(
      await ah.deposit(id, ether(1), {value: ether(1), from: accounts[1]}),
      'Deposited',
      (ev: any) => { return ev.participantID == id; }
    );
    assertHoldings(id, ether(10));
  });

  it("set outcome of the asset holder", async () => {
    assert(newBalances.length == participants.length);
    assert(await ah.settled(channelID) == false);
    await truffleAssert.eventEmitted(
      await ah.setOutcome(channelID, participants, newBalances, [], [], {from: accounts[0]}),
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

  it("set outcome of asset holder twice", async () => {
    await truffleAssert.reverts(
      ah.setOutcome(channelID, participants, newBalances, [], [], {from: accounts[0]})
    );
  });

  it("withdraw with invalid signature", async () => {
    let authorization = Authorize(channelID, participants[0], participants[1], newBalances[0]);
    let signature = await sign(authorization, participants[1]);
    await truffleAssert.reverts(
      ah.withdraw(authorization, signature, {from: accounts[3]})
    );
  });

  it("withdraw with valid signature, invalid balance", async () => {
    let authorization = Authorize(channelID, participants[0], participants[1], ether(30));
    let signature = await sign(authorization, participants[0]);
    await truffleAssert.reverts(
      ah.withdraw(authorization, signature, {from: accounts[3]})
    );
  });

  it("a withdraws with valid allowance 20 eth", async () => {
    let balanceBefore = await web3.eth.getBalance(participants[0]);
    let authorization = Authorize(channelID, participants[0], participants[0], newBalances[0]);
    let signature = await sign(authorization, participants[0]);
    await truffleAssert.passes(
      await ah.withdraw(authorization, signature, {from: accounts[3]})
    );
    let balanceAfter = await web3.eth.getBalance(participants[0]);
    assert(toBN(balanceBefore).add(toBN(ether(20))).eq(toBN(balanceAfter)));
  });

  it("b withdraws with valid allowance 10 eth", async () => {
    let balanceBefore = await web3.eth.getBalance(participants[1]);
    let authorization = Authorize(channelID, participants[1], participants[1], newBalances[1]);
    let signature = await sign(authorization, participants[1]);
    await truffleAssert.passes(
      await ah.withdraw(authorization, signature, {from: accounts[3]})
    );
    let balanceAfter = await web3.eth.getBalance(participants[1]);
    assert(toBN(balanceBefore).add(toBN(ether(10))).eq(toBN(balanceAfter)));
  });

  it("overdraw with valid allowance", async () => {
    let authorization = Authorize(channelID, participants[0], participants[1], newBalances[0]);
    let signature = await sign(authorization, participants[0]);
    await truffleAssert.reverts(
      ah.withdraw(authorization, signature, {from: accounts[3]})
    );
  });

  // check withdrawal after a party refuses to deposit funds into asset holder
  it("a deposits 1 eth into a channel", async () => {
    let channelID = hash("12345", "asdfasdf");
    let id = hash(channelID, participants[0]);
    truffleAssert.eventEmitted(
      await ah.deposit(id, ether(1), {value: ether(1), from: accounts[3]}),
      'Deposited',
      (ev: any) => {return ev.participantID == id; }
    );
    assertHoldings(id, ether(1));
  });

  it("set outcome of the asset holder with deposit refusal", async () => {
    let channelID = hash("12345", "asdfasdf");
    assert(newBalances.length == participants.length);
    assert(await ah.settled(channelID) == false);
    await truffleAssert.eventEmitted(
      await ah.setOutcome(channelID, participants, newBalances, [], [], {from: accounts[0]}),
      'OutcomeSet' ,
      (ev: any) => { return ev.channelID == channelID }
    );
    assert(await ah.settled(channelID) == true);
    let id = hash(channelID, participants[0]);
    assertHoldings(id, ether(1));
  });

  it("a fails to withdraw 2 eth after b's deposit refusal", async () => {
    let channelID = hash("12345", "asdfasdf");
    let authorization = Authorize(channelID, participants[0], participants[0], ether(2));
    let signature = await sign(authorization, participants[0]);
    await truffleAssert.reverts(
      ah.withdraw(authorization, signature, {from: accounts[3]})
    );
  });

  it("a withdraws 1 eth after b's deposit refusal", async () => {
    let balanceBefore = await web3.eth.getBalance(participants[0]);
    let channelID = hash("12345", "asdfasdf");
    let authorization = Authorize(channelID, participants[0], participants[0], ether(1));
    let signature = await sign(authorization, participants[0]);
    await truffleAssert.passes(
      await ah.withdraw(authorization, signature, {from: accounts[3]})
    );
    let balanceAfter = await web3.eth.getBalance(participants[0]);
    assert(toBN(balanceBefore).add(toBN(ether(1))).eq(toBN(balanceAfter)));
  });

});
