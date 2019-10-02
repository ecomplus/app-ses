module.exports = (appSdk, storeId, orderId, historyId, resource) => {
  let url = `orders/${orderId}/${resource}/${historyId}.json`
  let method = 'PATCH'
  let data = {
    customer_notified: true
  }
  return appSdk.apiRequest(storeId, url, method, data)
}
