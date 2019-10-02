const transactionalMails = require('@ecomplus/transactional-mails')
const applicationActions = require('./trigger-actions')
module.exports = (trigger, store, customer, order, lang) => {
  return new Promise(async resolve => {
    let triggerBody = trigger.body || {}
    let html = null
    let subject = null
    let action = null
    let notified = false
    switch (trigger.action) {
      case 'create':
        if (trigger.subresource === 'payments_history') {
          if (triggerBody.customer_notified === false) {
            if (triggerBody.status === 'pending' || triggerBody.status === 'under_analysis' || triggerBody.status === 'authorized' || triggerBody.status === 'partially_paid' || triggerBody.status === 'paid' || triggerBody.status === 'voided') {
              if (order.payments_history.length > 1) {
                // pending
                if (triggerBody.status === 'pending') {
                  html = await transactionalMails.pending(store, customer, order, lang)
                  subject = applicationActions['pending'].subject[lang]
                  action = 'pending'
                  notified = triggerBody
                }
                // under_analysis
                if (triggerBody.status === 'under_analysis') {
                  html = await transactionalMails.underAnalysis(store, customer, order, lang)
                  subject = applicationActions['underAnalysis'].subject[lang]
                  action = 'underAnalysis'
                  notified = triggerBody
                }
                // authorized
                if (triggerBody.status === 'authorized') {
                  html = await transactionalMails.authorized(store, customer, order, lang)
                  subject = applicationActions['authorized'].subject[lang]
                  action = 'authorized'
                  notified = triggerBody
                }
                // unauthorized
                if (triggerBody.status === 'unauthorized') {
                  html = await transactionalMails.unauthorized(store, customer, order, lang)
                  subject = applicationActions['unauthorized'].subject[lang]
                  action = 'unauthorized'
                  notified = triggerBody
                }
                // partially_paid
                if (triggerBody.status === 'partially_paid') {
                  html = await transactionalMails.partiallyPaid(store, customer, order, lang)
                  subject = applicationActions['partiallyPaid'].subject[lang]
                  action = 'partiallyPaid'
                  notified = triggerBody
                }
                // paid
                if (triggerBody.status === 'paid') {
                  html = await transactionalMails.paid(store, customer, order, lang)
                  subject = applicationActions['paid'].subject[lang]
                  action = 'paid'
                  notified = triggerBody
                }
                // in_dispute
                if (triggerBody.status === 'in_dispute') {
                  html = await transactionalMails.inDispute(store, customer, order, lang)
                  subject = applicationActions['inDispute'].subject[lang]
                  action = 'inDispute'
                  notified = triggerBody
                }
                // partially_refunded
                if (triggerBody.status === 'partially_refunded') {
                  html = await transactionalMails.partiallyRefunded(store, customer, order, lang)
                  subject = applicationActions['partiallyRefunded'].subject[lang]
                  action = 'partiallyRefunded'
                  notified = triggerBody
                }
                // refunded
                if (triggerBody.status === 'refunded') {
                  html = await transactionalMails.refunded(store, customer, order, lang)
                  subject = applicationActions['refunded'].subject[lang]
                  action = 'refunded'
                  notified = triggerBody
                }
                // voided
                if (triggerBody.status === 'cancelled' || triggerBody.status === 'voided') {
                  html = await transactionalMails.voided(store, customer, order, lang)
                  subject = applicationActions['voided'].subject[lang]
                  action = 'voided'
                  notified = triggerBody
                }
              } else {
                // 'new-order'
                html = await transactionalMails.newOrder(store, customer, order, lang)
                subject = applicationActions['newOrder'].subject[lang]
                action = 'newOrder'
                notified = triggerBody
              }
            }
          }
        } else if (trigger.subresource === 'fulfillments') {
          if (triggerBody.customer_notified === false) {
            if (triggerBody.status === 'invoice_issued') {
              html = await transactionalMails.invoiceIssued(store, customer, order, lang)
              subject = applicationActions['invoiceIssued'].subject[lang]
              action = 'invoiceIssued'
              notified = triggerBody
            }
            if (triggerBody.status === 'in_production') {
              html = await transactionalMails.inProduction(store, customer, order, lang)
              subject = applicationActions['inProduction'].subject[lang]
              action = 'inProduction'
              notified = triggerBody
            }
            if (triggerBody.status === 'ready_for_shipping') {
              html = await transactionalMails.readyForShipping(store, customer, order, lang)
              subject = applicationActions['readyForShipping'].subject[lang]
              action = 'readyForShipping'
              notified = triggerBody
            }
            if (triggerBody.status === 'shipped') {
              html = await transactionalMails.shipped(store, customer, order, lang)
              subject = applicationActions['shipped'].subject[lang]
              action = 'shipped'
              notified = triggerBody
            }
            if (triggerBody.status === 'delivered') {
              html = await transactionalMails.delivered(store, customer, order, lang)
              subject = applicationActions['delivered'].subject[lang]
              action = 'delivered'
              notified = triggerBody
            }
            if (triggerBody.status === 'returned_for_exchange') {
              html = await transactionalMails.returnedForExchange(store, customer, order, lang)
              subject = applicationActions['returnedForExchange'].subject[lang]
              action = 'returnedForExchange'
              notified = triggerBody
            }
            if (triggerBody.status === 'received_for_exchange') {
              html = await transactionalMails.receivedForExchange(store, customer, order, lang)
              subject = applicationActions['receivedForExchange'].subject[lang]
              action = 'receivedForExchange'
              notified = triggerBody
            }
            if (triggerBody.status === 'returned') {
              html = await transactionalMails.returned(store, customer, order, lang)
              subject = applicationActions['returned'].subject[lang]
              action = 'returned'
              notified = triggerBody
            }
          }
        }
        break
      default: break
    }
    resolve({ html, subject, action, notified })
  })
}
