'use strict'
const logger = require('console-files')
const sqlite = require('sqlite3').verbose()

const db = new sqlite.Database(process.env.ECOM_AUTH_DB)
// insert a new cart to be checked later
// send email to customer if cart continues abandoned

module.exports = ({ appSdk }) => {
  return trigger => {
    let storeId = trigger.store_id
    let cartId = trigger.inserted_id
    let apiPath = 'carts/' + cartId + '.json'
    let method = 'GET'

    appSdk.apiRequest(storeId, apiPath, method)
      .then(result => {
        let cart = result.response.data
        if (cart.customers && cart.available && cart.completed === false) {
          let query = `INSERT INTO ecomplus_cart_watch (cart_id, store_id, created_at, customers_ids)
                         VALUES (?, ?, ?, ?)`
          let values = [
            cartId,
            storeId,
            new Date().toISOString(),
            JSON.stringify(cart.customers)
          ]

          db.run(query, values, err => {
            if (err) {
              logger.error('Register abandoned cart Error:', err)
            } else {
              logger.log(`[!] New cart save for store #${storeId}/ ${cartId}`)
            }
          })
        }
      })
  }
}
