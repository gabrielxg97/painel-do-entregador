const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3001;

// Fila em memória de eventos pendentes para o polling
let mockEventsQueue = [
  {
    eventId: 'evt-test-uuid-001',
    eventType: 'CREATED',
    orderId: 'order-vip-1001',
    orderUrl: 'https://api.deliveryvip.com.br/merchant/v3/orders/order-vip-1001',
    orderType: 'DELIVERY',
    merchantId: 'default_merchant_uuid',
    createdAt: new Date().toISOString(),
  },
];

// Banco em memória de pedidos mock
const mockOrdersDB = {
  'order-vip-1001': {
    id: 'order-vip-1001',
    displayId: '1001',
    type: 'DELIVERY',
    salesChannel: 'MARKETPLACE',
    orderTiming: 'INSTANT',
    createdAt: new Date().toISOString(),
    merchant: { id: 'default_merchant_uuid', name: 'Restaurante Exemplo' },
    customer: {
      id: 'cust-501',
      name: 'Maria Oliveira',
      phone: { number: '11988887777', extension: '' },
      documentNumber: '987.654.321-11',
      ordersCountOnMerchant: 5,
    },
    delivery: {
      deliveryAddress: {
        country: 'BR',
        state: 'SP',
        city: 'São Paulo',
        neighborhood: 'Pinheiros',
        streetName: 'Rua dos Pinheiros',
        streetNumber: '500',
        complement: 'Apto 42',
        reference: 'Próximo ao Metrô Fradique Coutinho',
        formattedAddress: 'Rua dos Pinheiros, 500, Apto 42 - Pinheiros, São Paulo - SP',
        postalCode: '05422-000',
        coordinates: { latitude: -23.565, longitude: -46.685 },
      },
    },
    items: [
      {
        id: 'item-01',
        name: 'Hambúrguer Artesanal Smash Bacon',
        quantity: 2,
        unitPrice: 35.0,
        optionsPrice: 5.0,
        totalPrice: 80.0,
        unit: 'UN',
        options: [
          { id: 'opt-01', name: 'Queijo Cheddar Extra', quantity: 2, unitPrice: 2.5, totalPrice: 5.0 },
        ],
      },
      {
        id: 'item-02',
        name: 'Refrigerante Guaraná 350ml',
        quantity: 2,
        unitPrice: 8.0,
        optionsPrice: 0,
        totalPrice: 16.0,
        unit: 'UN',
      },
    ],
    total: {
      subTotal: 96.0,
      deliveryFee: 10.0,
      benefits: 6.0,
      orderAmount: 100.0,
    },
    payments: {
      methods: [
        {
          value: 100.0,
          currency: 'BRL',
          prepaid: true,
          method: 'PIX',
        },
      ],
    },
  },
};

// 1. OAuth 2.0 Token Endpoint
app.post('/authentication/v1/oauth/token', (req, res) => {
  console.log('[MOCK DELIVERYVIP] POST /authentication/v1/oauth/token');
  res.json({
    access_token: 'mock_jwt_token_deliveryvip_24h_validity',
    token_type: 'Bearer',
    expires_in: 86400,
    scope: 'od.all dv.partner',
  });
});

// 2. Polling de Eventos Endpoint
app.get('/merchant/v3/events:polling', (req, res) => {
  const merchantIdHeader = req.headers['x-polling-merchants'];
  console.log(`[MOCK DELIVERYVIP] GET /merchant/v3/events:polling (Merchant Header: ${merchantIdHeader})`);

  // Retorna eventos na fila e limpa
  const eventsToSend = [...mockEventsQueue];
  res.json(eventsToSend);
});

// 3. Acknowledgment Endpoint
app.post('/merchant/v3/events/acknowledgment', (req, res) => {
  const ackList = req.body;
  console.log(`[MOCK DELIVERYVIP] POST /merchant/v3/events/acknowledgment: Recebido ACK de ${ackList.length} eventos:`, ackList);
  
  // Remover eventos confirmados da fila de polling
  if (Array.isArray(ackList)) {
    const ackIds = ackList.map((a) => a.id);
    mockEventsQueue = mockEventsQueue.filter((e) => !ackIds.includes(e.eventId));
  }

  res.status(200).json({ success: true, message: 'ACK recebido com sucesso' });
});

