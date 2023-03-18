'use strict'

// log on files
const logger = require('console-files')
// read configured E-Com Plus app data
const getConfig = require(process.cwd() + '/lib/store-api/get-config')

const SKIP_TRIGGER_NAME = 'SkipTrigger'
const ECHO_SUCCESS = 'SUCCESS'
const ECHO_SKIP = 'SKIP'
const ECHO_API_ERROR = 'STORE_API_ERR'

module.exports = appSdk => {
  return (req, res) => {
    const { storeId } = req
    const trigger = req.body
    /*
    Treat E-Com Plus trigger body here
    // https://developers.e-com.plus/docs/api/#/store/triggers/
    */

    // get app configured options
    getConfig({ appSdk, storeId })

      .then(configObj => {
        /* Do the stuff */
        let { resource } = trigger
        logger.log(`> Webhook (${trigger._id}): #${storeId} ${trigger.resource_id} [${resource}]`)

        switch (resource) {
          case 'carts': // abandoned cart
            if (configObj.is_abandoned_after_days) {
              require('./../../lib/save-carts')({ appSdk })(trigger)
            }
            break
          // case 'products':
          case 'orders':
          case 'customers':
            // require('./../../lib/mail-dispatch')(appSdk, configObj)(trigger, storeId)
            if (configObj.lojista_mail) {
              require('./../../lib/email-notification')({ appSdk, configObj })(trigger, storeId)
            }
            break
        }

        // all done
        logger.log(`> Webhook ${resource} (${trigger._id}): ${trigger.resource_id} - OK`)
        res.send(ECHO_SUCCESS)
      })

      .catch(err => {
        if (err.name === SKIP_TRIGGER_NAME) {
          // trigger ignored by app configuration
          res.send(ECHO_SKIP)
        } else {
          // logger.error(err)
          // request to Store API with error response
          // return error status code
          res.status(500)
          let { message } = err
          res.send({
            error: ECHO_API_ERROR,
            message
          })
        }
      })
  }
}
