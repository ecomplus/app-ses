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
                // authorized
                if (triggerBody.status === 'paid') {
                  html = await transactionalMails.payment(store, customer, order, lang)
                  subject = applicationActions['payment'].subject[lang]
                  action = 'payment'
                  notified = triggerBody
                }
                // canceled
                if (triggerBody.status === 'cancelled' || triggerBody.status === 'voided') {
                  html = await transactionalMails.canceled(store, customer, order, lang)
                  subject = applicationActions['canceled'].subject[lang]
                  action = 'canceled'
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
            html = await transactionalMails.newOrder(store, customer, order, lang)
            subject = applicationActions['shipped'].subject[lang]
            action = 'shipped'
            notified = triggerBody
          } else if (order.shipping_lines[0].status.current === 'delivered') {
            // delivery_confirmation
            html = await transactionalMails.newOrder(store, customer, order, lang)
            subject = applicationActions['delivered'].subject[lang]
            action = 'delivered'
            notified = triggerBody
          }
        }
        break
      default: break
    }
    resolve({ html, subject, action, notified })
  })
}
