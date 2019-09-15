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
    try {
      // store data
      const store = await fetchStore(appSdk, storeId)
      // order data
      const order = await fetchOrder(appSdk, storeId, (resourceId || insertedId))
      // custumer data
      const customer = await fetchCustomer(appSdk, storeId, order.buyers[0]._id)
      // mail actions
      const { html, subject, action, notified } = await mailTriggers(trigger, store, customer, order, lang)
      logger.log({ subject, action, notified })
      logger.log('Send', (html && subject && action && configObj.transaction_mail))
      if (html && subject && action && configObj.transaction_mail) {
        let mailIsEnable = configObj.transaction_mail.find(transaction => transaction.trigger === action)
        if (mailIsEnable) {
          let enableTo = mailIsEnable.to || {}
          let from = configObj.lojista_mail
          let to = customer.main_email
          let cc
          if (enableTo.customer) {
            if (enableTo.storekeeper) {
              cc = from
            }
            store.unsubscribe = 'https://ses.ecomplus.biz/aws/unsubscribe-mail/'
            sendMail(html, to, from, cc, store.name, subject)
              .then((info) => {
                logger.log('OK', JSON.stringify(info.envelope))
                if (notified) {
                  patchCustomerNotified(appSdk, storeId, order._id, insertedId)
                }
              })
              .catch(error => logger.error('SES_SEND_MAIL_ERR', error))
          }
        }
      }
    } catch (error) {
      logger.error('SES_REQUEST_ERR', error)
    }
  }
}
