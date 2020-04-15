'use strict'
const transactionalMails = require('@ecomplus/transactional-mails')
const triggerActions = require('./trigger-actions')
const emailSender = require('./email-sender')
const getConfig = require(process.cwd() + '/lib/store-api/get-config')
const moment = require('moment')
const logger = require('console-files')
const sqlite = require('sqlite3').verbose()

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
    const amazonTable = `CREATE TABLE IF NOT EXISTS amazon_notifications (
      problem_type  STRING NOT NULL,
      email_address STRING NOT NULL
    );`

    db.run(amazonTable, err => {
      if (err) {
        error(err)
      }
    })

    const ecomTable = `CREATE TABLE IF NOT EXISTS ecomplus_cart_watch (
      id              INTEGER    PRIMARY KEY AUTOINCREMENT NOT NULL,
      cart_id         STRING     NOT NULL UNIQUE,
      store_id        INTEGER    NOT NULL,
      created_at      DATETIME,
      customers_ids   STRING     NOT NULL,
      send            INTEGER    DEFAULT (0)
    );`

    db.run(ecomTable, err => {
      if (err) {
        error(err)
      }
    })
  }
})

module.exports = appSdk => {
  logger.log('--> Carts abandoned')
  const task = () => new Promise((resolve, reject) => {
    getStores()
      .then(stores => {
        mpStore(appSdk, stores, (configObj, storeId, next, task, err) => {
          if (!err && storeId) {
            if (!configObj.is_abandoned_after_days) {
              return next()
            }

            const lang = (configObj.lang && configObj.lang === 'Inglês') ? 'en_us' : 'pt_br'

            return getCarts(storeId)
              .then(carts => {
                if (carts.length) {
                  const promises = []
                  for (let i = 0; i < carts.length; i++) {
                    let createdAt = moment(carts[i].created_at)
                    let finalDate = moment().diff(createdAt, 'days')
                    if (finalDate >= configObj.is_abandoned_after_days) {
                      const url = `carts/${carts[i].cart_id}.json`
                      const promise = appSdk
                        .apiRequest(storeId, url)
                        .then(resp => resp.response.data)

                        .then(cart => {
                          const { available, completed } = cart
                          if (available === true && completed === false) {
                            // send email
                            return cart
                          } else if (available === true && completed === true) {
                            // remove from database
                            // trow err to pass cart
                            db.run('delete from ecomplus_cart_watch where store_id = ? and id = ?', [storeId, carts[i].id], err => {
                              if (!err) {
                                logger.log(`> cart ${carts[i].id} deleted / status: completed /${storeId}`)
                                const err = new Error('Cart completed')
                                err.code = 'SkipCard'
                                throw err
                              }
                            })
                          }
                        })

                        .then(cart => {
                          // get store data
                          return appSdk
                            .apiRequest(storeId, '/stores/me.json', 'GET')
                            .then(resp => resp.response.data)
                            .then(store => ({ store, cart }))
                        })

                        .then(({ store, cart }) => {
                          const { customers } = cart
                          const { name } = store
                          const requests = []
                          customers.forEach(current => {
                            let url = `customers/${current}.json`
                            let req = appSdk
                              .apiRequest(storeId, url)
                              .then(resp => resp.response.data)
                              .then(customer => {
                                return transactionalMails
                                  .abandonedCart(store, customer, cart, lang)
                                  .then(html => ({ html, customer }))
                              })
                              .then(({ html, customer }) => {
                                const subject = triggerActions.abandonedCart.subject[lang]
                                const from = configObj.lojista_mail
                                const to = customer.main_email
                                const cc = from
                                const options = {
                                  html,
                                  from,
                                  to,
                                  cc,
                                  storeName: name,
                                  subject
                                }
                                if (configObj.abandoned_cart) {
                                  if (configObj.abandoned_cart.disable_customer) {
                                    delete options.to
                                  }

                                  if (configObj.abandoned_cart.disable_merchant) {
                                    delete options.cc
                                  }
                                }

                                return emailSender(options)
                              })
                              .then(() => {
                                logger.log(`✓ E-mail sent / cart abandoned / #${cart._id} / #${storeId}`)
                                db.run('delete from ecomplus_cart_watch where store_id = ? and id = ?', [storeId, carts[i].id], err => {
                                  if (!err) {
                                    logger.log(`✓ cart ${carts[i].id} deleted / notification Ok /${storeId}`)
                                  }
                                })
                              })
                            requests.push(req)
                          })

                          return Promise.all(requests)
                        })

                        .catch(err => {
                          if (err.code !== 'SkipCard') {
                            logger.error('CartsAbadonedErr', err)
                          }
                        })

                      promises.push(promise)
                    }
                  }

                  return Promise.all(promises).then(() => next())
                } else {
                  return next()
                }
              })
              .catch(e => {
                logger.error('CartsAbadonedErrors', e)
              })
          } else if (err && storeId) {
            return next()
          } else if (!next && !err && !storeId && !configObj) {
            resolve()
          }
        })
      })
      .catch(e => {
        logger.error('CartsAbadonedErrors', e)
      })
  })

  // restart after 15m
  const start = () => task().finally(() => setTimeout(() => start(), 5 * 60 * 1000))
  // init after 30s
  setTimeout(() => task(), 1 * 60 * 1000)
}

const getStores = () => new Promise((resolve, reject) => {
  const query = 'SELECT DISTINCT store_id FROM ecomplus_app_auth ORDER BY created_at DESC'
  db.all(query, (err, rows) => {
    if (err) {
      reject(new Error(err.message))
    }
    if (rows) {
      rows = rows.map(row => row.store_id)
    }
    resolve(rows)
  })
})

const getCarts = storeId => new Promise((resolve, reject) => {
  const query = 'SELECT * FROM ecomplus_cart_watch WHERE send = ? AND store_id = ?'
  db.all(query, [0, storeId], (err, rows) => {
    if (err) {
      reject(new Error(err))
    }
    resolve(rows)
  })
})

const mpStore = (appSdk, stores, callback) => {
  let index = 0
  let storeId
  let retry = 0

  const next = () => {
    index++
    return task(stores, callback)
  }

  const task = (stores, callback) => {
    if (stores && stores[index]) {
      storeId = stores[index]
      getConfig({ appSdk, storeId }, true)
        .then(configObj => {
          callback(configObj, storeId, next, task, null)
        })
        .catch(e => {
          if (e.response && e.response.status >= 500) {
            if (retry <= 5) {
              setTimeout(() => {
                task(stores, callback)
              }, 4000)
            } else {
              next()
            }
          } else {
            let error
            if (e.response && e.response.data) {
              error = e.response.data
            } else {
              error = e.message
            }
            callback(null, storeId, next, task, error)
          }
        })
    } else {
      return callback(null, null, null, null)
    }
  }

  return task(stores, callback)
}
