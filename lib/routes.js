'use strict'

const router = require('express').Router()
const pkg = require('../package.json')
const { ecomServerIps } = require('ecomplus-app-sdk')
const bodyParser = require('body-parser')

const mdware = (req, res, next) => {
  if (req.method !== 'GET' && process.env.NODE_ENV === 'production') {
    // check if request is comming from E-Com Plus servers
    if (ecomServerIps.indexOf(req.get('x-real-ip')) === -1) {
      res.status(403).send('Who are you? Unauthorized IP address')
    } else {
      next()
    }
  } else {
    // bypass
    next()
  }
};

module.exports = ({ ecomAuth, db }) => {
  router.use('/callback', mdware, require('./routes/callback')(ecomAuth))
  router.use('/notification', mdware, require('./routes/handle-triggers')({ ecomAuth, db }))
  // show package.json on domain root
  router.post('/aws-sns', bodyParser.text(), require('./routes/aws')(db))
  router.get('/', (req, res) => res.send(pkg))
  return router
}
