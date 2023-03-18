'use strict'

const logger = require('console-files')
let transactionalMails
try {
  transactionalMails = require('@ecomplus/transactional-mails')
  logger.log('Recebemos')
  logger.log(transactionalMails)
} catch (e) {
  logger.log('error to get transactional')
  logger.log(e)
}
const errorHandling = require('./store-api/error-handling')
const fetchCustomer = require('./store-api/fetch-customer')
const fetchOrder = require('./store-api/fetch-orders')
const fetchStore = require('./store-api/fetch-store')
const emailTriggers = require('./trigger-actions')
const emailSender = require('./email-sender')

let processQueue = []
const orderStatus = [
  'pending',
  'under_analysis',
  'authorized',
  'unauthorized',
  'partially_paid',
  'paid',
  'in_dispute',
  'partially_refunded',
  'refunded',
  'canceled',
  'voided',
  'invoice_issued',
  'in_production',
  'in_separation',
  'ready_for_shipping',
  'partially_shipped',
  'shipped',
  'partially_delivered',
  'delivered',
  'returned_for_exchange',
  'received_for_exchange',
  'returned'
]

const unsubscribeUri = 'https://ses.ecomplus.biz/aws/unsubscribe-mail/'

module.exports = ({ appSdk, configObj }) => {
  return (trigger, storeId) => {
    const resourceId = trigger.resource_id || null
    const insertedId = trigger.inserted_id || null
    const orderId = resourceId || insertedId

    const { body, subresource } = trigger

    if (
      processQueue.indexOf(orderId) !== -1 ||
      body.customer_notified === true ||
      orderStatus.indexOf(body.status) === -1
    ) {
      return
    }

    let isRetry = false
    const queueAndSend = () => {
      processQueue.push(orderId)
      if (storeId === 1011) {
        logger.log(JSON.stringify(processQueue))
      }
      setTimeout(async () => {
        let lastValidRecord
        Promise
          .all([
            fetchStore(appSdk, storeId),
            fetchOrder(appSdk, storeId, orderId)
          ])

          .then(([store, order]) => {
            return fetchCustomer(appSdk, storeId, order.buyers[0]._id)
              .then(customer => ({ customer, order, store }))
          })

          .then(async ({ customer, order, store }) => {
            const lang = (configObj.lang && configObj.lang === 'Inglês') ? 'en_us' : 'pt_br'
            let html = null
            let { status } = body

            let isCustomerNotified, lastNotifiedStatus
            if (Array.isArray(order[subresource])) {
              const sortedRecords = order[subresource]
                .sort((a, b) => a.date_time > b.date_time ? -1 : 1)
              lastValidRecord = sortedRecords.find(({ status }) => orderStatus.includes(status))
              if (lastValidRecord) {
                status = lastValidRecord.status
              }

              isCustomerNotified = Boolean(order[subresource]
                .find(entry => entry._id === trigger.inserted_id && entry.customer_notified))
              if (!isCustomerNotified) {
                const lastNotification = sortedRecords.find(entry => entry.customer_notified)
                if (lastNotification) {
                  lastNotifiedStatus = lastNotification.status
                }
              }
            }

            const triggerStatus = toCamelCase(status)
            let subject = emailTriggers[triggerStatus].subject[lang] + ' #' + order.number
            store.unsubscribe = unsubscribeUri
            let customMessage
            if (configObj[status] && configObj[status].custom_message) {
              customMessage = configObj[status].custom_message
            }

            if (!isCustomerNotified && lastNotifiedStatus !== status) {
              if (subresource === 'payments_history') {
                if (!order.financial_status) {
                  order.financial_status = {
                    current: status
                  }
                }

                if (
                  !lastNotifiedStatus &&
                  order.status !== 'cancelled' &&
                  status !== 'unauthorized' &&
                  status !== 'in_dispute' &&
                  status !== 'refunded' &&
                  status !== 'voided'
                ) {
                  subject = emailTriggers['newOrder'].subject[lang] + ' #' + order.number
                  if (configObj.new_order && configObj.new_order.custom_message) {
                    customMessage = configObj.new_order.custom_message
                  } else {
                    customMessage = undefined
                  }

                  html = await transactionalMails.new_order(store, customer, order, lang, customMessage)
                } else if (
                  status !== 'under_analysis' ||
                  Date.now() - new Date(order.created_at).getTime() > 180000
                ) {
                  html = await transactionalMails[triggerStatus](store, customer, order, lang, customMessage)
                }
              } else {
                // fullfilment
                if (!order.fulfillment_status) {
                  order.fulfillment_status = {
                    current: status
                  }
                }

                html = await transactionalMails[triggerStatus](store, customer, order, lang, customMessage)
              }
            }

            if (html === null) {
              const err = new Error('IgnoreTrigger')
              err.type = 'IgnoreTrigger'
              throw err
            }
            return { html, customer, store, subject }
          })

          // send email
          .then(async ({ html, customer, store, subject }) => {
            const from = configObj.lojista_mail
            const to = customer.main_email
            const cc = from
            const storeName = store.name
            if (storeId === 1011) {
              logger.log('Before send')
            }

            const options = {
              html,
              from,
              to,
              cc,
              storeName,
              subject
            }

            // check if is not disabled
            const { status } = body
            if (configObj.hasOwnProperty(status)) {
              if (configObj[status].disable_customer) {
                delete options.to
              }

              if (configObj[status].disable_merchant) {
                delete options.cc
              }
            }

            const info = await emailSender(options)
            if (storeId === 1011) {
              console.log('After send')
            }
            return ({ info, options })
          })

          .then(({ info, options }) => {
            const statusRecordId = lastValidRecord ? lastValidRecord._id : insertedId
            const url = `orders/${orderId}/${subresource}/${statusRecordId}.json`
            const method = 'PATCH'
            const data = {
              customer_notified: true
            }
            logger.log(`>> Email (${options.to},${options.cc}): #${storeId} ${statusRecordId}`)
            return appSdk.apiRequest(storeId, url, method, data)
          })

          .catch(err => {
            if (err.type !== 'IgnoreTrigger' && err.code !== 'InvalidParameterValue') {
              // logger.error('email_notification_err', err)
              if (!isRetry && (!err.response || !(err.response.status >= 400 && err.response.status < 500))) {
                // one minute and retry
                setTimeout(() => {
                  if (processQueue.indexOf(orderId) === -1) {
                    isRetry = true
                    queueAndSend()
                  }
                }, Math.random() * (180000 - 30000) + 30000)
              } else {
                errorHandling(err)
                logger.log(`>> Notification failed for #${storeId} ${orderId}`)
              }
            }
          })

        processQueue.splice(processQueue.indexOf(orderId), 1)
      }, Math.random() * (5000 - 1000) + 1000)
    }
    queueAndSend()
  }
}

const toCamelCase = string => {
  return string.replace(/^([A-Z])|[\s-_](\w)/g, function (match, p1, p2, offset) {
    if (p2) return p2.toUpperCase()
    return p1.toLowerCase()
  })
}
