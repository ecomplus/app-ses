'use strict'
const logger = require('console-files')
const sqlite = require('sqlite3').verbose()
const db = new sqlite.Database(process.env.ECOM_AUTH_DB)

module.exports = ({ appSdk }) => {
  return trigger => {
    let storeId = trigger.store_id
    let cartId = trigger.inserted_id
    let url = `carts/${cartId}.json`
    appSdk
      .apiRequest(storeId, url)
      .then(resp => resp.response.data)
      .then(data => {
        if (data.customers && data.available && data.completed === false) {
          // try find the cart in db
          db.all('SELECT cart_id, store_id, customers_ids, created_at FROM ecomplus_cart_watch WHERE cart_id = ?', [data._id], (err, row) => {
            if (!err) {
              // if not exist, save then
              if (!row || !row.length) {
                const sql = 'INSERT INTO ecomplus_cart_watch (cart_id, store_id, created_at, customers_ids) VALUES (?, ?, ?, ?)'
                const values = [data._id, storeId, new Date().toISOString(), JSON.stringify(data.customers)]
                db.run(sql, values, err => {
                  if (err) {
                    logger.error('Register abandoned cart Error:', err)
                  } else {
                    logger.log(`[!] New cart save for store #${storeId}/ ${cartId}`)
                  }
                })
              }
            } else {
              logger.error('FindCartErr', err)
            }
          })
        }
      })
  }
}
