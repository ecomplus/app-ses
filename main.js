'use strict'

const bodyParser = require('body-parser')
const sqlite = require('sqlite3').verbose()
const { ecomAuth } = require('ecomplus-app-sdk')
const express = require('express')
const app = express()
const port = process.env.PORT || 3000

process.on('uncaughtException', (err) => {
  // fatal error
  // log to file before exit
  let msg = '\n[' + new Date().toString() + ']\n'
  if (err) {
    if (err.hasOwnProperty('stack')) {
      msg += err.stack
    } else if (err.hasOwnProperty('message')) {
      msg += err.message
    } else {
      msg += err.toString()
    }
    msg += '\n'
  }
  let fs = require('fs')
  fs.appendFile('./_stderr', msg, () => {
    process.exit(1)
  })
})

const db = new sqlite.Database(process.env.ECOM_AUTH_DB)

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())
app.use(require('./lib/routes')({ ecomAuth, db }))
app.listen(port)

// verificar carrinho abandonado
require('./lib/services/cart-is-abandoned')({ ecomAuth, db })
// regitra procedures
require('./lib/services/setup-procedures')
