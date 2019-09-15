module.exports = (appSdk, storeId) => {
  let url = '/stores/me.json'
  let method = 'GET'
  return appSdk.apiRequest(storeId, url, method).then(result => result.response.data)
}
