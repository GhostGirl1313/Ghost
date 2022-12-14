import { assertEvent, assertIndirectEvent, deploy, fp, getSigners, ZERO_ADDRESS } from '@mimic-fi/v2-helpers'
import {
  createAction,
  createSmartVault,
  createTokenMock,
  Mimic,
  MOCKS,
  setupMimic,
} from '@mimic-fi/v2-smart-vaults-base'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { Contract } from 'ethers'
import { defaultAbiCoder } from 'ethers/lib/utils'

describe('L2HopBridger', () => {
  let action: Contract, smartVault: Contract, token: Contract, hopL2Amm: Contract, mimic: Mimic
  let owner: SignerWithAddress, other: SignerWithAddress

  before('set up signers', async () => {
    // eslint-disable-next-line prettier/prettier
    [, owner, other] = await getSigners()
  })

  beforeEach('deploy action', async () => {
    mimic = await setupMimic(true)
    smartVault = await createSmartVault(mimic, owner)
    action = await createAction('L2HopBridger', mimic, owner, smartVault)
  })

  beforeEach('deploy token and amm mock', async () => {
    token = await createTokenMock()
    hopL2Amm = await deploy(MOCKS.HOP_L2_AMM, [token.address, token.address])
  })

  beforeEach('authorize action', async () => {
    const bridgeRole = smartVault.interface.getSighash('bridge')
    await smartVault.connect(owner).authorize(action.address, bridgeRole)
    const withdrawRole = smartVault.interface.getSighash('withdraw')
    await smartVault.connect(owner).authorize(action.address, withdrawRole)
  })

  describe('setTokenAmm', () => {
    context('when the sender is authorized', () => {
      beforeEach('set sender', async () => {
        const setTokenAmmRole = action.interface.getSighash('setTokenAmm')
        await action.connect(owner).authorize(owner.address, setTokenAmmRole)
        action = action.connect(owner)
      })

      context('when the token address is not zero', () => {
        context('when the amm canonical token matches', () => {
          context('when setting the token amm', () => {
            const itSetsTheTokenAmm = () => {
              it('sets the token amm', async () => {
                await action.setTokenAmm(token.address, hopL2Amm.address)

                expect(await action.getTokenAmm(token.address)).to.be.equal(hopL2Amm.address)
              })

              it('emits an event', async () => {
                const tx = await action.setTokenAmm(token.address, hopL2Amm.address)

                await assertEvent(tx, 'TokenAmmSet', { token, amm: hopL2Amm.address })
              })
            }

            context('when the token amm was set', () => {
              beforeEach('set token amm', async () => {
                await action.setTokenAmm(token.address, hopL2Amm.address)
              })

              itSetsTheTokenAmm()
            })

            context('when the token amm was not set', () => {
              beforeEach('unset token amm', async () => {
                await action.setTokenAmm(token.address, ZERO_ADDRESS)
              })

              itSetsTheTokenAmm()
            })
          })

          context('when unsetting the token amm', () => {
            const itUnsetsTheTokenAmm = () => {
              it('unsets the token amm', async () => {
                await action.setTokenAmm(token.address, ZERO_ADDRESS)

                expect(await action.getTokenAmm(token.address)).to.be.equal(ZERO_ADDRESS)
              })

              it('emits an event', async () => {
                const tx = await action.setTokenAmm(token.address, ZERO_ADDRESS)

                await assertEvent(tx, 'TokenAmmSet', { token, amm: ZERO_ADDRESS })
              })
            }

            context('when the token amm was set', () => {
              beforeEach('set token amm', async () => {
                await action.setTokenAmm(token.address, hopL2Amm.address)
              })

              itUnsetsTheTokenAmm()
            })

            context('when the token was not set', () => {
              beforeEach('unset token amm', async () => {
                await action.setTokenAmm(token.address, ZERO_ADDRESS)
              })

              itUnsetsTheTokenAmm()
            })
          })
        })

        context('when the amm canonical token matches', () => {
          beforeEach('deploy another amm', async () => {
            hopL2Amm = await deploy(MOCKS.HOP_L2_AMM, [owner.address, owner.address])
          })

          it('reverts', async () => {
            await expect(action.setTokenAmm(token.address, hopL2Amm.address)).to.be.revertedWith(
              'BRIDGER_AMM_TOKEN_DOES_NOT_MATCH'
            )
          })
        })
      })

      context('when the token address is zero', () => {
        const token = ZERO_ADDRESS

        it('reverts', async () => {
          await expect(action.setTokenAmm(token, hopL2Amm.address)).to.be.revertedWith('BRIDGER_TOKEN_ZERO')
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', () => {
        action = action.connect(other)
      })

      it('reverts', async () => {
        await expect(action.setTokenAmm(token.address, hopL2Amm.address)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('setAllowedChain', () => {
    context('when the sender is authorized', () => {
      beforeEach('set sender', async () => {
        const setAllowedChainRole = action.interface.getSighash('setAllowedChain')
        await action.connect(owner).authorize(owner.address, setAllowedChainRole)
        action = action.connect(owner)
      })

      context('when the chain ID is not zero', () => {
        context('when the chain ID is not the current one', () => {
          const chainId = 1

          const itConfigsTheChainCorrectly = (allowed: boolean) => {
            it(`${allowed ? 'allows' : 'disallows'} the chain ID`, async () => {
              await action.setAllowedChain(chainId, allowed)

              expect(await action.isChainAllowed(chainId)).to.be.equal(allowed)
            })

            it('emits an event', async () => {
              const tx = await action.setAllowedChain(chainId, allowed)

              await assertEvent(tx, 'AllowedChainSet', { chainId, allowed })
            })
          }

          context('when allowing the chain', () => {
            const allowed = true

            context('when the chain was allowed', () => {
              beforeEach('allow the chain', async () => {
                await action.setAllowedChain(chainId, true)
              })

              itConfigsTheChainCorrectly(allowed)
            })

            context('when the chain was not allowed', () => {
              beforeEach('disallow the chain', async () => {
                await action.setAllowedChain(chainId, false)
              })

              itConfigsTheChainCorrectly(allowed)
            })
          })

          context('when disallowing the chain', () => {
            const allowed = false

            context('when the chain was allowed', () => {
              beforeEach('allow the chain', async () => {
                await action.setAllowedChain(chainId, true)
              })

              itConfigsTheChainCorrectly(allowed)
            })

            context('when the chain was not allowed', () => {
              beforeEach('disallow the chain', async () => {
                await action.setAllowedChain(chainId, false)
              })

              itConfigsTheChainCorrectly(allowed)
            })
          })
        })

        context('when the chain ID is the current one', () => {
          const chainId = 31337 // Hardhat chain ID

          it('reverts', async () => {
            await expect(action.setAllowedChain(chainId, true)).to.be.revertedWith('BRIDGER_SAME_CHAIN_ID')
          })
        })
      })

      context('when the chain ID is zero', () => {
        const chainId = 0

        it('reverts', async () => {
          await expect(action.setAllowedChain(chainId, true)).to.be.revertedWith('BRIDGER_CHAIN_ID_ZERO')
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', () => {
        action = action.connect(other)
      })

      it('reverts', async () => {
        await expect(action.setAllowedChain(1, true)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('setMaxSlippage', () => {
    context('when the sender is authorized', () => {
      beforeEach('set sender', async () => {
        const setMaxSlippageRole = action.interface.getSighash('setMaxSlippage')
        await action.connect(owner).authorize(owner.address, setMaxSlippageRole)
        action = action.connect(owner)
      })

      context('when the slippage is not above one', () => {
        const slippage = fp(1)

        it('sets the slippage', async () => {
          await action.setMaxSlippage(slippage)

          expect(await action.maxSlippage()).to.be.equal(slippage)
        })

        it('emits an event', async () => {
          const tx = await action.setMaxSlippage(slippage)

          await assertEvent(tx, 'MaxSlippageSet', { maxSlippage: slippage })
        })
      })

      context('when the slippage is above one', () => {
        const slippage = fp(1).add(1)

        it('reverts', async () => {
          await expect(action.setMaxSlippage(slippage)).to.be.revertedWith('BRIDGER_SLIPPAGE_ABOVE_ONE')
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', () => {
        action = action.connect(other)
      })

      it('reverts', async () => {
        await expect(action.setMaxSlippage(1)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('setMaxBonderFeePct', () => {
    context('when the sender is authorized', () => {
      beforeEach('set sender', async () => {
        const setMaxBonderFeePctRole = action.interface.getSighash('setMaxBonderFeePct')
        await action.connect(owner).authorize(owner.address, setMaxBonderFeePctRole)
        action = action.connect(owner)
      })

      context('when the pct is not above one', () => {
        const pct = fp(0.1)

        it('sets the bonder fee pct', async () => {
          await action.setMaxBonderFeePct(pct)

          expect(await action.maxBonderFeePct()).to.be.equal(pct)
        })

        it('emits an event', async () => {
          const tx = await action.setMaxBonderFeePct(pct)

          await assertEvent(tx, 'MaxBonderFeePctSet', { maxBonderFeePct: pct })
        })
      })

      context('when the pct is above one', () => {
        const pct = fp(1).add(1)

        it('reverts', async () => {
          await expect(action.setMaxBonderFeePct(pct)).to.be.revertedWith('BRIDGER_BONDER_FEE_PCT_ABOVE_ONE')
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', () => {
        action = action.connect(other)
      })

      it('reverts', async () => {
        await expect(action.setMaxBonderFeePct(1)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('setMaxDeadline', () => {
    context('when the sender is authorized', () => {
      beforeEach('set sender', async () => {
        const setMaxDeadlineRole = action.interface.getSighash('setMaxDeadline')
        await action.connect(owner).authorize(owner.address, setMaxDeadlineRole)
        action = action.connect(owner)
      })

      context('when the deadline is not zero', () => {
        const deadline = 60 * 60

        it('sets the slippage', async () => {
          await action.setMaxDeadline(deadline)

          expect(await action.maxDeadline()).to.be.equal(deadline)
        })

        it('emits an event', async () => {
          const tx = await action.setMaxDeadline(deadline)

          await assertEvent(tx, 'MaxDeadlineSet', { maxDeadline: deadline })
        })
      })

      context('when the deadline is zero', () => {
        const deadline = 0

        it('reverts', async () => {
          await expect(action.setMaxDeadline(deadline)).to.be.revertedWith('BRIDGER_MAX_DEADLINE_ZERO')
        })
      })
    })

    context('when the sender is not authorized', () => {
      beforeEach('set sender', () => {
        action = action.connect(other)
      })

      it('reverts', async () => {
        await expect(action.setMaxDeadline(1)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })

  describe('call', () => {
    const SOURCE = 0
    const CHAIN_ID = 1
    const SLIPPAGE = fp(0.01)
    const BONDER_FEE_PCT = fp(0.002)

    const THRESHOLD = fp(50)

    beforeEach('fund smart vault to pay gas', async () => {
      await mimic.wrappedNativeToken.connect(owner).deposit({ value: fp(1) })
      await mimic.wrappedNativeToken.connect(owner).transfer(smartVault.address, fp(1))
    })

    beforeEach('set threshold', async () => {
      const setThresholdRole = action.interface.getSighash('setThreshold')
      await action.connect(owner).authorize(owner.address, setThresholdRole)
      await action.connect(owner).setThreshold(token.address, THRESHOLD)
    })

    context('when the sender is authorized', () => {
      beforeEach('set sender', async () => {
        const callRole = action.interface.getSighash('call')
        await action.connect(owner).authorize(owner.address, callRole)
        action = action.connect(owner)
      })

      context('when the sender is not a relayer', () => {
        context('when the given token has an AMM set', () => {
          beforeEach('set token AMM', async () => {
            const setTokenAmmRole = action.interface.getSighash('setTokenAmm')
            await action.connect(owner).authorize(owner.address, setTokenAmmRole)
            await action.connect(owner).setTokenAmm(token.address, hopL2Amm.address)
          })

          context('when the chainId is allowed', () => {
            beforeEach('allow chain ID', async () => {
              const setAllowedChainRole = action.interface.getSighash('setAllowedChain')
              await action.connect(owner).authorize(owner.address, setAllowedChainRole)
              await action.connect(owner).setAllowedChain(CHAIN_ID, true)
            })

            context('when the slippage is below the limit', () => {
              beforeEach('set max slippage', async () => {
                const setMaxSlippageRole = action.interface.getSighash('setMaxSlippage')
                await action.connect(owner).authorize(owner.address, setMaxSlippageRole)
                await action.connect(owner).setMaxSlippage(SLIPPAGE)
              })

              context('when the bonder fee is below the limit', () => {
                beforeEach('set max bonder fee', async () => {
                  const setMaxBonderFeePctRole = action.interface.getSighash('setMaxBonderFeePct')
                  await action.connect(owner).authorize(owner.address, setMaxBonderFeePctRole)
                  await action.connect(owner).setMaxBonderFeePct(BONDER_FEE_PCT)
                })

                context('when the current balance passes the threshold', () => {
                  const balance = THRESHOLD
                  const bonderFee = balance.mul(BONDER_FEE_PCT).div(fp(1))

                  beforeEach('fund smart vault token', async () => {
                    await token.mint(smartVault.address, balance)
                  })

                  it('can executes', async () => {
                    const canExecute = await action.canExecute(CHAIN_ID, token.address, balance, SLIPPAGE, bonderFee)
                    expect(canExecute).to.be.true
                  })

                  it('calls the bridge primitive', async () => {
                    const tx = await action.call(CHAIN_ID, token.address, balance, SLIPPAGE, bonderFee)

                    const data = defaultAbiCoder.encode(['address', 'uint256'], [hopL2Amm.address, bonderFee])

                    await assertIndirectEvent(tx, smartVault.interface, 'Bridge', {
                      source: SOURCE,
                      chainId: CHAIN_ID,
                      amountIn: balance,
                      minAmountOut: balance.sub(balance.mul(SLIPPAGE).div(fp(1))),
                      data,
                    })
                  })

                  it('emits an Executed event', async () => {
                    const tx = await action.call(CHAIN_ID, token.address, balance, SLIPPAGE, bonderFee)

                    await assertEvent(tx, 'Executed')
                  })
                })

                context('when the current balance does not pass the threshold', () => {
                  const balance = THRESHOLD.div(2)

                  beforeEach('fund smart vault token', async () => {
                    await token.mint(smartVault.address, balance)
                  })

                  it('reverts', async () => {
                    await expect(
                      action.call(CHAIN_ID, token.address, balance, SLIPPAGE, BONDER_FEE_PCT)
                    ).to.be.revertedWith('MIN_THRESHOLD_NOT_MET')
                  })
                })
              })

              context('when the bonder fee is above the limit', () => {
                const balance = fp(1)
                const bonderFee = fp(1)

                it('reverts', async () => {
                  await expect(action.call(CHAIN_ID, token.address, balance, SLIPPAGE, bonderFee)).to.be.revertedWith(
                    'BRIDGER_BONDER_FEE_ABOVE_MAX'
                  )
                })
              })
            })

            context('when the slippage is above the limit', () => {
              it('reverts', async () => {
                await expect(action.call(CHAIN_ID, token.address, 0, SLIPPAGE, 0)).to.be.revertedWith(
                  'BRIDGER_SLIPPAGE_ABOVE_MAX'
                )
              })
            })
          })

          context('when the chain ID is not allowed', () => {
            it('reverts', async () => {
              await expect(action.call(CHAIN_ID, token.address, 0, SLIPPAGE, 0)).to.be.revertedWith(
                'BRIDGER_CHAIN_NOT_ALLOWED'
              )
            })
          })
        })

        context('when the given token does not have an AMM set', () => {
          it('reverts', async () => {
            await expect(action.call(CHAIN_ID, token.address, 0, SLIPPAGE, 0)).to.be.revertedWith(
              'BRIDGER_TOKEN_AMM_NOT_SET'
            )
          })
        })
      })
    })

    context('when the sender is authorized', () => {
      it('reverts', async () => {
        await expect(action.call(CHAIN_ID, token.address, 0, SLIPPAGE, 0)).to.be.revertedWith('AUTH_SENDER_NOT_ALLOWED')
      })
    })
  })
})
