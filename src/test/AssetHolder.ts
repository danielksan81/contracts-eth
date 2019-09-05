import { assert, expect, should } from "chai";
should();
const truffleAssert = require('truffle-assertions');
import { AssetHolderETHContract, AssetHolderETHInstance } from "../../types/truffle-contracts";
import web3 from "web3";

const AssetHolderETH = artifacts.require<AssetHolderETHContract>("AssetHolderETH");
const toBN = web3.utils.toBN;

function hash(channelID: BN, participant: string) {
  return web3.utils.soliditySha3(channelID, participant);
}

function ether(x: number): BN { return web3.utils.toWei(web3.utils.toBN(x), "ether"); }

contract("AssetHolderETH", async (accounts) => {
  let ah: AssetHolderETHInstance;
  let channelID = toBN(1234);
  let participantID = accounts[1];
  let balance = {A: ether(10), B: ether(20)};
  const timeout = 60;
   console.log(`Hello`);

  it("should deploy the AssetHolderETH contract", async () => {
      ah = await AssetHolderETH.deployed();
  });

  async function assertHoldings(id: string, state: BN) {
    let c = await ah.holdings(id);
    assert(state.eq(toBN(c as unknown as string)), "Wrong holdings");
  }

  it("should deposit money into a channel", async () => {
    let id = hash(channelID, participantID);
    let amount = balance.A;
    truffleAssert.eventEmitted(
      await ah.deposit(id, amount, {value: amount, from: accounts[1]}),
      'Deposited',
      (ev: any) => { return ev.participantID == id; }
    );
    assertHoldings(id, amount);
  });
/*
  it("set outcome of the asset holder", async () => {
    let participants: BN;
    let newBalances: BN;
    let amount = balance.A;
    let id = hash(channelID, participantID);
    truffleAssert.eventEmitted(
      await ah.setOutcome(channelID, participants, newBalances, {value: amount, from: accounts[0]}),
      'Deposited',
      (ev: any) => { return ev.participantID.eq(id); }
    );
    for (let part of participants) {
      let id = hash(channelID, participantID);
      assertHoldings(id, amount);
    }
  });*/
/*
  describe("Withdraw...", () => {
    it("withdraw with allowance", async () => {
      let authorization = Authorize(channelID, participant, receiver, amount);
      let signature = Sign(authorization, participant);
      truffleAssert.eventEmitted(
        await hc.setOutcome(channelID, participants, newBalances, {value: amount, from: accounts[1]}), 'Deposited',
        (ev: any) => { return ev.participantID.eq(id); }
      });
      for (let part of participants) {
        let id = hash(channelID, participantID);
        assertHoldings(id, amount);
      }
      return true;
    });
  });
*/
});