// 4. Detalhes de Pedido Endpoint
app.get('/merchant/v3/orders/:orderId', (req, res) => {
  const { orderId } = req.params;
  console.log(`[MOCK DELIVERYVIP] GET /merchant/v3/orders/${orderId}`);

  const order = mockOrdersDB[orderId];
  if (order) {
    res.json(order);
  } else {
    // Retornar pedido genérico se não estiver pré-cadastrado
    res.json({
      id: orderId,
      displayId: orderId.slice(-4),
      type: 'DELIVERY',
      salesChannel: 'MARKETPLACE',
      orderTiming: 'INSTANT',
      createdAt: new Date().toISOString(),
      customer: { name: 'Cliente de Teste Mock', phone: '11977776666' },
      delivery: {
        deliveryAddress: {
          formattedAddress: 'Av. Paulista, 1000 - Bela Vista, SP',
          coordinates: { latitude: -23.561, longitude: -46.656 },
        },
      },
      items: [{ id: 'item-generic', name: 'Pizza Grande Calabresa', quantity: 1, unitPrice: 50.0, totalPrice: 50.0 }],
      total: { subTotal: 50.0, deliveryFee: 8.0, benefits: 0, orderAmount: 58.0 },
      payments: { methods: [{ value: 58.0, currency: 'BRL', prepaid: true, method: 'CREDIT' }] },
    });
  }
});

// 5. Listagem de Pedidos Endpoint
app.get('/merchant/v3/:merchantId/orders', (req, res) => {
  res.json({ orders: Object.values(mockOrdersDB) });
});

// 6. Confirmação de Pedido Endpoint
app.post('/merchant/v3/orders/:orderId/confirm', (req, res) => {
  console.log(`[MOCK DELIVERYVIP] POST /merchant/v3/orders/${req.params.orderId}/confirm`, req.body);
  res.status(200).json({ success: true, status: 'CONFIRMED' });
});

// 7. Preparando Endpoint
app.post('/merchant/v3/orders/:orderId/preparing', (req, res) => {
  console.log(`[MOCK DELIVERYVIP] POST /merchant/v3/orders/${req.params.orderId}/preparing`);
  res.status(200).json({ success: true, status: 'PREPARING' });
});

// 8. Pronto para Retirada Endpoint
app.post('/merchant/v3/orders/:orderId/readyForPickup', (req, res) => {
  console.log(`[MOCK DELIVERYVIP] POST /merchant/v3/orders/${req.params.orderId}/readyForPickup`);
  res.status(200).json({ success: true, status: 'READY_FOR_PICKUP' });
});

// 9. Despachar Endpoint
app.post('/merchant/v3/orders/:orderId/dispatch', (req, res) => {
  console.log(`[MOCK DELIVERYVIP] POST /merchant/v3/orders/${req.params.orderId}/dispatch`);
  res.status(200).json({ success: true, status: 'DISPATCHED' });
});

// 10. Retirado Endpoint
app.post('/merchant/v3/orders/:orderId/pickedUp', (req, res) => {
  console.log(`[MOCK DELIVERYVIP] POST /merchant/v3/orders/${req.params.orderId}/pickedUp`);
  res.status(200).json({ success: true, status: 'PICKED_UP' });
});

// 11. Entregue Endpoint
app.post('/merchant/v3/orders/:orderId/delivered', (req, res) => {
  console.log(`[MOCK DELIVERYVIP] POST /merchant/v3/orders/${req.params.orderId}/delivered`);
  res.status(200).json({ success: true, status: 'DELIVERED' });
});

// 12. Solicitacao de Cancelamento Endpoint
app.post('/merchant/v3/orders/:orderId/requestCancellation', (req, res) => {
  console.log(`[MOCK DELIVERYVIP] POST /merchant/v3/orders/${req.params.orderId}/requestCancellation`, req.body);
  res.status(200).json({ success: true, status: 'CANCELLATION_REQUESTED' });
});

// 13. Tracking Endpoint
app.post('/merchant/v3/orders/:orderId/tracking', (req, res) => {
  console.log(`[MOCK DELIVERYVIP] POST /merchant/v3/orders/${req.params.orderId}/tracking`, JSON.stringify(req.body));
  res.status(200).json({ success: true });
});

// --- HELPER ENDPOINTS PARA TESTES DE DESENVOLVIMENTO ---
// Disparar novo evento simulado para testar o Polling Worker
app.post('/mock/trigger-event', (req, res) => {
  const { eventType, orderId } = req.body;
  const newEventId = `evt-${Date.now()}`;
  const targetOrderId = orderId || `order-vip-${Math.floor(1000 + Math.random() * 9000)}`;

  const newEvent = {
    eventId: newEventId,
    eventType: eventType || 'CREATED',
    orderId: targetOrderId,
    orderUrl: `https://api.deliveryvip.com.br/merchant/v3/orders/${targetOrderId}`,
    orderType: 'DELIVERY',
    merchantId: 'default_merchant_uuid',
    createdAt: new Date().toISOString(),
  };

  mockEventsQueue.push(newEvent);
  console.log(`[MOCK DELIVERYVIP] Novo evento simulado inserido na fila: ${newEventId} (${newEvent.eventType})`);
  res.json({ success: true, event: newEvent });
});

app.listen(PORT, () => {
  console.log(`⚡ Servidor Mock da DeliveryVip rodando em http://localhost:${PORT}`);
});
