'use strict'
const transactionalMails = require('@ecomplus/transactional-mails')
const applicationActions = require('./trigger-actions')
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
    db.run(
      `CREATE TABLE IF NOT EXISTS amazon_notifications (
        problem_type  STRING NOT NULL,
        email_address STRING NOT NULL
    );`, err => {
        if (err) {
          error(err)
        }
      })

    db.run(
      `CREATE TABLE IF NOT EXISTS ecomplus_cart_watch (
        id              INTEGER    PRIMARY KEY AUTOINCREMENT NOT NULL,
        cart_id         STRING     NOT NULL UNIQUE,
        store_id        INTEGER    NOT NULL,
        created_at      DATETIME,
        customers_ids   STRING     NOT NULL,
        send            INTEGER    DEFAULT (0)
      );`, err => {
        if (err) {
          error(err)
        }
      })
  }
})

module.exports = ({ ecomAuth }) => {
  console.log('--> Start checking abandoned carts')
  ecomAuth.then(appSdk => {
    const task = () => {
      let query = 'SELECT cart_id, store_id, customers_ids, created_at FROM ecomplus_cart_watch WHERE send = ?'
      db.each(query, [0], (err, rows) => {
        if (!err) {
          try {
            const storeId = rows.store_id
            let createdAt = moment(rows.created_at)
            let finalDate = moment().diff(createdAt, 'days')
            if (finalDate >= 3) {
              // get app configured options
              getConfig({ appSdk, storeId })

                .then(async configObj => {
                  let lang = configObj.lang || 'pt_br'
                  let cartId = rows.cart_id
                  let apiPath = `carts/${cartId}.json`
                  let method = 'GET'

                  let result = await appSdk.apiRequest(storeId, apiPath, method)
                  let cart = result.response.data

                  if (cart.available === true && cart.completed === false) {
                    // find customers to send email
                    let customers = JSON.parse(rows.customers_ids)

                    let store = await appSdk.apiRequest(storeId, '/stores/me.json', 'GET')
                    store = store.response.data

                    for (let i = 0; i < customers.length; i++) {
                      let apiResource = `customers/${customers[i]}.json`
                      let customer = await appSdk.apiRequest(storeId, apiResource, method)
                      customer = customer.response.data

                      transactionalMails.abandonedCart(store, customer, cart, lang)
                        .then(html => {
                          let isEnabled = false

                          // check if transactional mail is enable ta sent
                          if (configObj.hasOwnProperty('transaction_mail')) {
                            isEnabled = configObj.transaction_mail.find(transaction => transaction.trigger === 'abandonedCart')
                          }

                          if (isEnabled) {
                            // mail is enable to sent?
                            let appAction = applicationActions.find(application => application.action === 'abandonedCart')

                            if (appAction) {
                              let from = configObj.lojista_mail
                              let subject = appAction.subject[lang]
                              if (isEnabled.to.hasOwnProperty('customer') && isEnabled.to.customer === true) {
                                let to = customer.main_email
                                require('./send-mails')()(html, to, from, subject)
                              }

                              if (isEnabled.to.hasOwnProperty('storekeeper') && isEnabled.to.storekeeper === true) {
                                require('./send-mails')()(html, from, from, subject)
                              }

                              db.run(
                                'DELETE FROM ecomplus_cart_watch WHERE cart_id = ? AND store_id = ?',
                                [cartId, storeId],
                                err => {
                                  if (err) {
                                    logger.error(err)
                                  }
                                }
                              )
                            }
                          }
                        })
                    }
                  }
                })

                .catch(err => {
                  console.error(err)
                })
            }
          } catch (error) {
            console.error(error)
          }
        } else {
          logger.error(err)
        }
      })
    }

    // check if you need to create table
    task()
    let interval = 2 * 60 * 1000
    setInterval(task, interval)
  })
}
