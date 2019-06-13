'use strict'

// TODO: i18n is missing here!

const actions = [
  {
    action: 'boas-vindas',
    template: 'boas-vindas.html',
    subject: 'Boas vindas!'
  },
  {
    action: 'carrinho-abandonado',
    template: 'carrinho-abandonado.html',
    subject: 'Carrinho abandonado'
  },
  {
    action: 'nota-fiscal',
    template: 'nota-fiscal.html',
    subject: 'Nota fiscal emitida'
  },
  {
    action: 'pacote-enviado',
    template: 'pacote-enviado.html',
    subject: 'Seu produto está a caminho!'
  },
  {
    action: 'pagamento-aprovado',
    template: 'pagamento-aprovado.html',
    subject: 'Pagamento aprovado!'
  },
  {
    action: 'pedido-recebido',
    template: 'pedido-recebido.html',
    subject: 'Pedido recebido com sucesso'
  },
  {
    action: 'produto-entregue',
    template: 'produto-entregue.html',
    subject: 'Produto entregue'
  }
]

module.exports = actions
