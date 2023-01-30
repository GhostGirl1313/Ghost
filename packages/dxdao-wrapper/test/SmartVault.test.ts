import { assertIndirectEvent, deploy, fp, getSigner, getSigners, instanceAt, ZERO_ADDRESS } from '@mimic-fi/v2-helpers'
import { assertPermissions, Mimic, setupMimic } from '@mimic-fi/v2-smart-vaults-base'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { Contract } from 'ethers'
import { ethers } from 'hardhat'

describe('SmartVault', () => {
  let smartVault: Contract, wrapper: Contract, mimic: Mimic
  let other: SignerWithAddress, owner: SignerWithAddress, managers: SignerWithAddress[], relayers: SignerWithAddress[]

  beforeEach('set up signers', async () => {
    other = await getSigner(1)
    owner = await getSigner(2)
    managers = await getSigners(3, 3)
    relayers = await getSigners(2, 6)
  })

  beforeEach('setup mimic', async () => {
    mimic = await setupMimic(false)
  })

  beforeEach('deploy smart vault', async () => {
    const deployer = await deploy('SmartVaultDeployer', [], owner, { Deployer: mimic.deployer.address })
    wrapper = await deploy('Wrapper', [deployer.address, mimic.registry.address])

    const tx = await deployer.deploy({
      registry: mimic.registry.address,
      smartVaultParams: {
        salt: ethers.utils.solidityKeccak256(['string'], ['mimic-v2.dxdao-wrapper']),
        factory: mimic.smartVaultsFactory.address,
        impl: mimic.smartVault.address,
        admin: owner.address,
        feeCollector: mimic.admin.address,
        feeCollectorAdmin: mimic.admin.address,
        strategies: [],
        priceFeedParams: [],
        priceOracle: mimic.priceOracle.address,
        swapConnector: mimic.swapConnector.address,
        bridgeConnector: mimic.bridgeConnector.address,
        swapFee: { pct: fp(0.1), cap: fp(1), token: mimic.wrappedNativeToken.address, period: 60 },
        bridgeFee: { pct: 0, cap: 0, token: ZERO_ADDRESS, period: 0 },
        withdrawFee: { pct: 0, cap: 0, token: ZERO_ADDRESS, period: 0 },
        performanceFee: { pct: 0, cap: 0, token: ZERO_ADDRESS, period: 0 },
      },
      wrapperActionParams: {
        impl: wrapper.address,
        admin: owner.address,
        managers: managers.map((m) => m.address),
        relayedActionParams: {
          relayers: relayers.map((m) => m.address),
          gasPriceLimit: 0,
          txCostLimit: fp(100),
        },
        tokenThresholdActionParams: {
          amount: fp(10),
          token: mimic.wrappedNativeToken.address,
        },
        withdrawalActionParams: {
          recipient: owner.address,
        },
      },
    })

    const { args } = await assertIndirectEvent(tx, mimic.smartVaultsFactory.interface, 'Created', {
      implementation: mimic.smartVault,
    })

    smartVault = await instanceAt('SmartVault', args.instance)
  })

  describe('smart vault', () => {
    it('has set its permissions correctly', async () => {
      await assertPermissions(smartVault, [
        {
          name: 'owner',
          account: owner,
          roles: [
            'authorize',
            'unauthorize',
            'collect',
            'withdraw',
            'wrap',
            'unwrap',
            'claim',
            'join',
            'exit',
            'swap',
            'bridge',
            'setStrategy',
            'setPriceFeed',
            'setPriceFeeds',
            'setPriceOracle',
            'setSwapConnector',
            'setBridgeConnector',
            'setSwapFee',
            'setBridgeFee',
            'setPerformanceFee',
            'setWithdrawFee',
          ],
        },
        { name: 'mimic', account: mimic.admin, roles: ['setFeeCollector'] },
        { name: 'wrapper', account: wrapper, roles: ['wrap', 'withdraw'] },
        { name: 'other', account: other, roles: [] },
        { name: 'managers', account: managers, roles: [] },
        { name: 'relayers', account: relayers, roles: [] },
      ])
    })

    it('sets a fee collector', async () => {
      expect(await smartVault.feeCollector()).to.be.equal(mimic.admin.address)
    })

    it('sets a swap fee', async () => {
      const swapFee = await smartVault.swapFee()

      expect(swapFee.pct).to.be.equal(fp(0.1))
      expect(swapFee.cap).to.be.equal(fp(1))
      expect(swapFee.token).to.be.equal(mimic.wrappedNativeToken.address)
      expect(swapFee.period).to.be.equal(60)
    })

    it('sets no bridge fee', async () => {
      const bridgeFee = await smartVault.bridgeFee()

      expect(bridgeFee.pct).to.be.equal(0)
      expect(bridgeFee.cap).to.be.equal(0)
      expect(bridgeFee.token).to.be.equal(ZERO_ADDRESS)
      expect(bridgeFee.period).to.be.equal(0)
    })

    it('sets no withdraw fee', async () => {
      const withdrawFee = await smartVault.withdrawFee()

      expect(withdrawFee.pct).to.be.equal(0)
      expect(withdrawFee.cap).to.be.equal(0)
      expect(withdrawFee.token).to.be.equal(ZERO_ADDRESS)
      expect(withdrawFee.period).to.be.equal(0)
    })

    it('sets no performance fee', async () => {
      const performanceFee = await smartVault.performanceFee()

      expect(performanceFee.pct).to.be.equal(0)
      expect(performanceFee.cap).to.be.equal(0)
      expect(performanceFee.token).to.be.equal(ZERO_ADDRESS)
      expect(performanceFee.period).to.be.equal(0)
    })

    it('sets a price oracle', async () => {
      expect(await smartVault.priceOracle()).to.be.equal(mimic.priceOracle.address)
    })

    it('sets a swap connector', async () => {
      expect(await smartVault.swapConnector()).to.be.equal(mimic.swapConnector.address)
    })

    it('sets a bridge connector', async () => {
      expect(await smartVault.bridgeConnector()).to.be.equal(mimic.bridgeConnector.address)
    })
  })

  describe('wrapper', () => {
    it('has set its permissions correctly', async () => {
      await assertPermissions(wrapper, [
        {
          name: 'owner',
          account: owner,
          roles: [
            'authorize',
            'unauthorize',
            'setSmartVault',
            'setLimits',
            'setRelayer',
            'setThreshold',
            'setRecipient',
            'call',
            'withdraw',
          ],
        },
        { name: 'mimic', account: mimic.admin, roles: [] },
        { name: 'wrapper', account: wrapper, roles: [] },
        { name: 'other', account: other, roles: [] },
        { name: 'managers', account: managers, roles: ['call'] },
        { name: 'relayers', account: relayers, roles: ['call'] },
      ])
    })

    it('has the proper smart vault set', async () => {
      expect(await wrapper.smartVault()).to.be.equal(smartVault.address)
    })

    it('sets the owner as the recipient', async () => {
      expect(await wrapper.recipient()).to.be.equal(owner.address)
    })

    it('sets the expected token threshold params', async () => {
      expect(await wrapper.thresholdToken()).to.be.equal(mimic.wrappedNativeToken.address)
      expect(await wrapper.thresholdAmount()).to.be.equal(fp(10))
    })

    it('sets the expected gas limits', async () => {
      expect(await wrapper.gasPriceLimit()).to.be.equal(0)
      expect(await wrapper.txCostLimit()).to.be.equal(fp(100))
    })

    it('whitelists the requested relayers', async () => {
      for (const relayer of relayers) {
        expect(await wrapper.isRelayer(relayer.address)).to.be.true
      }
    })

    it('does not whitelist managers as relayers', async () => {
      for (const manager of managers) {
        expect(await wrapper.isRelayer(manager.address)).to.be.false
      }
    })
  })
})
