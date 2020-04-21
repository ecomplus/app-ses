'use strict'
const nodemailer = require('nodemailer')
const aws = require('aws-sdk')

module.exports = ({ html, from, to, cc, storeName, subject }) => {
  return new Promise((resolve, reject) => {
    aws.config.update({
      region: 'us-west-2'
    })

    const transporter = nodemailer.createTransport({
      SES: new aws.SES({
        apiVersion: '2010-12-01'
      })
    })

    const options = {
      cc,
      to,
      subject,
      html,
      replyTo: from,
      headers: {
        'Reply-To': from,
        'Loja': storeName
      },
      from: {
        name: storeName,
        address: 'noreply@e-com.club'
      }
    }

    transporter.sendMail(options, (err, info) => {
      if (err) {
        reject(err)
      }
      resolve(info)
    })
  })
}
