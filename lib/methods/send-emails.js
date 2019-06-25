'use strict'
const logger = require('console-files')
const nodemailer = require('nodemailer')
const aws = require('aws-sdk')
const handlebars = require('handlebars')
const fs = require('fs')

// helpers
handlebars.registerHelper('math', function (lvalue, operator, rvalue, options) {
  lvalue = parseFloat(lvalue)
  rvalue = parseFloat(rvalue)

  return {
    '+': lvalue + rvalue,
    '-': lvalue - rvalue,
    '*': lvalue * rvalue,
    '/': lvalue / rvalue,
    '%': lvalue % rvalue
  }[operator]
})

handlebars.registerHelper('numberFormat', function (value, options) {
  // helper parameters
  const dl = options.hash['decimalLength'] || 2
  const ts = options.hash['thousandsSep'] || ','
  const ds = options.hash['decimalSep'] || '.'

  // parse to float
  value = parseFloat(value)

  // the regex
  const re = '\\d(?=(\\d{3})+' + (dl > 0 ? '\\D' : '$') + ')'

  // formats the number with the decimals
  const num = value.toFixed(Math.max(0, ~~dl))

  // returns the formatted number
  return (ds ? num.replace('.', ds) : num).replace(new RegExp(re, 'g'), '$&' + ts)
})

module.exports = (template, subject, toEmail, data, sendFrom) => {
  const templatesPath = '/assets/templates/'

  return new Promise((resolve, reject) => {
    fs.readFile(process.cwd() + templatesPath + template, 'utf-8', function (error, source) {
      if (!error) {
        let template = handlebars.compile(source)
        let html = template(data)

        aws.config.update({
          region: 'us-east-1'
        })

        let transporter = nodemailer.createTransport({
          SES: new aws.SES({
            apiVersion: '2010-12-01'
          })
        })
        logger.log('[MAIL TO: ] --> ', toEmail)
        transporter.sendMail({
          from: sendFrom,
          to: toEmail,
          subject: subject,
          html: html
        }, (err, info) => {
          if (err) {
            logger.error('[SES SEND MAIL]: ', err)
            reject(err)
          }
          console.log('[SUCCESS] --> ', JSON.stringify(info))
          resolve(info)
        })
      } else {
        reject(error)
      }
    })
  })
}
