'use strict'
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
  // Helper parameters
  var dl = options.hash['decimalLength'] || 2;
  var ts = options.hash['thousandsSep'] || ',';
  var ds = options.hash['decimalSep'] || '.';

  // Parse to float
  var value = parseFloat(value);

  // The regex
  var re = '\\d(?=(\\d{3})+' + (dl > 0 ? '\\D' : '$') + ')';

  // Formats the number with the decimals
  var num = value.toFixed(Math.max(0, ~~dl));

  // Returns the formatted number
  return (ds ? num.replace('.', ds) : num).replace(new RegExp(re, 'g'), '$&' + ts);
})

/**
 * envia o email
 */
module.exports = (template, subject, toEmail, data) => {
  const templatesPath = '/assets/templates/'
  const sendFrom = 'contato@e-com.club'

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

        transporter.sendMail({
          from: sendFrom,
          to: toEmail,
          subject: subject,
          html: html
        }, (err, info) => {
          if (err) {
            console.log(err)
            reject(err)
          }
          resolve(info)
        })
      } else {
        reject(error)
      }
    })
  })
}
