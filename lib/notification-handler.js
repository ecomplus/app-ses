'use strict'
const transactionalMails = require('@ecomplus/transactional-mails')
const applicationActions = require('./trigger-actions')
const logger = require('console-files')
//
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
      let triggerAction = parseTrigger(action, resource, insertedId, subresource, resourceBody, body)

      let isEnabled = false

      // check if transactional mail is enable ta sent
      if (configObj.hasOwnProperty('transaction_mail')) {
        isEnabled = configObj.transaction_mail.find(transaction => transaction.trigger === triggerAction)
      }

      if (isEnabled) {
        // mail is enable to sent?
        let appAction = applicationActions.find(application => application.action === triggerAction)

        if (appAction) {
          let from = configObj.lojista_mail
          let lang = configObj.lang || 'pt_br'
          let html = await transactionalMails[triggerAction](store, customer, resourceBody, lang)
          let subject = appAction.subject[lang]
          if (isEnabled.to.hasOwnProperty('customer') && isEnabled.to.customer === true) {
            let to = customer.main_email
            require('./send-mails')()(html, to, from, subject)
          }

          if (isEnabled.to.hasOwnProperty('storekeeper') && isEnabled.to.storekeeper === true) {
            require('./send-mails')()(html, from, from, subject)
          }
        }
      }
    } catch (error) {
      logger.error('Notification handler', error)
    }
  }
}

const parseTrigger = (action, resource, insertedId, subresource, resourceBody, bodyRequest) => {
  switch (action) {
    case 'create':
      // order_confirmation
      if ((resource === 'orders') && (insertedId !== null) && (subresource === null)) {
        return 'newOrder'
      } else if ((resource === 'customers') && (insertedId !== null) && (subresource === null)) {
        return 'welcome'
      } else {
        break
      }
    case 'change':
      if (resource === 'orders') {
        let order = resourceBody.response.data
        // payment_confirmation
        if (!subresource && bodyRequest.fields.includes('financial_status') && bodyRequest.fields.includes('status')) {
          if (order.financial_status.current === 'authorized') {
            return 'payment'
          } else if (order.financial_status.current === 'refunded') {
            // template ??
            break
          }
          // order_invoice
        } else if (subresource === 'shipping_lines' && bodyRequest.fields.includes('invoices')) {
          // template ??
          break
        } else if (subresource === 'shipping_lines' && bodyRequest.fields.includes('status')) {
          // shipping_confirmation
          if (order.shipping_lines[0].status.current === 'shipped') {
            return 'shipped'
          } else if (order.shipping_lines[0].status.current === 'delivered') {
            // delivery_confirmation
            return 'delivered'
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
