const transactionalMails = require('@ecomplus/transactional-mails')
const applicationActions = require('./trigger-actions')
module.exports = (trigger, store, customer, order, lang) => {
  return new Promise((resolve, reject) => {
    let subject = null
    let mailTrigger = null
    let notified = false
    const financialStatus = ['pending', 'under_analysis', 'authorized', 'unauthorized', 'partially_paid', 'paid', 'in_dispute', 'partially_refunded', 'refunded', 'canceled', 'voided']
    const fulfillmentsStatus = ['invoice_issued', 'in_production', 'ready_for_shipping', 'shipped', 'delivered', 'returned_for_exchange', 'receive_for_exchange', 'returned']
    const { action, subresource, body } = trigger

    const setupMail = (array) => {
      if (array.indexOf(body.status) !== -1) {
        mailTrigger = toCamelCase(body.status)
        transactionalMails[mailTrigger](store, customer, order, lang)
          .then(html => {
            subject = `${applicationActions[mailTrigger].subject[lang]} #${order.number}`
            notified = body
            resolve({ html, subject, mailTrigger, notified })
          }).catch(reject)
      }
    }

    if (action === 'create' && body.customer_notified === false) {
      switch (subresource) {
        case 'payments_history':
          if (!order.payments_history.find(entry => entry.customer_notified)) {
            transactionalMails.new_order(store, customer, order, lang)
              .then(html => {
                subject = `${applicationActions['newOrder'].subject[lang]} #${order.number}`
                mailTrigger = 'newOrder'
                notified = body
                resolve({ html, subject, mailTrigger, notified })
              }).catch(reject)
          } else {
            const lastNotifiedStatus = order.payments_history
              .filter(entry => entry.customer_notified)
              .sort((a, b) => a.date_time > b.date_time ? -1 : 1)[0].status
            if (lastNotifiedStatus !== body.status) {
              setupMail(financialStatus)
            }
          }
          break
        case 'fulfillments':
          setupMail(fulfillmentsStatus)
          break
        default: break
      }
    }
  })
}

const toCamelCase = string => {
  return string.replace(/^([A-Z])|[\s-_](\w)/g, function (match, p1, p2, offset) {
    if (p2) return p2.toUpperCase()
    return p1.toLowerCase()
  })
}
