'use strict'
const logger = require('console-files')
const sqlite = require('sqlite3').verbose()
const db = new sqlite.Database(process.env.ECOM_AUTH_DB)
//
module.exports = () => {
  return (req, res) => {
    let json = JSON.parse(req.body)
    let msg = JSON.parse(json.Message)

    if (json.Type === 'SubscriptionConfirmation') {
      logger.log('SubscriptionConfirmation')
    }

    if (json.Type === 'Notification') {
      let mailAddress
      let problemType
      switch (msg.notificationType) {
        case 'Bounce':
          msg.bounce.bouncedRecipients.forEach(bounce => {
            mailAddress = bounce.emailAddress
            problemType = 'Bounce'
          })
          break
        case 'Complaint':
          msg.complaint.complainedRecipients.forEach(bounce => {
            mailAddress = bounce.emailAddress
            problemType = 'Complaint'
          })
          break
        default:
          break
      }
      let sql = 'INSERT INTO amazon_notifications (problem_type,email_address) VALUES (?,?)'
      db.run(sql, [problemType, mailAddress], (err) => {
        if (err) {
          logger.error('AMZON erro', err)
        }
        logger.log('Ok')
      })
    }

    return res.status(200).end()
  }
}
