var AssetHolderETH = artifacts.require("AssetHolderETH");
var TrivialApp = artifacts.require("TrivialApp");
var Adjudicator = artifacts.require("Adjudicator");

module.exports = function(deployer, network, accounts) {
  deployer.deploy(TrivialApp);
  deployer.deploy(AssetHolderETH, accounts[0]);
};