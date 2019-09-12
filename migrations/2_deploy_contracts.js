var AssetHolderETH = artifacts.require("AssetHolderETH");
var Adjudicator = artifacts.require("Adjudicator");

module.exports = function(deployer, network, accounts) {
  deployer.deploy(AssetHolderETH, accounts[0]);
  deployer.deploy(Adjudicator, accounts[0]);
};