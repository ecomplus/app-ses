module.exports = (appSdk, storeId, orderId) => {
  let url = `/orders/${orderId}.json`
  let method = 'GET'
  return appSdk.apiRequest(storeId, url, method).then(result => result.response.data)
}
