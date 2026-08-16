const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const CONFIG = {
  port: process.env.PORT || 3000,
  apiUrl: 'https://api.deliveryvip.com.br',
  clientId: '37VRXfJKDRLWo9NYpOO3mqYQVx1FJxjWiHxuA-fkwaM',
  clientSecret: '7c6r0i47NdGFJW8t8sA48E84C73Cj2kjDaRwvvl4iZs',
  merchantId: '11c151b6-01b8-4d9a-8cb4-d8cedbe3412d'
};

const onlineDrivers = new Map();
const orderAssignments = new Map();
const completedOrdersStore = new Map();
const dispatchedOrdersSet = new Set();

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

function normalizePhone(phoneStr) {
  if (!phoneStr) return '';
  const digits = String(phoneStr).replace(/\D/g, '');
  if (digits.length > 11 && digits.startsWith('55')) {
    return digits.slice(2);
  }
  return digits;
}

// Motoboy padrao
onlineDrivers.set('62993891884', {
  id: 'drv_62993891884',
  name: 'Gabriel Motoboy',
  phone: '62993891884',
  status: 'AVAILABLE',
  lastSeen: new Date().toISOString()
});

function httpsRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ statusCode: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body: data });
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

// OAuth 2.0 Token
async function getOAuthToken() {
  const postData = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CONFIG.clientId,
    client_secret: CONFIG.clientSecret,
    scope: 'od.all dv.partner'
  }).toString();

  const options = {
    hostname: 'api.deliveryvip.com.br',
    path: '/authentication/v1/oauth/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const res = await httpsRequest(options, postData);
  if (res.body && res.body.access_token) {
    return res.body.access_token;
  }
  throw new Error('Falha OAuth 2.0 DeliveryVip');
}

// Enviar Transição de Status Despachado (Dispatch) para a DeliveryVip
async function notifyMerchantDispatchToDeliveryVip(orderUuid, token) {
  if (dispatchedOrdersSet.has(orderUuid)) return;
  dispatchedOrdersSet.add(orderUuid);

  try {
    const options = {
      hostname: 'api.deliveryvip.com.br',
      path: `/merchant/v3/orders/${orderUuid}/dispatch`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };
    await httpsRequest(options);
  } catch (e) {}
}

// Buscar Pedidos Ativos de Entrega Despachados na DeliveryVip
async function getActiveDeliveryVipOrders() {
  const token = await getOAuthToken();
  const options = {
    hostname: 'api.deliveryvip.com.br',
    path: `/merchant/v3/${CONFIG.merchantId}/orders`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };

  const res = await httpsRequest(options);
  if (Array.isArray(res.body)) {
    const dispatchedDeliveryOrders = res.body.filter(o => {
      const isConcludedOrCancelled = o.lastEvent === 'CONCLUDED' || o.lastEvent === 'CANCELLED';
      const isDelivery = o.type === 'DELIVERY' || (o.delivery && !o.takeout);
      
      const isDispatchedByOperator = 
        o.lastEvent === 'READY_FOR_PICKUP' || 
        o.lastEvent === 'DISPATCHED' || 
        o.lastEvent === 'DELIVERY_ONGOING' || 
        Boolean(o.dispatchedDateTime);

      return !isConcludedOrCancelled && isDelivery && isDispatchedByOperator;
    });

    const driversList = Array.from(onlineDrivers.values());
    const activeDriver = driversList.find(d => d.status === 'AVAILABLE') || driversList[0];

    if (activeDriver) {
      const cleanPhone = normalizePhone(activeDriver.phone);

      for (const order of dispatchedDeliveryOrders) {
        if (!orderAssignments.has(order.displayId) && !orderAssignments.has(order.id)) {
          orderAssignments.set(order.displayId, {
            driverPhone: cleanPhone,
            driverName: activeDriver.name,
            assignedAt: new Date().toISOString()
          });
          orderAssignments.set(order.id, {
            driverPhone: cleanPhone,
            driverName: activeDriver.name,
            assignedAt: new Date().toISOString()
          });
        }

        if (order.lastEvent === 'READY_FOR_PICKUP') {
          notifyMerchantDispatchToDeliveryVip(order.id, token).catch(() => {});
        }
      }
    }

    return dispatchedDeliveryOrders;
  }
  return [];
}

