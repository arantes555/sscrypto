/* eslint-env mocha */

import { utils as utilsForge } from '../forge'
import { utils as utilsNode } from '../node'
import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'

chai.use(chaiAsPromised)
const { assert } = chai

const knownHashes: { [key: string]: string } = {
  'test': '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
  'test2': '60303ae22b998861bce3b28f33eec1be758a213c86c93c076dbe9f558c11c752',
  'testTEST': '3a16f0fd02b75b2607d5157a73dab35453dbeb02cdca2d50b73392503e56c6dc'
}

const testUtilsImplem = (name: string, { sha256, randomBytes }: { sha256: (data: Buffer) => Buffer, randomBytes: (length: number) => Buffer }): void => {
  describe(`Utils ${name}`, () => {
    it('sha256', () => {
      for (const val in knownHashes) {
        const hash = sha256(Buffer.from(val, 'binary')).toString('hex')
        assert.strictEqual(hash, knownHashes[val])
      }
    })

    it('randomBytes', () => {
      for (let i = 0; i < 1000; i++) {
        const rand = randomBytes(i)
        const rand2 = randomBytes(i)
        assert.notStrictEqual(rand, rand2)
        assert.strictEqual(rand.length, i)
        assert.strictEqual(rand2.length, i)
      }
    })
  })
}
testUtilsImplem('node', utilsNode)
testUtilsImplem('forge', utilsForge)

describe('Utils node/forge', () => {
  it('sha256 & randomBytes', () => {
    const rand1 = utilsNode.randomBytes(1000)
    const rand2 = utilsForge.randomBytes(1000)

    const shaForge1 = utilsForge.sha256(rand1)
    const shaForge2 = utilsForge.sha256(rand2)
    const shaNode1 = utilsNode.sha256(rand1)
    const shaNode2 = utilsNode.sha256(rand2)

    assert.isOk(shaForge1.equals(shaNode1))
    assert.isOk(shaForge2.equals(shaNode2))
  })
})