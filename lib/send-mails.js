'use strict'
const logger = require('console-files')
const nodemailer = require('nodemailer')
const aws = require('aws-sdk')

module.exports = () => {
  return (html, to, from, subject) => {
    aws.config.update({
      region: 'us-west-2'
    })

    let transporter = nodemailer.createTransport({
      SES: new aws.SES({
        apiVersion: '2010-12-01'
      })
    })

    let options = {
      'from': from,
      'to': to,
      'subject': subject,
      'html': html
    }

    transporter.sendMail(options, (err, info) => {
      if (err) {
        logger.err('[SES SEND MAIL]: ', err)
      }
      logger.log('[SUCCESS] --> ', JSON.stringify(info))
    })
  }
}