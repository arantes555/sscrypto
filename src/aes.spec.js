/* eslint-env mocha */

import { SymKey as SymKeyForge } from './aes-forge'
import { SymKey as SymKeyNode } from './aes-node'
import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import * as crypto from 'crypto'
import { _streamHelper, splitLength } from './specUtils.spec'
import multipipe from 'multipipe'

chai.use(chaiAsPromised)
const { assert, expect } = chai

for (const [name, SymKey] of Object.entries({ 'forge': SymKeyForge, 'node': SymKeyNode })) {
  describe(`AES ${name}`, () => {
    const key128 = new SymKey(128)
    const key192 = new SymKey(192)
    const key256 = new SymKey(256)
    const badKey = new SymKey(256)

    const message = Buffer.from('TESTtest', 'ascii')
    const messageUtf8 = 'Iñtërnâtiônàlizætiøn\u2603\uD83D\uDCA9'
    const messageBinary = crypto.randomBytes(100)

    it('Try creating a key with an invalid type in constructor', () => {
      expect(() => new SymKey({ thisIs: 'NotAValidType' })).to.throw(Error).and.satisfy(error => {
        assert.include(error.message, 'INVALID_ARG')
        return true
      })
    })

    it('Try creating a key with an invalid size', () => {
      expect(() => new SymKey(42)).to.throw(Error).and.satisfy(error => {
        assert.include(error.message, 'INVALID_ARG')
        return true
      })
    })

    it('Try creating a key with an invalid size buffer', () => {
      expect(() => new SymKey(Buffer.from('zkejglzeigh', 'binary'))).to.throw(Error).and.satisfy(error => {
        assert.include(error.message, 'INVALID_ARG')
        return true
      })
    })

    it('Try deciphering a cipherText with invalid HMAC', () => {
      const cipheredMessage = key256.encrypt(message)
      expect(() => key256.decrypt(cipheredMessage.slice(0, -1))).to.throw(Error).and.satisfy(error => {
        assert.include(error.message, 'INVALID_HMAC')
        return true
      })
    })

    it('cipher & decipher 128', () => {
      const cipheredMessage = key128.encrypt(message)
      const decipheredMessage = key128.decrypt(cipheredMessage)
      assert.isTrue(message.equals(decipheredMessage))
    })

    it('cipher & decipher 192', () => {
      const cipheredMessage = key192.encrypt(message)
      const decipheredMessage = key192.decrypt(cipheredMessage)
      assert.isTrue(message.equals(decipheredMessage))
    })

    it('cipher & decipher 256', () => {
      const cipheredMessage = key256.encrypt(message)
      const decipheredMessage = key256.decrypt(cipheredMessage)
      assert.isTrue(message.equals(decipheredMessage))
    })

    it('cipher & decipher UTF8', () => {
      const cipheredMessage = key256.encrypt(Buffer.from(messageUtf8, 'utf8'))
      const decipheredMessage = key256.decrypt(cipheredMessage).toString('utf8')
      assert.strictEqual(messageUtf8, decipheredMessage)
    })

    it('cipher & decipher Binary', () => {
      const cipheredMessage = key256.encrypt(messageBinary)
      const decipheredMessage = key256.decrypt(cipheredMessage)
      assert.isTrue(messageBinary.equals(decipheredMessage))
    })

    it('fail with bad key', () => {
      const cipheredMessage = key256.encrypt(message)
      expect(() => badKey.decrypt(cipheredMessage)).to.throw(Error).and.satisfy(error => {
        assert.include(error.message, 'INVALID_HMAC')
        return true
      })
    })

    it('serialize and import key', () => {
      const cipheredMessage = key256.encrypt(message)
      const exportedKey = key256.toB64()
      const importedKey = SymKey.fromB64(exportedKey)
      const decipheredMessage = importedKey.decrypt(cipheredMessage)
      assert.isTrue(message.equals(decipheredMessage))
    })

    it('cipher stream & decipher', () => {
      const input = crypto.randomBytes(100)
      const chunks = splitLength(input, 20)

      const cipher = key256.encryptStream()

      return _streamHelper(chunks, cipher).then((output) => {
        assert.isTrue(key256.decrypt(output).equals(input))
      })
    })

    it('cipher & decipher stream', () => {
      const clearText = crypto.randomBytes(1000)
      const cipherText = key256.encrypt(clearText)
      const cipherChunks = splitLength(cipherText, 15)
      const decipher = key256.decryptStream()

      return _streamHelper(cipherChunks, decipher).then((output) => {
        assert.isTrue(output.equals(clearText))
      })
    })

    it('cipher stream & decipher stream', () => {
      const input = crypto.randomBytes(100)
      const chunks = splitLength(input, 20)

      const cipher = key256.encryptStream()
      const decipher = key256.decryptStream()

      return _streamHelper(chunks, multipipe(cipher, decipher))
        .then(output => {
          assert.isTrue(output.equals(input))
        })
    })

    it('Try deciphering a stream with a cipherText with invalid HMAC', () => {
      const cipheredMessage = key256.encrypt(message).slice(0, -1)
      const cipherChunks = splitLength(cipheredMessage, 15)
      const decipher = key256.decryptStream()
      return expect(_streamHelper(cipherChunks, decipher)).to.be.rejectedWith(Error).and.eventually.satisfy(error => {
        assert.include(error.message, 'INVALID_HMAC')
        return true
      })
    })

    it('Test encryptStream cancel and progress', async () => {
      const size = 200
      const input = crypto.randomBytes(size)
      const chunks = splitLength(input, 20)

      let progress

      const error = await new Promise(async (resolve, reject) => {
        const stream = key256.encryptStream()
          .on('end', reject)
          .on('error', resolve)
          .on('progress', _progress => {
            progress = _progress
          })
        for (const chunk of chunks) stream.write(chunk)
        stream.emit('cancel')
        for (const chunk of chunks) stream.write(chunk)
      })
      if (!progress) throw new Error('Stream hasn\'t worked at all')
      if (progress > size) throw new Error('Stream has\'t been canceled')
      assert.include(error.message, 'STREAM_CANCELED')
    })

    it('Test decryptStream cancel and progress', async () => {
      const size = 200
      const input = crypto.randomBytes(size)
      const chunks = splitLength(input, 20)

      let progress

      const error = await new Promise(async (resolve, reject) => {
        const stream = key256.decryptStream()
          .on('end', reject)
          .on('error', resolve)
          .on('progress', _progress => {
            progress = _progress
          })
        for (const chunk of chunks) stream.write(chunk)
        stream.emit('cancel')
        for (const chunk of chunks) stream.write(chunk)
      })
      if (!progress) throw new Error('Stream hasn\'t worked at all')
      if (progress > size) throw new Error('Stream has\'t been canceled')
      assert.include(error.message, 'STREAM_CANCELED')
    })
  })
}

