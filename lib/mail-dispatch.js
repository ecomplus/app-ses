'use strict'
const logger = require('console-files')
const mailTriggers = require('./mail-triggers')
const sendMail = require('./send-mails')
const fetchCustomer = require('./store-api/fetch-customer')
const fetchOrder = require('./store-api/fetch-orders')
const fetchStore = require('./store-api/fetch-store')
const patchCustomerNotified = require('./store-api/patch-notified')
const postMetafields = require('./store-api/post-metafields')

module.exports = (appSdk, configObj) => {
  return async (trigger, storeId) => {
    if (configObj || configObj.transaction_mail || configObj.lojista_mail) {
      const lang = configObj.lang || 'pt_br'
      const resourceId = trigger.resource_id || null
      const insertedId = trigger.inserted_id || null
      let store = null
      let order = null
      let customer = null
      let error = false
      try {
        // fetch merchant's store data
        store = await fetchStore(appSdk, storeId)
        // fetch order
        order = await fetchOrder(appSdk, storeId, (resourceId || insertedId))
        // fetch custumer data
        customer = await fetchCustomer(appSdk, storeId, order.buyers[0]._id)
        // mail actions
        store.unsubscribe = 'https://ses.ecomplus.biz/aws/unsubscribe-mail/'
      } catch (err) {
        error = {}
        error.message = err.message
        if (order) {
          if (!customer) {
            error.resource = 'customer'
            error.description = 'Error with customer data, transactional mail not sent it.'
            postMetafields(appSdk, storeId, order._id, 'notification_error', error.description).catch(e => console.error(e))
          }
        }
      }

      if (!error) {
        mailTriggers(trigger, store, customer, order, lang)
          .then(({ html, subject, mailTrigger, notified }) => {
            if (html && subject && mailTrigger) {
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
                  return sendMail(html, to, from, cc, store.name, subject)
                    .then((info) => {
                      if (notified) {
                        logger.log(`[!]: ${subject} | ${mailTrigger} | #${storeId}`)
                        return patchCustomerNotified(appSdk, storeId, resourceId, insertedId, trigger.subresource)
                      }
                    })
                }
              }
            }
          })
          .catch(e => console.log('--> TRIGGER_ERR', e.message))
      } else {
        logger.error('SES_ERR', JSON.stringify(error))
      }
    } else {
      logger.log(`[!]Missing application settings for store #${storeId}`)
    }
  }
}
