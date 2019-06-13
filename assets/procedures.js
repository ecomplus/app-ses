'use strict'
module.exports = [
  {
    'title': 'APP SES MAIL TRIGGER',
    'triggers': [
      {
        'resource': 'carts',
        'action': 'create'
      },
      {
        'resource': 'orders'
      }
    ],
    'webhooks': [
      {
        'api': {
          'external_api': {
            'uri': 'https://app-ses.ecomplus.biz/notification'
          }
        },
        'method': 'POST'
      }
    ]
  }
]
