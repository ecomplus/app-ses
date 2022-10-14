#!/usr/bin/env node

'use strict'

// log on files
const logger = require('console-files')
// handle app authentication to Store API
// https://github.com/ecomclub/ecomplus-app-sdk
const { ecomAuth } = require('@ecomplus/application-sdk')

logger.log('--> Start running daemon processes')

ecomAuth.then(appSdk => {
  // configure setup for stores
  // list of procedures to save
  const procedures = require('./../lib/store-api/procedures')
  if (procedures && procedures.length && procedures[0].triggers.length) {
    appSdk.configureSetup(procedures, (err, { storeId }) => {
      if (!err) {
        logger.log('--> Setup store #' + storeId)
      } else if (!err.appAuthRemoved) {
        logger.error(err)
      }
    })
  }
  // require('./../lib/carts-abandoned')(appSdk)
})

ecomAuth.catch(err => {
  logger.error(err)
  setTimeout(() => {
    // destroy Node process while Store API auth cannot be handled
    process.exit(1)
  }, 1000)
})

/* Run other app background processes here */
