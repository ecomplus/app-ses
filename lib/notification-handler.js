'use strict'
const transactionalMails = require('@ecomplus/transactional-mails')
const triggersActions = require('./trigger-actions')

module.exports = (appSdk, configObj) => {
  return async (storeId, action, body, resource, resourceId, insertedId, subresource, subresourceId) => {
    try {
      // store data
      let store = await appSdk.apiRequest(storeId, '/stores/me.json', 'GET')
      store = store.response.data

      // resource data
      let resourceBody = await appSdk.apiRequest(storeId, resource + '/' + (resourceId || insertedId) + '.json', 'GET')
      resourceBody = resourceBody.response.data

      // costumer data
      let customerResource = `/customers/${resourceBody.buyers[0]._id}.json`
      let customer = await appSdk.apiRequest(storeId, customerResource, 'GET')
      customer = customer.response.data

      // send-mail
      let lang = configObj.lang || 'pt_br'
      let triggerParsed = parseHtmlMail(action, resource, insertedId, subresource, resourceBody, body, store, customer, resourceBody, lang)

      let isEnabled = false

      if (configObj.hasOwnProperty('email_enabled')) {
        isEnabled = configObj.email_enabled.find(triggers => triggers.trigger === triggerParsed.type)
      }

      if (isEnabled) {
        // mail is enable to sent?
        let appActions = triggersActions.find(action => action.action === triggerParsed.type)
        let html = await triggerParsed.dispach.then()

        // sent to customer?
        if (appActions && isEnabled.sent.toCustomer && isEnabled.sent.toCustomer === true) {
          let to = customer.main_email
          let from = configObj.lojista_mail
          require('./send-mails')()(html, to, from, appActions.subject)
        }

        // sent to lojista cc?
        if (isEnabled.sent.ccToLojista && isEnabled.sent.ccToLojista === true) {
          require('./send-mails')()(html, configObj.lojista_mail, configObj.lojista_mail, appActions.subject)
        }
      }
    } catch (error) {
      console.log('Catch', error)
    }
  }
}

const parseHtmlMail = (action, resource, insertedId, subresource, resourceBody, bodyRequest, store, customer, order, lang) => {
  switch (action) {
    case 'create':
      // order_confirmation
      if ((resource === 'orders') && (insertedId !== null) && (subresource === null)) {
        return {
          type: 'pedido-recebido',
          dispach: transactionalMails.newOrder(store, customer, order, lang)
        }
      } else if ((resource === 'customers') && (insertedId !== null) && (subresource === null)) {
        return {
          type: 'boas-vindas',
          dispach: transactionalMails.welcome(store, customer, lang)
        }
      } else {
        break
      }
    case 'change':
      if (resource === 'orders') {
        let order = resourceBody.response.data
        // payment_confirmation
        if (!subresource && bodyRequest.fields.includes('financial_status') && bodyRequest.fields.includes('status')) {
          if (order.financial_status.current === 'authorized') {
            return {
              type: 'pagamento-aprovado',
              dispach: transactionalMails.payment(store, customer, order, lang)
            }
          } else if (order.financial_status.current === 'refunded') {
            // template ??
            break
          }
          // order_invoice
        } else if (subresource === 'shipping_lines' && bodyRequest.fields.includes('invoices')) {
          // template ??
        } else if (subresource === 'shipping_lines' && bodyRequest.fields.includes('status')) {
          // shipping_confirmation
          if (order.shipping_lines[0].status.current === 'shipped') {
            return {
              type: 'pacote-enviado',
              dispach: transactionalMails.shipped(store, customer, order, lang)
            }
          } else if (order.shipping_lines[0].status.current === 'delivered') {
            // delivery_confirmation
            return {
              type: 'produto-entregue',
              dispach: transactionalMails.shipped(store, customer, order, lang)
            }
          }
        } else if (!subresource && bodyRequest.fields.includes('status')) {
          // cancellation_confirmation
          if (order.status === 'cancelled') {
            // template??
            break
          }
        }
      }
      break
    default:
      break
  }
}
