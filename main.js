'use strict'

const logger = require('console-files')
const sqlite = require('sqlite3').verbose()
const bodyParser = require('body-parser')
const { ecomAuth, setup } = require('ecomplus-app-sdk')
const express = require('express')
const app = express()
const port = process.env.PORT || 4222

const db = new sqlite.Database(process.env.ECOM_AUTH_DB, err => {
  const error = err => {
    // debug and destroy Node process
    logger.error(err)
    process.exit(1)
  }

  if (err) {
    error(err)
  } else {
    // try to run first query creating table
    db.run(
      `CREATE TABLE IF NOT EXISTS amazon_notifications (
        problem_type  STRING NOT NULL,
        email_address STRING NOT NULL
    );`, err => {
        if (err) {
          error(err)
        }
      })
  }
})

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

app.use(require('./lib/routes')({ ecomAuth, db }))

app.listen(port)
logger.log(`--> Starting web app on port :${port}`)

// daemon processes
// prevent running background process on multiple servers
if (process.env.SCHEDULED_DEPLOYS === 'true' || process.env.SCHEDULED_DEPLOYS === true) {
  require('./lib/services/cart-is-abandoned')({ ecomAuth, db })
  require('./lib/services/setup-procedures')
}
