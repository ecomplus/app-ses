module.exports = (appSdk, storeId, customerId) => {
  let url = `/customers/${customerId}.json`
  let method = 'GET'
  return appSdk.apiRequest(storeId, url, method).then(result => result.response.data)
}
