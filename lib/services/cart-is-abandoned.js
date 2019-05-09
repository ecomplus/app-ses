'use strict'
const moment = require('moment')
const logger = require('console-files')
const mailActions = require('./../trigger-actions')
const sendMail = require('./../methods/send-emails')

module.exports = ({ ecomAuth, db }) => {
  const task = () => {
    console.log('Verificando carrinhos abandonados.')
    let query = 'SELECT cart_id, store_id, customers_ids, created_at FROM ecomplus_cart_watch WHERE send = ?'
    let index = 0

    db.each(query, [0], (erro, rows) => {
      setTimeout(async () => {
        if (erro) {
          logger.error(erro)
        } else {
          ecomAuth.then(sdk => {
            let createdAt = moment(rows.created_at)
            let finalDate = moment().diff(createdAt, 'days')
            // se o carrinho abandonado
            // completar 3 dias envio o e-mail
            if (finalDate >= 3) {
              let cartId = rows.cart_id
              let storeId = rows.store_id
              let apiPath = 'carts/' + cartId + '.json'
              let method = 'GET'

              sdk.apiRequest(storeId, apiPath, method)
                .then(async apiResponse => {
                  let cart = apiResponse.response.data
                  // carrinho nao finalizado ainda
                  if (cart.available === true && cart.completed === false) {
                    // busco os customers e envio o e-mail
                    let customers = JSON.parse(rows.customers_ids)
                    // template
                    let template = mailActions.find(action => action.action === 'carrinho-abandonado')
                    // dados da loja
                    let storeData = await sdk.apiRequest(storeId, '/stores/me.json', 'GET').catch(e => console.log(e))

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
                              // atualiza o carrinho local, marcando como enviado
                              db.run(`UPDATE ecomplus_cart_watch SET send = ? WHERE cart_id = ? AND store_id = ?`, [1, cartId, storeId], erro => {
                                if (erro) {
                                  logger.log('Erro ao atualizar o carrinho ' + cartId + '/nErro:', erro)
                                }
                              })
                            })
                            .catch(e => console.log(e))
                        })
                        .catch(e => console.log(e))
                    }
                  }
                })
                .catch(e => console.log(e))
            }
          })
        }
        index++
      }, index * 1000)
    })
  }

  let interval = 2 * 60 * 1000
  setInterval(task, interval)
  task()
}
