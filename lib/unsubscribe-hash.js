'use strict'
const crypto = require('crypto')
const key = crypto.randomBytes(32)
const iv = crypto.randomBytes(16)

const encrypt = text => {
  let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), iv)
  let encrypted = cipher.update(text)
  encrypted = Buffer.concat([encrypted, cipher.final()])
  return { v: iv.toString('hex'), e: encrypted.toString('hex') }
}

const decrypt = (v, e) => {
  let iv = Buffer.from(v, 'hex')
  let encryptedText = Buffer.from(e, 'hex')
  let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), iv)
  let decrypted = decipher.update(encryptedText)
  decrypted = Buffer.concat([decrypted, decipher.final()])
  return decrypted.toString()
}

module.exports = {
  encrypt, decrypt
}
