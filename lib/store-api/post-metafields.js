module.exports = (appSdk, storeId, orderId, field, value) => {
  let url = `orders/${orderId}/hidden_metafields.json`
  let method = 'POST'
  let data = {
    namespace: 'APPSES',
    field,
    value
  }
  return appSdk.apiRequest(storeId, url, method, data)
}
