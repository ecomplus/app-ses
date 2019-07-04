'use strict'
const logger = require('console-files')
//
module.exports = (db) => {
  return (req, res) => {
    logger.log(req.headers)

    // Now we can view the body contents
    var json = JSON.parse(req.body)
    var msg = JSON.parse(json.Message) /* Should have been done by the previous line but SNS escaped this property */
    logger.log(msg)

    res.status(200).json()
  }
}
