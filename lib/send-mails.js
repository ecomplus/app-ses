'use strict'
const logger = require('console-files')
const nodemailer = require('nodemailer')
const aws = require('aws-sdk')

module.exports = () => {
  return (html, to, from, cc, store, subject) => {
    aws.config.update({
      region: 'us-west-2'
    })

    let transporter = nodemailer.createTransport({
      SES: new aws.SES({
        apiVersion: '2010-12-01'
      })
    })

    let options = {
      from: {
        name: store,
        address: 'noreply@e-com.club'
      },
      to: to,
      subject: subject,
      html: html,
      replyTo: from,
      headers: {
        'Reply-To': from,
        'Loja': store
      }
    }

    if (cc) {
      options.cc = from
    }

    transporter.sendMail(options, (err, info) => {
      if (err) {
        logger.error('[SES SEND MAIL]:', err)
      }
    })
  }
}