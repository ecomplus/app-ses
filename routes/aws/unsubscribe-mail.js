const { decrypt } = require('./../../lib/unsubscribe-hash')
const logger = require('console-files')
const sqlite = require('sqlite3').verbose()
const db = new sqlite.Database(process.env.ECOM_AUTH_DB)

module.exports = (req, res) => {
  const { q, e } = req.query
  let problemType = 'unsubscribe'
  let mailAddress = decrypt(q, e)
  let sql = 'INSERT INTO amazon_notifications (problem_type,email_address) VALUES (?,?)'
  db.run(sql, [problemType, mailAddress], (err) => {
    if (err) {
      logger.error('AMZON erro', err)
    }
  })
}
