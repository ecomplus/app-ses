'use strict'

// insert a new cart to be checked later
// send email to customer if cart continues abandoned

module.exports = ({ ecomAuth, db }) => {
  return trigger => {
    return new Promise((resolve, reject) => {
      ecomAuth.catch(reject).then(sdk => {
        let storeId = trigger.store_id
        let cartId = trigger.inserted_id
        let apiPath = 'carts/' + cartId + '.json'
        let method = 'GET'

        sdk.apiRequest(storeId, apiPath, method)

          .then(apiResponse => {
            let cart = apiResponse.response.data

            if (cart.hasOwnProperty('customers') && cart.available === true && cart.completed === false) {
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
                  reject(err)
                }
                resolve()
              })
            } else {
              // ignore current cart
              resolve()
            }
          })

          .catch(reject)
      })
    })
  }
}
