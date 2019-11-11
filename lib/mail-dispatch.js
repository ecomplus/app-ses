'use strict'
const logger = require('console-files')
const mailTriggers = require('./mail-triggers')
const sendMail = require('./send-mails')
const fetchCustomer = require('./store-api/fetch-customer')
const fetchOrder = require('./store-api/fetch-orders')
const fetchStore = require('./store-api/fetch-store')
const patchCustomerNotified = require('./store-api/patch-notified')

module.exports = (appSdk, configObj) => {
  return async (trigger, storeId) => {
    const lang = configObj.lang || 'pt_br'
    const resourceId = trigger.resource_id || null
    const insertedId = trigger.inserted_id || null
    let store = null
    let order = null
    let customer = null
    try {
      // fetch merchant's store data
      store = await fetchStore(appSdk, storeId)
      // fetch order
      order = await fetchOrder(appSdk, storeId, (resourceId || insertedId))
      // fetch custumer data
      customer = await fetchCustomer(appSdk, storeId, order.buyers[0]._id)
      // mail actions
      store.unsubscribe = 'https://ses.ecomplus.biz/aws/unsubscribe-mail/'
    } catch (error) {
      logger.error('SES_REQUEST_ERR', error)
    }

    mailTriggers(trigger, store, customer, order, lang)
      .then(({ html, subject, mailTrigger, notified }) => {
        if (html && subject && mailTrigger && configObj.transaction_mail) {
          let mailIsEnable = configObj.transaction_mail.find(transaction => transaction.trigger === mailTrigger)
          if (mailIsEnable) {
            let enableTo = mailIsEnable.to || {}
            let from = configObj.lojista_mail
            let to = customer.main_email
            let cc
            if (enableTo.customer) {
              if (enableTo.storekeeper) {
                cc = from
              }
              sendMail(html, to, from, cc, store.name, subject)
                .then((info) => {
                  if (notified) {
                    return patchCustomerNotified(appSdk, storeId, resourceId, insertedId, trigger.subresource)
                  }
                })
                .catch(error => logger.error('SES_SEND_MAIL_ERR', error))
            }
          }
        }
      })
  }
}
