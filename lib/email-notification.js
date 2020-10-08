'use strict'

const logger = require('console-files')
const transactionalMails = require('@ecomplus/transactional-mails')
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

      setTimeout(async () => {
        Promise
          .all([
            fetchStore(appSdk, storeId),
            fetchOrder(appSdk, storeId, (resourceId || insertedId))
          ])

          .then(([store, order]) => {
            return fetchCustomer(appSdk, storeId, order.buyers[0]._id)
              .then(customer => ({ customer, order, store }))
          })

          .then(async ({ customer, order, store }) => {
            const lang = (configObj.lang && configObj.lang === 'Inglês') ? 'en_us' : 'pt_br'
            let html = null
            const triggerStatus = toCamelCase(body.status)
            let subject = emailTriggers[triggerStatus].subject[lang] + ' #' + order.number
            store.unsubscribe = unsubscribeUri

            let customMessage
            if (configObj[body.status] && configObj[body.status].custom_message) {
              customMessage = configObj[body.status].custom_message
            }

            if (subresource === 'payments_history') {
              if (!order.payments_history.find(entry => entry.customer_notified)) {
                subject = emailTriggers['newOrder'].subject[lang] + ' #' + order.number
                if (configObj.new_order && configObj.new_order.custom_message) {
                  customMessage = configObj.new_order.custom_message
                } else {
                  customMessage = undefined
                }
                html = await transactionalMails.new_order(store, customer, order, lang, customMessage)
              } else {
                const lastNotifiedStatus = order.payments_history
                  .filter(entry => entry.customer_notified)
                  .sort((a, b) => a.date_time > b.date_time ? -1 : 1)[0].status

                const lastCustomerNotified = order.payments_history.find(entry => entry._id === trigger.inserted_id && entry.customer_notified === false)

                if (lastNotifiedStatus !== body.status && lastCustomerNotified) {
                  html = await transactionalMails[triggerStatus](store, customer, order, lang, customMessage)
                }
              }
            } else {
              // fullfilment
              html = await transactionalMails[triggerStatus](store, customer, order, lang, customMessage)
            }

            if (html === null) {
              const err = new Error('IgnoreTrigger')
              err.type = 'IgnoreTrigger'
              throw err
            }

            return { html, customer, store, subject }
          })

          // send email
          .then(({ html, customer, store, subject }) => {
            const from = configObj.lojista_mail
            const to = customer.main_email
            const cc = from
            const storeName = store.name

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

            return emailSender(options).then(info => ({ info, options }))
          })

          .then(({ info, options }) => {
            const url = `orders/${orderId}/${subresource}/${insertedId}.json`
            const method = 'PATCH'
            const data = {
              customer_notified: true
            }
            logger.log(`>> Email (${options.to},${options.cc}): #${storeId} ${insertedId}`)
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
