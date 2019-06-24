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
      // app public body
      const appPublicBody = await sdk.appPublicBody(storeId).catch(e => console.log(e))
      const appData = appPublicBody.response.data

      const sendMail = require('./../methods/send-emails')
      // resource body
      let resourceBody = await sdk.apiRequest(storeId, resource + '/' + (resourceId || insertedId) + '.json', 'GET').catch(e => console.log(e))
      // store data
      let storeData = await sdk.apiRequest(storeId, '/stores/me.json', 'GET').catch(e => console.log(e))
      // send-mail
      let template, subject, emailData, toEmail

      // define template
      let mailTrigger = parseTriggerName(action, resource, insertedId, subresource, resourceBody, body)

      // check if email is enable to sent
      // if not not sent mail
      if (!appData.hasOwnProperty('data')
        || (appData.hasOwnProperty('data') && !appData.data.hasOwnProperty('email_enabled'))) {
        resolve()
      }
      let isEnabled = false
      if (appData.data.hasOwnProperty('email_enabled')) {
        isEnabled = appData.data.email_enabled.find(triggers => triggers.trigger === mailTrigger)
        if (!isEnabled) {
          resolve()
        }
      }

      let appActions = triggersActions.find(action => action.action === mailTrigger)
      template = appActions.template
      subject = appActions.subject
      emailData = {
        order: resourceBody.response.data,
        store: storeData.response.data
      }
      let mailFrom = appData.data.lojista_mail

      // sent to customer?
      if (isEnabled.sent.toCustomer && isEnabled.sent.toCustomer === true) {
        // send email
        toEmail = resourceBody.response.data.buyers[0].main_email
        sendMail(template, subject, toEmail, emailData, mailFrom).then(resolve).catch(reject)
      }

      // sent to lojista cc?
      if (isEnabled.sent.ccToLojista && isEnabled.sent.ccToLojista === true) {
        // send email
        sendMail(template, subject, appData.data.lojista_mail, emailData, mailFrom).then(resolve).catch(reject)
      }
    })
  }
}

const parseTriggerName = (action, resource, insertedId, subresource, resourceBody, bodyRequest) => {
  switch (action) {
    case 'create':
      // order_confirmation
      if ((resource === 'orders') && (insertedId !== null) && (subresource === null)) {
        return 'pedido-recebido'
      } else if ((resource === 'customers') && (insertedId !== null) && (subresource === null)) {
        console.log('boas vindas')
        return 'boas-vindas'
      } else {
        break
      }
    case 'change':
      if (resource === 'orders') {
        let order = resourceBody.response.data
        // payment_confirmation
        if (!subresource && bodyRequest.fields.includes('financial_status') && bodyRequest.fields.includes('status')) {
          if (order.financial_status.current === 'authorized') {
            return 'pagamento-aprovado'
          } else if (order.financial_status.current === 'refunded') {
            break
          }
          // order_invoice
        } else if (subresource === 'shipping_lines' && bodyRequest.fields.includes('invoices')) {
          return 'nota-fiscal'
        } else if (subresource === 'shipping_lines' && bodyRequest.fields.includes('status')) {
          // shipping_confirmation
          if (order.shipping_lines[0].status.current === 'shipped') {
            return 'pacote-enviado'
          } else if (order.shipping_lines[0].status.current === 'delivered') {
            // delivery_confirmation
            return 'produto-entregue'
          }
        } else if (!subresource && bodyRequest.fields.includes('status')) {
          // cancellation_confirmation
          if (order.status === 'cancelled') {
            break
          }
        }
      }
      break
    default:
      break
  }
}