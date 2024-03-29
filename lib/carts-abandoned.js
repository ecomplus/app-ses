'use strict'
const transactionalMails = require('@ecomplus/transactional-mails')
const triggerActions = require('./trigger-actions')
const emailSender = require('./email-sender')
const getConfig = require(process.cwd() + '/lib/store-api/get-config')
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
  GROUP BY store_id ORDER BY created_at ASC LIMIT 1600`

  db.all(query, [0], (err, rows) => {
    if (err) {
      reject(new Error(err))
    }
    resolve(rows)
  })
})

const deleteOldCarts = () => new Promise((resolve, reject) => {
  const endDate = new Date()
  endDate.setMonth(endDate.getMonth() - 2) // Subtract 2 months

  const query = `DELETE FROM ecomplus_cart_watch WHERE DATE(created_at) <= DATE('${endDate.toISOString()}')`

  db.run(query, err => {
    if (!err) {
      logger.log('> Deleted old carts in SQL')
      resolve(true)
    }
    reject(err)
  })
})

const sendMail = (cart, appSdk, storeId, configObj, lang) => new Promise((resolve, reject) => {
  // get store data
  appSdk.apiRequest(storeId, '/stores/me.json', 'GET')
    .then(resp => resp.response.data)
    .then(store => {
      const { customers } = cart
      const { name } = store

      customers.forEach(async (current) => {
        let url = `customers/${current}.json`
        await appSdk
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
          .then(() => {
            logger.log(`--> E-mail sent / cart abandoned / #${cart._id} / #${storeId}`)
            db.run(
              'DELETE FROM ecomplus_cart_watch WHERE cart_id = ? OR customers_ids = ?',
              [cart._id, JSON.stringify([current])],
              err => {
                if (!err) {
                  logger.log(`--> cart ${cart._id} deleted / notification Ok /${storeId}`)
                } else {
                  logger.error('> Error deleting cart =>', err)
                }
              }
            )
            resolve(true)
          })
      })
    })
    .catch(err => {
      reject(err)
    })

  resolve(true)
})

module.exports = (appSdk) => {
  logger.log('--> Carts abandoned')

  const task = () => new Promise(async (resolve, reject) => {
    try {
      await deleteOldCarts()
    } catch (e) {
      logger.error('> Error deleting old abandoned carts =>', e)
    }

    try {
      const carts = await getCarts()
      logger.log(`>> Carts: ${carts.length} `)
      carts.forEach(async (cartSQL) => {
        const storeId = cartSQL.store_id
        try {
          const configObj = await getConfig({ appSdk, storeId }, true)
          const lang = (configObj.lang && configObj.lang === 'Inglês') ? 'en_us' : 'pt_br'

          const now = new Date().getTime()
          let sendDate = new Date(cartSQL.created_at).getTime()
          sendDate = sendDate + ((configObj.is_abandoned_after_days || 1) * 24 * 60 * 60 * 1000)

          if (now >= sendDate) {
            const url = `carts/${cartSQL.cart_id}.json`

            await appSdk.apiRequest(storeId, url)
              .then(resp => resp.response.data)
              .then(async (cart) => {
                const { available, completed } = cart
                if (available === true && completed === false) {
                  // send email
                  await sendMail(cart, appSdk, storeId, configObj, lang)
                } else if (available === true && completed === true) {
                  // remove from database
                  // trow err to pass cart
                  db.run('DELETE FROM ecomplus_cart_watch WHERE store_id = ? and cart_id = ?', [storeId, cartSQL.cart_id], err => {
                    if (!err) {
                      logger.log(`> Cart ${cartSQL.cart_id} deleted / status: completed / #${storeId}`)
                    } else {
                      logger.error(err)
                    }
                  })
                }
              })
              .catch(error => {
                if (error.response && error.response.status === 404) {
                  db.run('DELETE FROM ecomplus_cart_watch WHERE store_id = ? and cart_id = ?',
                    [storeId, cartSQL.cart_id], err => {
                      if (!err) {
                        logger.log(`> Deleted cart: ${cartSQL.cart_id} #${storeId}, not found in API'`)
                      } else {
                        logger.error(`> Error deleting cart #${cartSQL.cart_id} from store  #${storeId} => `, err)
                      }
                    })
                } else {
                  throw error
                }
              })
          }
        } catch (error) {
          if (error.appWithoutAuth) {
            db.run('DELETE FROM ecomplus_cart_watch WHERE store_id = ?',
              [storeId], err => {
                if (!err) {
                  logger.log(`> Store Carts #${storeId} deleted, without auth`)
                } else {
                  logger.error(`> Error when deleting carts from the store #${storeId} => `, err)
                }
              })
          } else {
            logger.error(`>Error cart #${cartSQL.cart_id} (${cartSQL.created_at}), store #${storeId} => `, error)
          }
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
