const { assertBn } = require('@aragon/contract-helpers-test/src/asserts')
const { getEventArgument, ZERO_ADDRESS } = require('@aragon/contract-helpers-test')

const { pad, ETH, hexConcat, toBN } = require('../test/helpers/utils')
const { deployDaoAndPool } = require('../test/scenario/helpers/deploy')

const StakingProvidersRegistry = artifacts.require('StakingProvidersRegistry')

console.log('toBN', toBN)

const arbitraryN = toBN('0x0159e2036050fb43f6ecaca13a7b53b23ea54a623e47fb2bd89a5b4a18da3295')
const withdrawalCredentials = pad('0x0202', 32)
const validatorData = []

async function main() {
  const addresses = await web3.eth.getAccounts()
  const [
    // the root account which deployed the DAO
    appManager,
    // the address which we use to simulate the voting DAO application
    voting,
    // staking providers
    stakingProvider,
    // users who deposit Ether to the pool
    user1,
    user2,
    // an unrelated address
    nobody
  ] = addresses

  const deployed = await deployDaoAndPool(appManager, voting, 100)
  const { pool, spRegistry } = deployed

  await pool.setFee(0.01 * 10000, { from: voting })
  await pool.setFeeDistribution(0.3 * 10000, 0.2 * 10000, 0.5 * 10000, { from: voting })
  await pool.setWithdrawalCredentials(withdrawalCredentials, { from: voting })

  const spValidatorsLimit = 1000
  const numProviders = 10
  const numKeys = 3

  for (let iProvider = 0; iProvider < numProviders; ++iProvider) {
    const spTx = await spRegistry.addStakingProvider(`SP-${iProvider}`, stakingProvider, spValidatorsLimit, { from: voting })
    const stakingProviderId = getEventArgument(spTx, 'StakingProviderAdded', 'id', { decodeForAbi: StakingProvidersRegistry._json.abi })

    const data = Array.from({ length: numKeys }, (_, iKey) => {
      const n = arbitraryN.clone().addn(10 * iKey + 1000 * iProvider)
      return {
        key: pad(`0x${n.toString(16)}`, 48, 'd'),
        sig: pad(`0x${n.toString(16)}`, 96, 'e')
      }
    })

    const keys = hexConcat(...data.map((v) => v.key))
    const sigs = hexConcat(...data.map((v) => v.sig))

    await spRegistry.addSigningKeys(stakingProviderId, numKeys, keys, sigs, { from: voting })

    const totalKeys = await spRegistry.getTotalSigningKeyCount(stakingProviderId, { from: nobody })
    assertBn(totalKeys, numKeys, 'total signing keys')

    validatorData.push.apply(validatorData, data)
  }

  for (let iProvider = 0; iProvider < numProviders; ++iProvider) {
    await pool.submit(ZERO_ADDRESS, { from: user1, value: ETH(33) })
  }

  await printTx(`pool.submit`, pool.submit(ZERO_ADDRESS, { from: user1, value: ETH(33) }))
}

async function printTx(name, promise) {
  const result = await promise
  console.log(`${name} tx hash:`, result.tx)
  return result
}

main()
  .catch((e) => console.error(e.stack))
  .then(() => process.exit(0))