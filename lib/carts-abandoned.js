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

const getCarts = () => new Promise((resolve, reject) => {
  const query = `SELECT * FROM ecomplus_cart_watch WHERE send = ?
  ORDER BY created_at DESC GROUP BY store_id LIMIT 1600`

  db.all(query, [0], (err, rows) => {
    if (err) {
      reject(new Error(err))
    }
    resolve(rows)
  })
})

const deleteOldCarts = () => {
  const endDate = new Date()
  endDate.setMonth(endDate.getMonth - 2) // Subtract 2 months

  const query = `SELECT * FROM ecomplus_cart_watch WHERE DATE(created_at) <= DATE(${endDate.toISOString()})`

  db.all(query, [0], (err, rows) => {
    if (err) {
      logger.err('Error getting carts in SQL ', err)
    }
    rows.forEach(row => {
      db.run('DELETE FROM ecomplus_cart_watch WHERE id = ?', [row.id], err => {
        if (!err) {
          logger.log(`> cart ${row.cart_id} deleted / status: completed`)
        }
      })
    })
  })
}

// const delayMs = (timeOut = 500) => new Promise(resolve => {
//   setTimeout(() => resolve(), timeOut)
// })

const sendMail = (cart, appSdk, storeId, configObj, lang) => new Promise(resolve => {
  // get store data
  appSdk.apiRequest(storeId, '/stores/me.json', 'GET')
    .then(resp => resp.response.data)
    .then(store => {
      const { customers } = cart
      const { name } = store

      customers.forEach(current => {
        let url = `customers/${current}.json`
        appSdk
          .apiRequest(storeId, url)
          .then(resp => resp.response.data)
          .then(async customer => {
            const html = await transactionalMails.abandonedCart(store, customer, cart, lang)

            return ({ html, customer })
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
          .then(async () => {
            logger.log(`--> E-mail sent / cart abandoned / #${cart._id} / #${storeId}`)
            db.run('delete from ecomplus_cart_watch where store_id = ? and id = ?', [storeId, cart._id], err => {
              if (!err) {
                logger.log(`--> cart ${cart._id} deleted / notification Ok /${storeId}`)
              }
            })
            resolve(true)
          })
      })
    })

  resolve(true)
})

module.exports = (appSdk) => {
  logger.log('--> Carts abandoned')

  const task = () => new Promise(async (resolve, reject) => {
    try {
      deleteOldCarts()
    } catch (e) {
      logger.error('Error deleting old abandoned carts =>', e)
    }

    try {
      const carts = await getCarts()
      carts.forEach(async (cartSQL) => {
        try {
          const storeId = cartSQL.store_id
          const configObj = await getConfig({ appSdk, storeId }, true)
          const lang = (configObj.lang && configObj.lang === 'Inglês') ? 'en_us' : 'pt_br'

          let createdAt = moment(cartSQL.created_at)
          let finalDate = moment().diff(createdAt, 'days')

          if (finalDate === configObj.is_abandoned_after_days) {
            const url = `carts/${cartSQL.cart_id}.json`

            appSdk.apiRequest(storeId, url)
              .then(resp => resp.response.data)
              .then(async (cart) => {
                const { available, completed } = cart
                if (available === true && completed === false) {
                  // send email
                  await sendMail(cart, appSdk, storeId, configObj, lang)
                } else if (available === true && completed === true) {
                  // remove from database
                  // trow err to pass cart
                  db.run('delete from ecomplus_cart_watch where store_id = ? and id = ?', [storeId, cart.id], err => {
                    if (!err) {
                      logger.log(`> cart ${cartSQL.cart_id} deleted / status: completed /${storeId}`)
                    }
                  })
                }
              })
          }
        } catch (e) {
          logger.error(`> Cart #${cartSQL.cart_id} error =>`, e)
        }
      })

      resolve(true)
    } catch (e) {
      logger.error('> Error getting cart =>', e)
      reject(e)
    }
  })

  // restart after 2m
  const start = () => task().finally(() => setTimeout(() => start(), 2 * 60 * 1000))

  start()
}
