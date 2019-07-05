'use strict'
const logger = require('console-files')
//
module.exports = (db) => {
  return (req, res) => {
    let json = JSON.parse(req.body)
    let msg = JSON.parse(json.Message) /* Should have been done by the previous line but SNS escaped this property */

    if (json.Type === 'SubscriptionConfirmation') {
      logger.log('SubscriptionConfirmation')
    }

    if (json.Type === 'Notification') {
      switch (msg.notificationType) {
        case 'Bounce':
          msg.bounce.bouncedRecipients.forEach(bounce => {
            let mail = bounce.emailAddress
            let problem_type = 'Bounce'
          })
          break
        case 'Complaint':
          msg.complaint.complainedRecipients.forEach(bounce => {
            let mail = bounce.emailAddress
            let problem_type = 'Complaint'
          })
          break
        default:
          break
      }
      let sql = 'INSERT INTO amazon_notifications (problem_type,email_address) VALUES (?,?)'
      db.run(sql, [problem_type, mail], (err) => {
        if (err) {
          logger.error('AMZON erro', err)
        }
        logger.log('Ok')
      })
    }

    return res.status(200).end()
  }
}
