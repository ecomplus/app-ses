module.exports = (appSdk, storeId, orderId, historyId) => {
  let resource = `orders/${orderId}/payments_history/${historyId}.json`
  let method = 'PATCH'
  let data = {
    customer_notified: true
  }
  return appSdk.apiRequest(storeId, resource, method, data)
}