describe('AES node/forge', () => {
  const keyNode = new SymKeyNode(256)
  const keyForge = SymKeyForge.fromString(keyNode.toString())

  const message = Buffer.from('TESTtest', 'ascii')

  it('cipher node & decipher forge', () => {
    const cipheredMessage = keyNode.encrypt(message)
    const decipheredMessage = keyForge.decrypt(cipheredMessage)
    assert.isTrue(message.equals(decipheredMessage))
  })

  it('cipher forge & decipher node', () => {
    const cipheredMessage = keyForge.encrypt(message)
    const decipheredMessage = keyNode.decrypt(cipheredMessage)
    assert.isTrue(message.equals(decipheredMessage))
  })

  it('cipher stream node & decipher stream forge', () => {
    const input = crypto.randomBytes(100)
    const chunks = splitLength(input, 20)

    const cipher = keyNode.encryptStream()
    const decipher = keyForge.decryptStream()

    return _streamHelper(chunks, multipipe(cipher, decipher))
      .then(output => {
        assert.isTrue(output.equals(input))
      })
  })

  it('cipher stream forge & decipher stream node', () => {
    const input = crypto.randomBytes(100)
    const chunks = splitLength(input, 20)

    const cipher = keyForge.encryptStream()
    const decipher = keyNode.decryptStream()

    return _streamHelper(chunks, multipipe(cipher, decipher))
      .then(output => {
        assert.isTrue(output.equals(input))
      })
  })
})