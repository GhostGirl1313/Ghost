import { assertEvent, assertIndirectEvent, fp, getSigners } from '@mimic-fi/v2-helpers'
import {
  assertRelayedBaseCost,
  createAction,
  createSmartVault,
  Mimic,
  setupMimic,
} from '@mimic-fi/v2-smart-vaults-base'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { Contract } from 'ethers'

describe('Withdrawer', () => {
  let action: Contract, smartVault: Contract, mimic: Mimic
  let owner: SignerWithAddress, recipient: SignerWithAddress, feeCollector: SignerWithAddress

  before('set up signers', async () => {
    // eslint-disable-next-line prettier/prettier
    [, owner, recipient, feeCollector] = await getSigners()
  })

  beforeEach('deploy action', async () => {
    mimic = await setupMimic(true)
    smartVault = await createSmartVault(mimic, owner)
    action = await createAction('Withdrawer', mimic, owner, smartVault)
  })

  beforeEach('authorize action', async () => {
    const withdrawRole = smartVault.interface.getSighash('withdraw')
    await smartVault.connect(owner).authorize(action.address, withdrawRole)
  })

  beforeEach('set fee collector', async () => {
    const setFeeCollectorRole = smartVault.interface.getSighash('setFeeCollector')
    await smartVault.connect(owner).authorize(owner.address, setFeeCollectorRole)
    await smartVault.connect(owner).setFeeCollector(feeCollector.address)
  })

  describe('call', () => {
    const balance = fp(2)

    beforeEach('fund smart vault', async () => {
      await mimic.wrappedNativeToken.connect(owner).deposit({ value: balance })
      await mimic.wrappedNativeToken.connect(owner).transfer(smartVault.address, balance)
    })

    beforeEach('set recipient', async () => {
      const setRecipientRole = action.interface.getSighash('setRecipient')
      await action.connect(owner).authorize(owner.address, setRecipientRole)
      await action.connect(owner).setRecipient(recipient.address)
    })

    beforeEach('set time-lock', async () => {
      const setTimeLockRole = action.interface.getSighash('setTimeLock')
      await action.connect(owner).authorize(owner.address, setTimeLockRole)
      await action.connect(owner).setTimeLock(60)
    })

    context('when the sender is authorized', () => {
      beforeEach('set sender', async () => {
        const callRole = action.interface.getSighash('call')
        await action.connect(owner).authorize(owner.address, callRole)
        action = action.connect(owner)
      })

      const itPerformsTheExpectedCall = (refunds: boolean) => {
        context('when the time-lock has expired', () => {
          it('calls the withdraw primitive', async () => {
            const previousBalance = await mimic.wrappedNativeToken.balanceOf(feeCollector.address)

            const tx = await action.call()

            const currentBalance = await mimic.wrappedNativeToken.balanceOf(feeCollector.address)
            const refund = currentBalance.sub(previousBalance)

            await assertIndirectEvent(tx, smartVault.interface, 'Withdraw', {
              token: mimic.wrappedNativeToken,
              recipient,
              withdrawn: balance.sub(refund),
              fee: 0,
              data: '0x',
            })
          })

          it('emits an Executed event', async () => {
            const tx = await action.call()

            await assertEvent(tx, 'Executed')
          })

          it(`${refunds ? 'refunds' : 'does not refund'} gas`, async () => {
            const previousBalance = await mimic.wrappedNativeToken.balanceOf(feeCollector.address)

            const tx = await action.call()

            const currentBalance = await mimic.wrappedNativeToken.balanceOf(feeCollector.address)
            if (refunds) await assertRelayedBaseCost(tx, currentBalance.sub(previousBalance))
            else expect(currentBalance).to.be.equal(previousBalance)
          })
        })

        context('when the time-lock has not expired', () => {
          beforeEach('execute', async () => {
            await action.call()
          })

          it('reverts', async () => {
            await expect(action.call()).to.be.revertedWith('TIME_LOCK_NOT_EXPIRED')
          })
        })
      }

      context('when the sender is a relayer', () => {
        beforeEach('mark sender as relayer', async () => {
          const setRelayerRole = action.interface.getSighash('setRelayer')
          await action.connect(owner).authorize(owner.address, setRelayerRole)
          await action.connect(owner).setRelayer(owner.address, true)

          const setLimitsRole = action.interface.getSighash('setLimits')
          await action.connect(owner).authorize(owner.address, setLimitsRole)
          await action.connect(owner).setLimits(fp(100), 0, mimic.wrappedNativeToken.address)
        })

        itPerformsTheExpectedCall(true)
      })

      context('when the sender is not a relayer', () => {
        itPerformsTheExpectedCall(false)
      })
    })

    context('when the sender is authorized', () => {
      it('reverts', async () => {
        await expect(action.call()).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })
})
