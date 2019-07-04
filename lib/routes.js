'use strict'

const router = require('express').Router()
const pkg = require('../package.json')

module.exports = ({ ecomAuth, db }) => {
  router.use('/callback', require('./routes/callback')(ecomAuth))
  router.use('/notification', require('./routes/handle-triggers')({ ecomAuth, db }))
  // show package.json on domain root
  router.post('/aws-ses', require('./routes/aws')(db))
  router.get('/', (req, res) => res.send(pkg))
  return router
}
