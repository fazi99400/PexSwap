// Deploys the full PexSwap stack to the pexli-v2 EVM lane:
//   WPEX -> Factory -> Router, plus two demo PXC-20 tokens and a seeded pool.
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying PexSwap with:", deployer.address);

  const WPEX = await hre.ethers.deployContract("WPEX");
  await WPEX.waitForDeployment();
  console.log("WPEX:", await WPEX.getAddress());

  const Factory = await hre.ethers.deployContract("PexSwapFactory", [deployer.address]);
  await Factory.waitForDeployment();
  console.log("PexSwapFactory:", await Factory.getAddress());
  console.log("pair init code hash:", await Factory.pairCodeHash());

  const Router = await hre.ethers.deployContract("PexSwapRouter", [
    await Factory.getAddress(),
    await WPEX.getAddress(),
  ]);
  await Router.waitForDeployment();
  console.log("PexSwapRouter:", await Router.getAddress());

  // Demo tokens so there is something to trade out of the box.
  const supply = hre.ethers.parseEther("1000000");
  const usdp = await hre.ethers.deployContract("PXC20Token", ["Pexli USD", "USDP", supply]);
  const pxli = await hre.ethers.deployContract("PXC20Token", ["Pexli Gold", "PXLI", supply]);
  await usdp.waitForDeployment();
  await pxli.waitForDeployment();
  console.log("USDP:", await usdp.getAddress());
  console.log("PXLI:", await pxli.getAddress());

  console.log("\nDone. Update frontend/src/config/addresses.ts with the values above.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
