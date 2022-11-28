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
        const { _id, available, completed } = data
        if (available && completed === false) {
          // try find the cart in db
          db.get('SELECT cart_id, store_id, customers_ids, created_at FROM ecomplus_cart_watch WHERE cart_id = ?', [_id], (err, row) => {
            if (!err && !row) {
              const sql = 'INSERT INTO ecomplus_cart_watch (cart_id, store_id, created_at, customers_ids) VALUES (?, ?, ?, ?)'
              const values = [data._id, storeId, new Date().toISOString(), JSON.stringify(data.customers)]
              db.run(sql, values, err => {
                if (err) {
                  logger.error('Register abandoned cart Error:', err)
                } else {
                  logger.log(`--> Cart saved / #${_id} / #${storeId}`)
                }
              })
            }
          })
        } else if (available && completed === true) {
          db.get('SELECT cart_id, store_id, customers_ids, created_at FROM ecomplus_cart_watch WHERE cart_id = ?', [_id], (err, row) => {
            if (!err && row) {
              db.run('DELETE FROM ecomplus_cart_watch WHERE cart_id = ?', [_id], err => {
                if (!err) {
                  logger.log(`> cart ${_id} deleted / status: completed`)
                }
              })
            }
          })
        }
      })
  }
}
