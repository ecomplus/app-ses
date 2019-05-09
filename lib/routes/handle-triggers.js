'use strict'
const handleTriggers = require('express').Router()
//
const triggersActions = require('../trigger-actions')

module.exports = ({ db, ecomAuth }) => {
  return handleTriggers.post('', (request, response) => {
    //
    const body = request.body
    //
    const storeId = body.store_id
    //
    // resource do trigger
    // resourceId
    // action realizada
    let { resource, action } = body

    let resourceId = body.resource_id || null
    let insertedId = body.inserted_id || null

    // subresource?
    let subresource = body.subresource || null
    let subresourceId = body.subresource_id || null

    const end = () => response.status(204).end()
    const fail = () => response.status(500).end()

    // resources válidos
    switch (resource) {
      case 'carts': // carrinhos abandonado
        const registerCard = require('./../methods/register-cart')({ ecomAuth, db })
        registerCard(body).then(end).catch(fail)
        break
      // case 'products':
      case 'orders':
      case 'customers':
        notification(ecomAuth)(storeId, action, body, resource, resourceId, insertedId, subresource, subresourceId)
          .then(end)
          .catch(fail)
        break
      default:
        end()
    }
    end()
  })
}

const notification = (ecomAuth) => {
  return (storeId, action, body, resource, resourceId, insertedId, subresource, subresourceId) => {
    return new Promise(async (resolve, reject) => {
      // ecom sdk
      // local
      const sdk = await ecomAuth.then().catch(reject)
      const sendMail = require('./../methods/send-emails')
      // resource body
      let resourceBody = await sdk.apiRequest(storeId, resource + '/' + (resourceId || insertedId) + '.json', 'GET').catch(e => console.log(e))
      // store data
      let storeData = await sdk.apiRequest(storeId, '/stores/me.json', 'GET').catch(e => console.log(e))
      // send-mail
      let template, subject, emailData, toEmail

      // define template
      switch (action) {
        case 'create':
          // order_confirmation
          if ((resource === 'orders') && (insertedId !== null) && (subresource === null)) {
            let appActions = triggersActions.find(action => action.action === 'pedido-recebido')
            template = appActions.template
            subject = appActions.subject
            toEmail = resourceBody.response.data.buyers[0].main_email
            emailData = {
              order: resourceBody.response.data,
              store: storeData.response.data
            }
          } else if ((resource === 'customers') && (insertedId !== null) && (subresource === null)) {
            console.log('boas vindas')
            let appActions = triggersActions.find(action => action.action === 'boas-vindas')
            template = appActions.template
            subject = appActions.subject
            toEmail = resourceBody.response.data.buyers[0].main_email
            emailData = {
              order: resourceBody.response.data,
              store: storeData.response.data
            }
          } else {
            resolve()
          }
          break
        case 'change':
          if (resource === 'orders') {
            let order = resourceBody.response.data
            // payment_confirmation
            if (!subresource && body.fields.includes('financial_status') && body.fields.includes('status')) {
              if (order.financial_status.current === 'authorized') {
                let appActions = triggersActions.find(action => action.action === 'pagamento-aprovado')
                template = appActions.template
                subject = appActions.subject
              } else if (order.financial_status.current === 'refunded') {

              }
              // order_invoice
            } else if (subresource === 'shipping_lines' && body.fields.includes('invoices')) {
              let appActions = triggersActions.find(action => action.action === 'nota-fiscal')
              template = appActions.template
              subject = appActions.subject
            } else if (subresource === 'shipping_lines' && body.fields.includes('status')) {
              // shipping_confirmation
              if (order.shipping_lines[0].status.current === 'shipped') {
                let appActions = triggersActions.find(action => action.action === 'pacote-enviado')
                template = appActions.template
                subject = appActions.subject
              } else if (order.shipping_lines[0].status.current === 'delivered') {
                // delivery_confirmation
                let appActions = triggersActions.find(action => action.action === 'produto-entregue')
                template = appActions.template
                subject = appActions.subject
              }
            } else if (!subresource && body.fields.includes('status')) {
              // cancellation_confirmation
              if (order.status === 'cancelled') {

              }
            }

            toEmail = resourceBody.response.data.buyers[0].main_email
            emailData = {
              order: resourceBody.response.data,
              store: storeData.response.data
            }
          }
          break
        default:
          break
      }
      // send email
      sendMail(template, subject, toEmail, emailData).then(resolve).catch(reject)
    })
  }
}
