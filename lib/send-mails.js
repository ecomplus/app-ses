'use strict'
const nodemailer = require('nodemailer')
const aws = require('aws-sdk')

module.exports = (html, to, from, cc, store, subject) => {
  return new Promise((resolve, reject) => {
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
        reject(err)
      }
      resolve(info)
    })
  })
}