// Confirmar Entrega
async function confirmDeliveryOnDeliveryVip(orderCode, driverName) {
  const cleanCode = String(orderCode).replace(/^#+/, '').trim().toUpperCase();
  const token = await getOAuthToken();

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const listOptions = {
    hostname: 'api.deliveryvip.com.br',
    path: `/merchant/v3/${CONFIG.merchantId}/orders`,
    method: 'GET',
    headers: headers
  };

  const listRes = await httpsRequest(listOptions);
  let targetUuid = cleanCode;
  let orderObject = null;

  if (Array.isArray(listRes.body)) {
    const found = listRes.body.find(o => o.displayId === cleanCode || o.id === cleanCode);
    if (found) {
      targetUuid = found.id;
      orderObject = found;
    }
  }

  const deliveredOptions = {
    hostname: 'api.deliveryvip.com.br',
    path: `/merchant/v3/orders/${targetUuid}/delivered`,
    method: 'POST',
    headers: headers
  };
  await httpsRequest(deliveredOptions);

  completedOrdersStore.set(cleanCode, {
    displayId: cleanCode,
    uuid: targetUuid,
    customerName: orderObject?.customer?.name || 'Cliente',
    address: orderObject?.delivery?.deliveryAddress?.formattedAddress || 'Endereço de Entrega',
    total: orderObject?.total?.orderAmount?.value || 0,
    deliveredAt: new Date().toISOString(),
    driverName: driverName || 'Gabriel Motoboy'
  });

  orderAssignments.delete(cleanCode);
  orderAssignments.delete(targetUuid);

  return {
    success: true,
    message: `Sucesso! O pedido #${cleanCode} foi marcado como ENTREGUE (CONCLUDED) na DeliveryVip!`,
    displayId: cleanCode,
    orderUuid: targetUuid
  };
}

function pruneCompletedOrdersOlderThan12Hours() {
  const nowMs = Date.now();
  for (const [code, item] of completedOrdersStore.entries()) {
    const deliveredMs = new Date(item.deliveredAt).getTime();
    if ((nowMs - deliveredMs) > TWELVE_HOURS_MS) {
      completedOrdersStore.delete(code);
    }
  }
}

// Servidor HTTP
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const parsedUrl = url.parse(req.url, true);

  // Servir manifest.json para PWA
  if (parsedUrl.pathname === '/manifest.json') {
    const filePath = path.join(__dirname, 'manifest.json');
    fs.readFile(filePath, (err, content) => {
      if (err) { res.writeHead(404); res.end(); }
      else { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(content); }
    });
    return;
  }

  // Servir sw.js para Service Worker PWA
  if (parsedUrl.pathname === '/sw.js') {
    const filePath = path.join(__dirname, 'sw.js');
    fs.readFile(filePath, (err, content) => {
      if (err) { res.writeHead(404); res.end(); }
      else { res.writeHead(200, { 'Content-Type': 'application/javascript' }); res.end(content); }
    });
    return;
  }

  // Rota 1: Confirmar Entrega
  if (req.method === 'POST' && parsedUrl.pathname === '/api/driver/confirm-by-code') {
    let bodyData = '';
    req.on('data', chunk => bodyData += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(bodyData);
        const result = await confirmDeliveryOnDeliveryVip(payload.orderCode, payload.driverName);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: { message: err.message || 'Erro DeliveryVip' } }));
      }
    });
    return;
  }

  // Rota 2: Login do Motoboy
  if (req.method === 'POST' && parsedUrl.pathname === '/api/driver/login') {
    let bodyData = '';
    req.on('data', chunk => bodyData += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(bodyData);
        if (!payload.name || !payload.phone) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: { message: 'Informe nome e telefone do motoboy.' } }));
        }

        const driverKey = normalizePhone(payload.phone);
        const driverData = {
          id: 'drv_' + driverKey,
          name: payload.name.trim(),
          phone: driverKey,
          status: payload.status || 'AVAILABLE',
          lastSeen: new Date().toISOString()
        };

        onlineDrivers.set(driverKey, driverData);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, driver: driverData }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: { message: 'Erro ao registrar motoboy' } }));
      }
    });
    return;
  }

  // Rota 3: Listar Frota de Motoboys Online
  if (req.method === 'GET' && (
      parsedUrl.pathname === '/api/driver/list' ||
      parsedUrl.pathname === '/merchant/v1/drivers' ||
      parsedUrl.pathname.includes('/drivers')
  )) {
    const list = Array.from(onlineDrivers.values());
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, drivers: list, count: list.length }));
    return;
  }

  // Rota 4: Entregas Despachadas do Motoboy Logado
  if (req.method === 'GET' && parsedUrl.pathname === '/api/driver/my-orders') {
    try {
      const driverPhone = normalizePhone(parsedUrl.query.phone || '');
      const dispatchedOrders = await getActiveDeliveryVipOrders();

      const activeOrders = dispatchedOrders;

      pruneCompletedOrdersOlderThan12Hours();
      const validCompletedList = Array.from(completedOrdersStore.values());

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        activeOrders: activeOrders,
        completedOrders: validCompletedList
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: { message: err.message } }));
    }
    return;
  }

  // Servir driver_portal.html
  if (parsedUrl.pathname === '/' || parsedUrl.pathname === '/driver_portal.html') {
    const filePath = path.join(__dirname, 'driver_portal.html');
    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(500);
        res.end('Erro ao carregar driver_portal.html');
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(content);
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Rota não encontrada');
});

setInterval(() => {
  getActiveDeliveryVipOrders().catch(() => {});
}, 2000);

setInterval(() => {
  pruneCompletedOrdersOlderThan12Hours();
}, 60000);

server.listen(CONFIG.port, () => {
  console.log(`=======================================================`);
  console.log(`  Servidor DeliveryVip Ativo em: http://localhost:${CONFIG.port}`);
  console.log(`  Loja: COMPETILIVERY (${CONFIG.merchantId})`);
  console.log(`=======================================================`);
});
