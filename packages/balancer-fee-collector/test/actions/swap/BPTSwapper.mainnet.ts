import { assertEvent, deploy, fp, getSigners, impersonate, instanceAt, toUSDC } from '@mimic-fi/v2-helpers'
import {
  assertRelayedBaseCost,
  createPriceFeedMock,
  createSmartVault,
  Mimic,
  setupMimic,
} from '@mimic-fi/v2-smart-vaults-base'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { BigNumber, Contract } from 'ethers'

/* eslint-disable no-secrets/no-secrets */

const BALANCER_VAULT = '0xBA12222222228d8Ba445958a75a0704d566BF2C8'

describe('BPTSwapper - mainnet', function () {
  let action: Contract, smartVault: Contract, mimic: Mimic
  let owner: SignerWithAddress, relayer: SignerWithAddress, feeCollector: SignerWithAddress

  before('set up signers', async () => {
    // eslint-disable-next-line prettier/prettier
    [, owner, relayer, feeCollector] = await getSigners()
  })

  beforeEach('deploy action', async () => {
    mimic = await setupMimic(true)
    smartVault = await createSmartVault(mimic, owner)
    action = await deploy('BPTSwapper', [BALANCER_VAULT, owner.address, mimic.registry.address])

    const setSmartVaultRole = action.interface.getSighash('setSmartVault')
    await action.connect(owner).authorize(owner.address, setSmartVaultRole)
    await action.connect(owner).setSmartVault(smartVault.address)
  })

  beforeEach('set fee collector', async () => {
    const setFeeCollectorRole = smartVault.interface.getSighash('setFeeCollector')
    await smartVault.connect(owner).authorize(owner.address, setFeeCollectorRole)
    await smartVault.connect(owner).setFeeCollector(feeCollector.address)
  })

  describe('call', () => {
    const amount = fp(5)
    let pool: Contract, usdc: Contract, balancer: Contract

    beforeEach('load balancer', async () => {
      balancer = await instanceAt('IBalancerVault', BALANCER_VAULT)
    })

    beforeEach('fund SV with USDC', async () => {
      usdc = await instanceAt('IERC20', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')
      const whale = await impersonate('0xDa9CE944a37d218c3302F6B82a094844C6ECEb17', fp(10))
      await usdc.connect(whale).transfer(smartVault.address, toUSDC(100))
    })

    beforeEach('set paying gas token', async () => {
      const setPayingGasTokenRole = action.interface.getSighash('setPayingGasToken')
      await action.connect(owner).authorize(owner.address, setPayingGasTokenRole)
      await action.connect(owner).setPayingGasToken(usdc.address)
    })

    beforeEach('set threshold', async () => {
      const setThresholdRole = action.interface.getSighash('setThreshold')
      await action.connect(owner).authorize(owner.address, setThresholdRole)
      await action.connect(owner).setThreshold(usdc.address, toUSDC(5))
    })

    beforeEach('allow relayer', async () => {
      const setRelayerRole = action.interface.getSighash('setRelayer')
      await action.connect(owner).authorize(owner.address, setRelayerRole)
      await action.connect(owner).setRelayer(relayer.address, true)

      const callRole = action.interface.getSighash('call')
      await action.connect(owner).authorize(relayer.address, callRole)
    })

    beforeEach('allow action', async () => {
      const callRole = smartVault.interface.getSighash('call')
      await smartVault.connect(owner).authorize(action.address, callRole)
      const withdrawRole = smartVault.interface.getSighash('withdraw')
      await smartVault.connect(owner).authorize(action.address, withdrawRole)
    })

    const setUpPool = (poolContractName: string, poolAddress: string, whaleAddress: string) => {
      beforeEach('load pool', async () => {
        pool = await instanceAt(poolContractName, poolAddress)
        const whale = await impersonate(whaleAddress, fp(10))
        await pool.connect(whale).transfer(smartVault.address, amount)
      })

      beforeEach('mock pool price feed', async () => {
        const feed = await createPriceFeedMock(fp(1))
        const setPriceFeedRole = smartVault.interface.getSighash('setPriceFeed')
        await smartVault.connect(owner).authorize(owner.address, setPriceFeedRole)
        await smartVault.connect(owner).setPriceFeed(pool.address, usdc.address, feed.address)
      })

      beforeEach('mock native token price feed', async () => {
        const feed = await createPriceFeedMock(fp(2000))
        const setPriceFeedRole = smartVault.interface.getSighash('setPriceFeed')
        await smartVault.connect(owner).authorize(owner.address, setPriceFeedRole)
        await smartVault.connect(owner).setPriceFeed(mimic.wrappedNativeToken.address, usdc.address, feed.address)
      })
    }

    const itRedeemsGasProperly = () => {
      it('redeems gas properly', async () => {
        const previousBalance = await usdc.balanceOf(feeCollector.address)

        const tx = await action.connect(relayer).call(pool.address, amount)
        await assertEvent(tx, 'Executed')

        const currentBalance = await usdc.balanceOf(feeCollector.address)
        const redeemedCost = currentBalance.sub(previousBalance).mul(1e12).div(2000) // to ETH
        await assertRelayedBaseCost(tx, redeemedCost, 0.1)
      })
    }

    const itExitsProportionally = () => {
      const getTokenBalances = async (tokens: string[], account: Contract): Promise<BigNumber[]> => {
        return Promise.all(
          tokens.map(async (tokenAddress: string) => {
            const token = await instanceAt('IERC20', tokenAddress)
            return token.balanceOf(account.address)
          })
        )
      }

      it('exits the BPT proportionally', async () => {
        const { tokens } = await balancer.getPoolTokens(await pool.getPoolId())
        const previousTokenBalances = await getTokenBalances(tokens, smartVault)
        const previousBptBalance = await pool.balanceOf(smartVault.address)

        await action.connect(relayer).call(pool.address, amount)

        const currentTokenBalances = await getTokenBalances(tokens, smartVault)
        currentTokenBalances.forEach((currentBalance, i) => expect(currentBalance).to.be.gt(previousTokenBalances[i]))

        const currentBptBalance = await pool.balanceOf(smartVault.address)
        expect(currentBptBalance).to.be.equal(previousBptBalance.sub(amount))
      })
    }

    context('weighted pool', () => {
      const POOL = '0x5c6ee304399dbdb9c8ef030ab642b10820db8f56' // BAL-WETH 80/20
      const WHALE = '0x24faf482304ed21f82c86ed5feb0ea313231a808'

      setUpPool('IBalancerPool', POOL, WHALE)
      itRedeemsGasProperly()
      itExitsProportionally()
    })

    context('stable pool', () => {
      const POOL = '0x06df3b2bbb68adc8b0e302443692037ed9f91b42' // staBAL3
      const WHALE = '0xb49d12163334f13c2a1619b6b73659fe6e849e30'

      setUpPool('IBalancerPool', POOL, WHALE)
      itRedeemsGasProperly()
      itExitsProportionally()
    })

    context('linear pool', () => {
      const POOL = '0x2BBf681cC4eb09218BEe85EA2a5d3D13Fa40fC0C' // bb-a-USDT
      const WHALE = '0xc578d755cd56255d3ff6e92e1b6371ba945e3984'

      setUpPool('IBalancerLinearPool', POOL, WHALE)
      itRedeemsGasProperly()

      it('swaps for the first main token', async () => {
        const mainToken = await instanceAt('IERC20', pool.getMainToken())

        const previousBptBalance = await pool.balanceOf(smartVault.address)
        const previousMainTokenBalance = await mainToken.balanceOf(smartVault.address)

        await action.connect(relayer).call(pool.address, amount)

        const currentBptBalance = await pool.balanceOf(smartVault.address)
        expect(currentBptBalance).to.be.equal(previousBptBalance.sub(amount))

        const currentMainTokenBalance = await mainToken.balanceOf(smartVault.address)
        expect(currentMainTokenBalance).to.be.gt(previousMainTokenBalance)
      })
    })

    context('boosted pool', () => {
      const POOL = '0x7b50775383d3d6f0215a8f290f2c9e2eebbeceb2' // bb-a-USDT bb-a-DAI bb-a-USDC
      const WHALE = '0x575daf04615aef7272b388e3d7fac8adf1974173'

      setUpPool('IBalancerBoostedPool', POOL, WHALE)
      itRedeemsGasProperly()

      it('swaps to the first main token', async () => {
        const { tokens } = await balancer.getPoolTokens(await pool.getPoolId())
        const bptIndex = await pool.getBptIndex()
        const linearPool = await instanceAt('IBalancerLinearPool', tokens[bptIndex.eq(0) ? 1 : 0])
        const mainToken = await instanceAt('IERC20', await linearPool.getMainToken())

        const previousBptBalance = await pool.balanceOf(smartVault.address)
        const previousLinearBalance = await linearPool.balanceOf(smartVault.address)
        const previousMainTokenBalance = await mainToken.balanceOf(smartVault.address)

        await action.connect(relayer).call(pool.address, amount)

        const currentBptBalance = await pool.balanceOf(smartVault.address)
        expect(currentBptBalance).to.be.equal(previousBptBalance.sub(amount))

        const currentLinearBalance = await linearPool.balanceOf(smartVault.address)
        expect(currentLinearBalance).to.be.equal(previousLinearBalance)

        const currentMainTokenBalance = await mainToken.balanceOf(smartVault.address)
        expect(currentMainTokenBalance).to.be.gt(previousMainTokenBalance)
      })
    })
  })
})