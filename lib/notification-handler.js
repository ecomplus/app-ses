'use strict'
const transactionalMails = require('@ecomplus/transactional-mails')
const applicationActions = require('./trigger-actions')
const logger = require('console-files')

module.exports = (appSdk, configObj) => {
  return async (trigger, storeId) => {
    const lang = configObj.lang || 'pt_br'
    const resourceId = trigger.resource_id || null
    const insertedId = trigger.inserted_id || null

    // pega informações sobre o email store, pedido, costumer ..
    // store data
    let store = await appSdk.apiRequest(storeId, '/stores/me.json', 'GET')
    store = store.response.data
    store.unsubscribe = 'https://ses.ecomplus.biz/aws/unsubscribe-mail/'

    // resource data
    let resourceBody = await appSdk.apiRequest(storeId, trigger.resource + '/' + (resourceId || insertedId) + '.json', 'GET')
    resourceBody = resourceBody.response.data

    // costumer data
    let customerResource = `/customers/${resourceBody.buyers[0]._id}.json`
    let customer = await appSdk.apiRequest(storeId, customerResource, 'GET')
    customer = customer.response.data

    // verifica o body do pedido
    return getTrigger(trigger, store, customer, resourceBody, lang)

      .then(({ html, subject, action, notified }) => {
        let isEnabled = false
        // check if transactional mail is enable ta sent
        if (configObj.hasOwnProperty('transaction_mail')) {
          isEnabled = configObj.transaction_mail.find(transaction => transaction.trigger === action)
        }

        console.log(isEnabled)
        if (isEnabled) {
          let from = configObj.lojista_mail
          if (isEnabled.to.hasOwnProperty('customer') && isEnabled.to.customer === true) {
            let to = customer.main_email
            let cc
            let storeName = store.name
            if (isEnabled.to.hasOwnProperty('storekeeper') && isEnabled.to.storekeeper === true) {
              cc = from
            }
            require('./send-mails')()(html, to, from, cc, storeName, subject)
          }
        }
        return notified
      })

      .then(notified => {
        if (notified) {
          let resource = `orders/${(resourceId || insertedId)}/payments_history/${insertedId}.json`
          let data = {
            customer_notified: true
          }
          return appSdk.apiRequest(storeId, resource, 'PATCH', data)
        }
      })

      .catch(error => {
        logger.log('SES_TRANSACTIONAL_MAIL:', error.message)
      })
  }
}

const getTrigger = (trigger, store, customer, order, lang) => {
  return new Promise(async (resolve, reject) => {
    switch (trigger.action) {
      case 'create':
        if (trigger.subresource === 'payments_history') {
          if (trigger.body.hasOwnProperty('customer_notified') && trigger.body.customer_notified === false) {
            if (order.hasOwnProperty('financial_status') &&
              (order.financial_status.current === 'pending' || order.financial_status.current === 'under_analysis' || order.financial_status.current === 'authorized' || order.financial_status.current === 'partially_paid' || order.financial_status.current === 'paid')) {
              if (order.payments_history.length > 1) {
                // authorized
                if (order.financial_status.current === 'paid') {
                  let html = await transactionalMails.payment(store, customer, order, lang)
                  let subject = applicationActions['payment'].subject[lang]
                  let action = 'payment'
                  resolve({ html, subject, action, notified: trigger.body })
                }
                // canceled
                if (order.financial_status.current === 'refunded') {
                  let html = await transactionalMails.canceled(store, customer, order, lang)
                  let subject = applicationActions['canceled'].subject[lang]
                  let action = 'canceled'
                  resolve({ html, subject, action, notified: trigger.body })
                }
              } else {
                // 'new-order'
                let html = await transactionalMails.newOrder(store, customer, order, lang)
                let subject = applicationActions['newOrder'].subject[lang]
                let action = 'newOrder'
                resolve({ html, subject, action, notified: trigger.body })
              }
            }
          } else {
            reject(new Error('ok'))
          }
        }
        break
      case 'change':
        if (trigger.subresource === 'shipping_lines' && trigger.fields.includes('invoices')) {
          // order_invoice ??
          break
        } else if (trigger.subresource === 'shipping_lines' && trigger.fields.includes('status')) {
          // shipping_confirmation
          if (order.shipping_lines[0].status.current === 'shipped') {
            // shipped
            let html = await transactionalMails.newOrder(store, customer, order, lang)
            let subject = applicationActions['shipped'].subject[lang]
            let action = 'shipped'
            resolve({ html, subject, action, notified: trigger.body })
          } else if (order.shipping_lines[0].status.current === 'delivered') {
            // delivery_confirmation
            let html = await transactionalMails.newOrder(store, customer, order, lang)
            let subject = applicationActions['delivered'].subject[lang]
            let action = 'delivered'
            resolve({ html, subject, action, notified: trigger.body })
          }
        } else {
          reject(new Error('ok'))
        }
        break
      default: reject(new Error('ok'))
    }
  })
}
