'use strict'

const router = require('express').Router()
const pkg = require('../package.json')

module.exports = ({ ecomAuth, db }) => {
  router.use('/callback', require('./routes/callback')(ecomAuth))
  router.use('/triggers', require('./routes/handle-triggers')({ ecomAuth, db }))
  // show package.json on domain root
  router.get('/', (req, res) => res.send(pkg))
  return router
}
