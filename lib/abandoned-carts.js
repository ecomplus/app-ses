'use strict'
const transactionalMails = require('@ecomplus/transactional-mails')
const triggerActions = require('./trigger-actions')
const sendMail = require('./send-mails')
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
          const storeId = rows.store_id
          let createdAt = moment(rows.created_at)
          let finalDate = moment().diff(createdAt, 'days')
          // get app configured options
          getConfig({ appSdk, storeId })

            .then(async configObj => {
              if (configObj && configObj.is_abandoned_after_days && finalDate >= configObj.is_abandoned_after_days) {
                let lang = configObj.lang || 'pt_br'
                let cartId = rows.cart_id
                let url = `carts/${cartId}.json`

                const cart = await appSdk.apiRequest(storeId, url).then(resp => resp.response.data)

                if (cart.available === true && !cart.completed === false) {
                  // find customers to send email
                  const customers = JSON.parse(rows.customers_ids)
                  const store = await appSdk.apiRequest(storeId, '/stores/me.json', 'GET').then(resp => resp.response.data)

                  for (let i = 0; i < customers.length; i++) {
                    url = `customers/${customers[i]}.json`
                    const customer = await appSdk.apiRequest(storeId, url).then(resp => resp.response.data)

                    transactionalMails.abandonedCart(store, customer, cart, lang)
                      .then(html => {
                        let isEnabled = false

                        // check if transactional mail is enable ta sent
                        if (configObj.hasOwnProperty('transaction_mail')) {
                          isEnabled = configObj.transaction_mail.find(transaction => transaction.trigger === 'abandonedCart')
                        }

                        if (isEnabled) {
                          let subject = triggerActions.abandonedCart.subject[lang]
                          let enableTo = isEnabled.to || {}
                          let from = configObj.lojista_mail
                          let to = customer.main_email
                          let cc

                          if (enableTo.customer) {
                            if (enableTo.storekeeper) {
                              cc = from
                            }
                            return sendMail(html, to, from, cc, store.name, subject)
                              .then((info) => {
                                logger.log(`[!]: ${subject} | abandonedCart | #${storeId}`)

                                db.run('DELETE FROM ecomplus_cart_watch WHERE cart_id = ? AND store_id = ?', [cartId, storeId], err => {
                                  if (err) {
                                    logger.error(err)
                                  }
                                })
                              })
                          }
                        }
                      })
                  }
                }
              }
            })

            .catch(err => {
              logger.error('DispatchAbandonedCartErr', err)
            })
        } else {
          logger.error('AbandonedCartErr', err)
        }
      })
    }

    // check if you need to create table
    task()
    let interval = 1000 * 60 * 60 * 24
    setInterval(task, interval)
  })
}
