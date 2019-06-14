'use strict'

const moment = require('moment')
const logger = require('console-files')
const mailActions = require('./../trigger-actions')
const sendMail = require('./../methods/send-emails')

module.exports = ({ ecomAuth, db }) => {
  logger.log('--> Start checking abandoned carts')

  const setupTable = fn => {
    // console.log('checking cart table')
    db.run(`CREATE TABLE IF NOT EXISTS ecomplus_cart_watch (
      id              INTEGER    PRIMARY KEY AUTOINCREMENT NOT NULL,
      cart_id         STRING     NOT NULL UNIQUE,
      store_id        INTEGER    NOT NULL,
      created_at      DATETIME,
      customers_ids   STRING     NOT NULL,
      send            INTEGER    DEFAULT (0)
    );`)
    return fn()
  }

  const task = () => {
    let query = 'SELECT cart_id, store_id, customers_ids, created_at FROM ecomplus_cart_watch WHERE send = ?'
    let index = 0

    db.each(query, [ 0 ], (err, rows) => {
      setTimeout(async () => {
        if (err) {
          logger.error(err)
        } else {
          ecomAuth.then(sdk => {
            let createdAt = moment(rows.created_at)
            let finalDate = moment().diff(createdAt, 'days')

            // cart is abandoned
            // send email after 3 days
            // TODO: we may handle an option from app data here
            if (finalDate >= 3) {
              let cartId = rows.cart_id
              let storeId = rows.store_id
              let apiPath = 'carts/' + cartId + '.json'
              let method = 'GET'

              sdk.apiRequest(storeId, apiPath, method)
                .then(async apiResponse => {
                  let cart = apiResponse.response.data
                  // check if cart is available and not completed yet
                  if (cart.available === true && cart.completed === false) {
                    // find customers to send email
                    let customers = JSON.parse(rows.customers_ids)
                    // setup template
                    let template = mailActions.find(action => action.action === 'carrinho-abandonado')
                    let storeData
                    try {
                      storeData = await sdk.apiRequest(storeId, '/stores/me.json', 'GET')
                    } catch (err) {
                      logger.error(err)
                    }

                    for (let i = 0; i < customers.length; i++) {
                      let apiResource = 'customers/' + customers[i] + '.json'
                      sdk.apiRequest(storeId, apiResource, method)
                        .then(apiResponse => {
                          let toEmail = apiResponse.response.data.main_email
                          let emailData = {
                            store: storeData,
                            cart: cart
                          }
                          sendMail(template.template, template.subject, toEmail, emailData)
                            .then(() => {
                              // mark cart as sent
                              db.run(
                                'DELETE FROM ecomplus_cart_watch WHERE cart_id = ? AND store_id = ?',
                                [ cartId, storeId ],
                                err => {
                                  if (err) {
                                    logger.error(err)
                                  }
                                }
                              )
                            })
                            .catch(err => logger.log(err))
                        })
                        .catch(err => logger.log(err))
                    }
                  }
                })
                .catch(err => logger.error(err))
            }
          })
        }
        index++
      }, index * 1000)
    })
  }

  // check if you need to create table
  setupTable(task)
  let interval = 2 * 60 * 1000
  setInterval(task, interval)
}
