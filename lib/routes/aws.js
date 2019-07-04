'use strict'
const logger = require('console-files')
//
module.exports = (db) => {
  return (req, res) => {
    logger.log(JSON.stringify(req.body))
    res.end()
  }
}
