import * as crypto from 'crypto'
import crc32 from 'crc-32'
import { convertDERToPEM, convertPEMToDER, intToBuffer, privateToPublic, publicKeyModel } from './utils'

const sha256 = (buffer: Buffer): string => {
  const md = crypto.createHash('sha256')
  md.update(buffer)
  return md.digest('hex')
}

/**
 * @class PublicKey
 * @property publicKey
 */
export class PublicKey {
  public publicKey: string // TODO: crypto.RsaPublicKey ?

  /**
   * PublicKey constructor. Should be given a Buffer containing a DER serialization of the key.
   * @constructs PublicKey
   * @param {Buffer} key
   */
  constructor (key: Buffer) {
    if (key) {
      if (Buffer.isBuffer(key)) {
        try {
          publicKeyModel.decode(key)
          this.publicKey = convertDERToPEM(key, 'RSA PUBLIC KEY')
        } catch (e) {
          throw new Error(`INVALID_KEY : ${e.message}`) // TODO
        }
      } else {
        throw new Error(`INVALID_KEY : Type of ${key} is ${typeof key}`)
      }
    }
  }

  /**
   * Returns a PublicKey from it's DER base64 serialization.
   * @method
   * @static
   * @param {string} b64DERFormattedPublicKey - a b64 encoded public key formatted with DER
   * @returns {PublicKey}
   */
  static fromB64 (b64DERFormattedPublicKey: string): PublicKey {
    return new PublicKey(Buffer.from(b64DERFormattedPublicKey, 'base64'))
  }

  /**
   * Serializes the key to DER format and encodes it in b64.
   * @method
   * @param {object} [options]
   * @returns {string}
   */
  toB64 (options: object = null): string {
    return convertPEMToDER(this.publicKey, 'RSA PUBLIC KEY').toString('base64')
  }

  /**
   * Encrypts a clearText for the Private Key corresponding to this PublicKey.
   * @method
   * @param {Buffer} clearText
   * @param {boolean} doCRC
   * @returns {Buffer}
   */
  encrypt (clearText: Buffer, doCRC: boolean = true): Buffer {
    const textToEncrypt = doCRC
      ? Buffer.concat([
        intToBuffer(crc32.buf(clearText)),
        clearText
      ])
      : clearText
    return crypto.publicEncrypt(
      {
        key: this.publicKey,
        // @ts-ignore
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING
      },
      textToEncrypt
    )
  }

  /**
   * Verify that the message has been signed with the Private Key corresponding to this PublicKey.
   * @param {Buffer} textToCheckAgainst
   * @param {Buffer} signature
   * @returns {boolean}
   */
  verify (textToCheckAgainst: Buffer, signature: Buffer): boolean {
    const verify = crypto.createVerify('SHA256')
    verify.update(textToCheckAgainst) // TODO: check if sha256(textToCheckAgainst) ?
    return verify.verify(this.publicKey, signature)
  }

  /**
   * @returns {string}
   */
  getHash (): string {
    return sha256(Buffer.from(this.toB64({ publicOnly: true }), 'ascii'))
  }

  /**
   * @returns {string}
   */
  getB64Hash (): string {
    return Buffer.from(this.getHash(), 'hex').toString('base64')
  }
}

export type AsymKeySize = 4096 | 2048 | 1024

/**
 * @class PrivateKey
 * @property privateKey
 * @property publicKey
 */
export class PrivateKey extends PublicKey {
  public privateKey: string

  /**
   * Private Key constructor. Shouldn't be used directly, use `fromB64` or `generate` static methods
   * @constructs PrivateKey
   * @param {Buffer} arg
   */
  constructor (arg: Buffer) {
    if (Buffer.isBuffer(arg)) {
      try {
        super(privateToPublic(arg))
        this.privateKey = convertDERToPEM(arg, 'RSA PRIVATE KEY')
      } catch (e) {
        throw new Error(`INVALID_KEY : ${e.message}`)
      }
    } else {
      throw new Error(`INVALID_KEY : Type of ${arg} is ${typeof arg}`)
    }
  }

  /**
   * Returns a PrivateKey from it's DER base64 serialization.
   * @method
   * @static
   * @param {string} b64DERFormattedPrivateKey - a b64 encoded private key formatted with DER
   * @returns {PrivateKey}
   */
  static fromB64 (b64DERFormattedPrivateKey: string): PrivateKey {
    return new PrivateKey(Buffer.from(b64DERFormattedPrivateKey, 'base64'))
  }

  /**
   * Generates a PrivateKey asynchronously
   * @param {Number} [size = 4096] - key size in bits
   * @returns {PrivateKey}
   */
  static async generate (size: AsymKeySize = 4096) {
    if (![4096, 2048, 1024].includes(size)) {
      throw new Error('INVALID_INPUT')
    } else {
      const privateKey = await new Promise((resolve: (key: Buffer) => void, reject) => {
        crypto.generateKeyPair(
          // @ts-ignore : node typing sucks
          'rsa',
          {
            modulusLength: size,
            publicKeyEncoding: { type: 'pkcs1', format: 'der' },
            privateKeyEncoding: { type: 'pkcs1', format: 'der' }
          },
          (err, publicKey, privateKey) => {
            if (err) return reject(err)
            resolve(privateKey)
          }
        )
      })
      return new PrivateKey(privateKey)
    }
  }

  /**
   * Serializes the key to DER format and encodes it in b64.
   * @method
   * @param {Object} options
   * @param {boolean} [options.publicOnly]
   * @returns {string}
   */
  toB64 ({ publicOnly = false } = {}): string {
    return publicOnly
      ? convertPEMToDER(this.publicKey, 'RSA PUBLIC KEY').toString('base64')
      : convertPEMToDER(this.privateKey, 'RSA PRIVATE KEY').toString('base64')
  }

  /**
   * Deciphers the given message.
   * @param {Buffer} cipherText
   * @param {boolean} [doCRC]
   * @returns {Buffer}
   */
  decrypt (cipherText: Buffer, doCRC: boolean = true): Buffer {
    let clearText
    try {
      clearText = crypto.privateDecrypt(
        {
          key: this.privateKey,
          // @ts-ignore
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING
        },
        cipherText
      )
    } catch (e) {
      throw new Error(`INVALID_CIPHER_TEXT : ${e.message}`)
    }
    if (!doCRC) {
      return clearText
    } else {
      const crc = clearText.slice(0, 4)
      const message = clearText.slice(4)
      const calculatedCRC = intToBuffer(crc32.buf(message))
      if (crc.equals(calculatedCRC)) {
        return message
      } else {
        throw new Error('INVALID_CRC32')
      }
    }
  }

  /**
   * Signs the given message with this Private Key.
   * @param {Buffer} textToSign
   * @returns {Buffer}
   */
  sign (textToSign: Buffer): Buffer {
    const sign = crypto.createSign('SHA256')
    sign.update(textToSign)
    return sign.sign(this.privateKey)
  }
}
