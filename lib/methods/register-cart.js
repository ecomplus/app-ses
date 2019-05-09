'use strict'
// registra um novo carrinho para verificar posteriormente
// se o mesmo foi finalizado e enviá-lo por e-mail para os custumers
module.exports = ({ ecomAuth, db }) => {
  return (trigger) => {
    return new Promise((resolve, reject) => {
      ecomAuth.then(sdk => {
        let storeId = trigger.store_id
        let cartId = trigger.inserted_id
        let apiPath = 'carts/' + cartId + '.json'
        let method = 'GET'

        sdk.apiRequest(storeId, apiPath, method)
          .then(apiResponse => {
            let cart = apiResponse.response.data

            if (cart.hasOwnProperty('customers') && cart.available === true && cart.completed === false) {
              let query = 'INSERT INTO ecomplus_cart_watch (cart_id, store_id, created_at, customers_ids) VALUES (?,?,?,?)'
              let values = [
                cartId,
                storeId,
                new Date().toISOString(),
                JSON.stringify(cart.customers)
              ]
              db.run(query, values, erro => {
                if (erro) {
                  reject(erro)
                }
                resolve()
              })
            } else {
              // carrinho sem customers next
              resolve()
            }
          })
          .catch(reject)
      })
        .catch(reject)
    })
  }
}
