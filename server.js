const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const DEFAULT_CONFIG = {
  port: process.env.PORT || 3000,
  apiUrl: 'https://api.deliveryvip.com.br',
  clientId: '37VRXfJKDRLWo9NYpOO3mqYQVx1FJxjWiHxuA-fkwaM',
  clientSecret: '7c6r0i47NdGFJW8t8sA48E84C73Cj2kjDaRwvvl4iZs',
  merchantId: '11c151b6-01b8-4d9a-8cb4-d8cedbe3412d'
};

const STORES_FILE_PATH = path.join(__dirname, 'stores.json');

// Carregar ou Inicializar Banco de Lojas (stores.json)
function loadStoresFromDisk() {
  try {
    if (fs.existsSync(STORES_FILE_PATH)) {
      const data = fs.readFileSync(STORES_FILE_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {}

  const defaultStores = [
    {
      id: 'store_11c151b6-01b8-4d9a-8cb4-d8cedbe3412d',
      name: 'CompetiLivery',
      slug: 'competilivery',
      merchantId: DEFAULT_CONFIG.merchantId,
      clientId: DEFAULT_CONFIG.clientId,
      clientSecret: DEFAULT_CONFIG.clientSecret,
      ownerEmail: 'gabriel.gomes@competilivery.com.br',
      createdAt: new Date().toISOString(),
      status: 'ACTIVE',
      dispatchMode: 'MANUAL_SELECT'
    }
  ];
  saveStoresToDisk(defaultStores);
  return defaultStores;
}

function saveStoresToDisk(storesList) {
  try {
    fs.writeFileSync(STORES_FILE_PATH, JSON.stringify(storesList, null, 2), 'utf8');
  } catch (e) {}
}

let stores = loadStoresFromDisk();

function getStoreBySlug(slug) {
  if (!slug) return stores[0];
  const cleanSlug = String(slug).toLowerCase().trim();
  return stores.find(s => s.slug === cleanSlug || s.merchantId === slug || s.id === slug) || stores[0];
}

const ASSIGNMENTS_FILE = path.join(__dirname, 'assignments.json');
const COMPLETED_ORDERS_FILE = path.join(__dirname, 'completed_orders.json');

function loadAssignmentsFromDisk() {
  try {
    if (fs.existsSync(ASSIGNMENTS_FILE)) {
      const data = fs.readFileSync(ASSIGNMENTS_FILE, 'utf8');
      const obj = JSON.parse(data);
      return new Map(Object.entries(obj));
    }
  } catch (e) {}
  return new Map();
}

function saveAssignmentsToDisk(map) {
  try {
    const obj = Object.fromEntries(map);
    fs.writeFileSync(ASSIGNMENTS_FILE, JSON.stringify(obj, null, 2), 'utf8');
  } catch (e) {}
}

function loadCompletedOrdersFromDisk() {
  try {
    if (fs.existsSync(COMPLETED_ORDERS_FILE)) {
      const data = fs.readFileSync(COMPLETED_ORDERS_FILE, 'utf8');
      const obj = JSON.parse(data);
      return new Map(Object.entries(obj));
    }
  } catch (e) {}
  return new Map();
}

function saveCompletedOrdersToDisk(map) {
  try {
    const obj = Object.fromEntries(map);
    fs.writeFileSync(COMPLETED_ORDERS_FILE, JSON.stringify(obj, null, 2), 'utf8');
  } catch (e) {}
}

const storeOnlineDrivers = new Map(); // key: `${storeId}_${driverPhone}`
const storeOrderAssignments = loadAssignmentsFromDisk(); // key: `${storeId}_${orderCode}`
const storeCompletedOrders = loadCompletedOrdersFromDisk(); // key: `${storeId}_${orderCode}`
const dispatchedOrdersSet = new Set();
const oauthTokenCache = new Map(); // key: storeId

const TWELVE_HOURS_MS = 48 * 60 * 60 * 1000; // 48 horas para manter histórico recente das lojas

function normalizePhone(phoneStr) {
  if (!phoneStr) return '';
  const digits = String(phoneStr).replace(/\D/g, '');
  if (digits.length > 11 && digits.startsWith('55')) {
    return digits.slice(2);
  }
  return digits;
}

function parseVal(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const clean = v.replace(/[^\d.,]/g, '').replace(',', '.');
    return parseFloat(clean) || 0;
  }
  if (v && typeof v.value === 'number') return v.value;
  if (v && typeof v.value === 'string') return parseVal(v.value);
  if (v && typeof v.amount === 'number') return v.amount;
  return 0;
}

function extractDeliveryFeeFromOrder(order) {
  if (!order) return 0;
  let fee = 0;

  if (typeof order.deliveryFee === 'number' && order.deliveryFee > 0) return order.deliveryFee;

  if (order.delivery && order.delivery.deliveryFee) fee = parseVal(order.delivery.deliveryFee);
  if (fee > 0) return fee;

  if (order.deliveryFee) fee = parseVal(order.deliveryFee);
  if (fee > 0) return fee;

  if (order.total) {
    if (order.total.deliveryFee) fee = parseVal(order.total.deliveryFee);
    if (fee > 0) return fee;
    if (order.total.otherFees) fee = parseVal(order.total.otherFees);
    if (fee > 0) return fee;
  }

  if (Array.isArray(order.otherFees)) {
    for (const f of order.otherFees) {
      const typeStr = (f.type || f.name || '').toUpperCase();
      if (typeStr.includes('DELIVERY') || typeStr.includes('ENTREGA') || typeStr.includes('TAXA') || typeStr.includes('FEE')) {
        fee = parseVal(f.price || f.value || f.amount || f);
        if (fee > 0) return fee;
      }
    }
  }

  if (order.total && order.total.orderAmount && Array.isArray(order.items) && order.items.length > 0) {
    const totalVal = parseVal(order.total.orderAmount);
    const itemsSubtotal = order.items.reduce((sum, item) => {
      const itemPrice = parseVal(item.totalPrice) || (parseVal(item.unitPrice) * (item.quantity || 1));
      return sum + itemPrice;
    }, 0);

    if (totalVal > itemsSubtotal) {
      const diff = totalVal - itemsSubtotal;
      if (diff > 0) return diff;
    }
  }

  return 0;
}

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

async function getOAuthTokenForStore(store) {
  const storeId = store ? store.id : 'default';
  const cached = oauthTokenCache.get(storeId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  const clientId = (store && store.clientId) ? store.clientId : DEFAULT_CONFIG.clientId;
  const clientSecret = (store && store.clientSecret) ? store.clientSecret : DEFAULT_CONFIG.clientSecret;

  const postData = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
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
    const token = res.body.access_token;
    oauthTokenCache.set(storeId, {
      token: token,
      expiresAt: Date.now() + (3500 * 1000)
    });
    return token;
  }
  throw new Error(`Falha OAuth 2.0 DeliveryVip para loja ${store ? store.name : ''}`);
}

async function notifyMerchantDispatchToDeliveryVip(store, orderUuid, token) {
  if (!token) token = await getOAuthTokenForStore(store);
  const key = `${store.id}_${orderUuid}`;
  if (dispatchedOrdersSet.has(key)) return;
  dispatchedOrdersSet.add(key);

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

async function getAllDeliveryVipOrdersRaw(store) {
  try {
    const token = await getOAuthTokenForStore(store);
    const merchantId = store ? store.merchantId : DEFAULT_CONFIG.merchantId;

    const options = {
      hostname: 'api.deliveryvip.com.br',
      path: `/merchant/v3/${merchantId}/orders`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };

    const res = await httpsRequest(options);
    if (Array.isArray(res.body)) {
      return res.body;
    }
  } catch (e) {}
  return [];
}

async function getActiveDeliveryVipOrders(store) {
  const token = await getOAuthTokenForStore(store);
  const rawOrders = await getAllDeliveryVipOrdersRaw(store);
  const storeId = store.id;

  const dispatchedDeliveryOrders = rawOrders.filter(o => {
    const isConcludedOrCancelled = o.lastEvent === 'CONCLUDED' || o.lastEvent === 'CANCELLED';
    const isDelivery = o.type === 'DELIVERY' || (o.delivery && !o.takeout);

    const isDispatchedByOperator = 
      o.lastEvent === 'READY_FOR_PICKUP' || 
      o.lastEvent === 'DISPATCHED' || 
      o.lastEvent === 'DELIVERY_ONGOING' || 
      Boolean(o.dispatchedDateTime) ||
      storeOrderAssignments.has(`${storeId}_${o.displayId}`) ||
      storeOrderAssignments.has(`${storeId}_${o.id}`);

    return !isConcludedOrCancelled && isDelivery && isDispatchedByOperator;
  });

  if (store.dispatchMode === 'AUTO_SINGLE') {
    const driversList = Array.from(storeOnlineDrivers.values()).filter(d => d.storeId === storeId);
    const activeDriver = driversList.find(d => d.status === 'AVAILABLE') || driversList[0];

    if (activeDriver) {
      const cleanPhone = normalizePhone(activeDriver.phone);

      for (const order of dispatchedDeliveryOrders) {
        const keyDisplay = `${storeId}_${order.displayId}`;
        const keyUuid = `${storeId}_${order.id}`;

        if (!storeOrderAssignments.has(keyDisplay) && !storeOrderAssignments.has(keyUuid)) {
          const assignObj = {
            driverPhone: cleanPhone,
            driverName: activeDriver.name,
            assignedAt: new Date().toISOString()
          };
          storeOrderAssignments.set(keyDisplay, assignObj);
          storeOrderAssignments.set(keyUuid, assignObj);
        }

        if (order.lastEvent === 'READY_FOR_PICKUP') {
          notifyMerchantDispatchToDeliveryVip(store, order.id, token).catch(() => {});
        }
      }
    }
  }

  return dispatchedDeliveryOrders;
}

async function confirmDeliveryOnDeliveryVip(store, orderCode, driverName, driverPhone) {
  const cleanCode = String(orderCode).replace(/^#+/, '').trim().toUpperCase();
  const token = await getOAuthTokenForStore(store);
  const storeId = store.id;

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const rawOrders = await getAllDeliveryVipOrdersRaw(store);
  let targetUuid = cleanCode;
  let orderObject = null;

  if (Array.isArray(rawOrders)) {
    const found = rawOrders.find(o => o.displayId === cleanCode || o.id === cleanCode);
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

  const keyDisplay = `${storeId}_${cleanCode}`;
  const keyUuid = `${storeId}_${targetUuid}`;
  const assignment = storeOrderAssignments.get(keyDisplay) || storeOrderAssignments.get(keyUuid);
  const cleanPhone = normalizePhone(driverPhone || assignment?.driverPhone || '');
  const deliveryFeeVal = extractDeliveryFeeFromOrder(orderObject);

  storeCompletedOrders.set(keyDisplay, {
    storeId,
    displayId: cleanCode,
    uuid: targetUuid,
    customerName: orderObject?.customer?.name || 'Cliente',
    address: orderObject?.delivery?.deliveryAddress?.formattedAddress || 'Endereço de Entrega',
    total: orderObject?.total?.orderAmount?.value || 0,
    deliveryFee: deliveryFeeVal,
    deliveredAt: new Date().toISOString(),
    driverName: driverName || assignment?.driverName || 'Motoboy',
    driverPhone: cleanPhone
  });

  storeOrderAssignments.delete(keyDisplay);
  storeOrderAssignments.delete(keyUuid);

  return {
    success: true,
    message: `Sucesso! O pedido #${cleanCode} da loja ${store.name} foi marcado como ENTREGUE (CONCLUDED) na DeliveryVip!`,
    displayId: cleanCode,
    orderUuid: targetUuid
  };
}

function pruneCompletedOrdersOlderThan12Hours() {
  const nowMs = Date.now();
  for (const [key, item] of storeCompletedOrders.entries()) {
    const deliveredMs = new Date(item.deliveredAt).getTime();
    if ((nowMs - deliveredMs) > TWELVE_HOURS_MS) {
      storeCompletedOrders.delete(key);
    }
  }
}

// SERVIDOR MULTI-TENANT SAAS
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // 1. Arquivos Estáticos PWA
  if (pathname === '/manifest.json') {
    const filePath = path.join(__dirname, 'manifest.json');
    fs.readFile(filePath, (err, content) => {
      if (err) { res.writeHead(404); res.end(); }
      else { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(content); }
    });
    return;
  }

  if (pathname === '/sw.js') {
    const filePath = path.join(__dirname, 'sw.js');
    fs.readFile(filePath, (err, content) => {
      if (err) { res.writeHead(404); res.end(); }
      else { res.writeHead(200, { 'Content-Type': 'application/javascript' }); res.end(content); }
    });
    return;
  }

  // 2. ENDPOINTS DA API SUPER ADMIN (/api/saas/...)
  if (pathname === '/api/saas/stores') {
    if (req.method === 'GET') {
      stores = loadStoresFromDisk();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        stores: stores,
        onlineDriversCount: storeOnlineDrivers.size
      }));
    }
  }

  if (pathname === '/api/saas/stores/save' && req.method === 'POST') {
    let bodyData = '';
    req.on('data', chunk => bodyData += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(bodyData);
        if (!payload.name || !payload.merchantId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: { message: 'Informe nome da loja e Merchant ID' } }));
        }

        const slug = payload.slug || payload.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const storeId = payload.id || `store_${payload.merchantId}`;

        const existingIndex = stores.findIndex(s => s.id === storeId || s.slug === slug);

        const storeObj = {
          id: storeId,
          name: payload.name.trim(),
          slug: slug,
          merchantId: payload.merchantId.trim(),
          clientId: payload.clientId ? payload.clientId.trim() : DEFAULT_CONFIG.clientId,
          clientSecret: payload.clientSecret ? payload.clientSecret.trim() : DEFAULT_CONFIG.clientSecret,
          ownerEmail: payload.ownerEmail ? payload.ownerEmail.trim() : '',
          logoUrl: payload.logoUrl ? payload.logoUrl.trim() : (existingIndex >= 0 ? stores[existingIndex].logoUrl : ''),
          createdAt: existingIndex >= 0 ? stores[existingIndex].createdAt : new Date().toISOString(),
          status: 'ACTIVE',
          dispatchMode: existingIndex >= 0 ? stores[existingIndex].dispatchMode : 'MANUAL_SELECT'
        };

        if (existingIndex >= 0) {
          stores[existingIndex] = { ...stores[existingIndex], ...storeObj };
        } else {
          stores.push(storeObj);
        }

        saveStoresToDisk(stores);

        // SINCRONIZAÇÃO INSTANTÂNEA NO PRIMEIRO MOMENTO DO CADASTRO DA LOJA
        setTimeout(() => {
          getAllDeliveryVipOrdersRaw(storeObj).then(rawOrders => {
            if (Array.isArray(rawOrders)) {
              rawOrders.forEach(o => {
                if (o.lastEvent === 'CONCLUDED' && (o.type === 'DELIVERY' || o.delivery)) {
                  const keyDisplay = `${storeObj.id}_${o.displayId}`;
                  if (!storeCompletedOrders.has(keyDisplay)) {
                    const createdMs = new Date(o.createdAt || Date.now()).getTime();
                    if ((Date.now() - createdMs) < TWELVE_HOURS_MS) {
                      const fee = extractDeliveryFeeFromOrder(o);
                      storeCompletedOrders.set(keyDisplay, {
                        storeId: storeObj.id,
                        displayId: o.displayId || o.id,
                        uuid: o.id,
                        customerName: o.customer?.name || 'Cliente',
                        address: o.delivery?.deliveryAddress?.formattedAddress || 'Endereço de Entrega',
                        total: o.total?.orderAmount?.value || 0,
                        deliveryFee: fee,
                        deliveredAt: o.createdAt || new Date().toISOString(),
                        driverName: 'Entregador DeliveryVip',
                        driverPhone: ''
                      });
                    }
                  }
                }
              });
            }
          }).catch(() => {});
          getActiveDeliveryVipOrders(storeObj).catch(() => {});
        }, 10);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, store: storeObj }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: { message: err.message } }));
      }
    });
    return;
  }

  // Identificação Dinâmica da Loja Solicitada por URL
  let requestedSlug = parsedUrl.query.store || '';
  if (!requestedSlug && pathname.startsWith('/store/')) {
    const parts = pathname.split('/');
    if (parts.length >= 3) {
      requestedSlug = parts[2];
    }
  }

  const activeStore = getStoreBySlug(requestedSlug);
  const storeId = activeStore.id;

  // 3. ENDPOINTS DA API DA LOJA ADM (/api/admin/...)
  if (pathname === '/api/admin/settings') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, store: activeStore, settings: { dispatchMode: activeStore.dispatchMode || 'MANUAL_SELECT' } }));
    }
    if (req.method === 'POST') {
      let bodyData = '';
      req.on('data', chunk => bodyData += chunk);
      req.on('end', () => {
        try {
          const payload = JSON.parse(bodyData);
          if (payload.dispatchMode) activeStore.dispatchMode = payload.dispatchMode;
          saveStoresToDisk(stores);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, store: activeStore }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: { message: 'Erro ao salvar' } }));
        }
      });
      return;
    }
  }

  if (req.method === 'GET' && pathname === '/api/admin/orders') {
    try {
      const rawOrders = await getAllDeliveryVipOrdersRaw(activeStore);

      // IMPORTAÇÃO AUTOMÁTICA DE PEDIDOS CONCLUÍDOS COM PRESERVAÇÃO DE MOTOBOY
      if (Array.isArray(rawOrders)) {
        rawOrders.forEach(o => {
          if (o.lastEvent === 'CONCLUDED' && (o.type === 'DELIVERY' || o.delivery)) {
            const keyDisplay = `${storeId}_${o.displayId}`;
            const keyUuid = `${storeId}_${o.id}`;

            const existing = storeCompletedOrders.get(keyDisplay) || storeCompletedOrders.get(keyUuid);
            const assignment = storeOrderAssignments.get(keyDisplay) || storeOrderAssignments.get(keyUuid);

            const resolvedDriverName = (existing && existing.driverName && existing.driverName !== 'Entregador DeliveryVip')
              ? existing.driverName
              : (assignment ? assignment.driverName : (o.assignedDriverName || 'Motoboy Loja'));

            const resolvedDriverPhone = (existing && existing.driverPhone)
              ? existing.driverPhone
              : (assignment ? assignment.driverPhone : '');

            const createdMs = new Date(o.createdAt || Date.now()).getTime();
            if ((Date.now() - createdMs) < TWELVE_HOURS_MS) {
              const fee = extractDeliveryFeeFromOrder(o);
              const completedObj = {
                storeId: storeId,
                displayId: o.displayId || o.id,
                uuid: o.id,
                customerName: o.customer?.name || 'Cliente',
                address: o.delivery?.deliveryAddress?.formattedAddress || 'Endereço de Entrega',
                total: o.total?.orderAmount?.value || 0,
                deliveryFee: fee,
                deliveredAt: existing?.deliveredAt || o.createdAt || new Date().toISOString(),
                driverName: resolvedDriverName,
                driverPhone: resolvedDriverPhone
              };

              storeCompletedOrders.set(keyDisplay, completedObj);
              if (o.id) storeCompletedOrders.set(keyUuid, completedObj);
            }
          }
        });
        saveCompletedOrdersToDisk(storeCompletedOrders);
      }

      const preparingOrders = rawOrders.filter(o => {
        const isConcludedOrCancelled = o.lastEvent === 'CONCLUDED' || o.lastEvent === 'CANCELLED';
        const isDelivery = o.type === 'DELIVERY' || (o.delivery && !o.takeout);
        const isDispatched = storeOrderAssignments.has(`${storeId}_${o.displayId}`) || storeOrderAssignments.has(`${storeId}_${o.id}`);
        return !isConcludedOrCancelled && isDelivery && !isDispatched;
      });

      const ongoingDeliveryOrders = rawOrders.filter(o => {
        const isConcludedOrCancelled = o.lastEvent === 'CONCLUDED' || o.lastEvent === 'CANCELLED';
        const isDelivery = o.type === 'DELIVERY' || (o.delivery && !o.takeout);
        const isDispatched = storeOrderAssignments.has(`${storeId}_${o.displayId}`) || storeOrderAssignments.has(`${storeId}_${o.id}`);
        return !isConcludedOrCancelled && isDelivery && isDispatched;
      }).map(o => {
        const assignment = storeOrderAssignments.get(`${storeId}_${o.displayId}`) || storeOrderAssignments.get(`${storeId}_${o.id}`);
        return {
          ...o,
          assignedDriverName: assignment ? assignment.driverName : 'Não Alocado',
          assignedDriverPhone: assignment ? assignment.driverPhone : ''
        };
      });

      pruneCompletedOrdersOlderThan12Hours();
      const validCompletedList = Array.from(storeCompletedOrders.values())
        .filter(c => c.storeId === storeId)
        .sort((a, b) => new Date(b.deliveredAt || 0).getTime() - new Date(a.deliveredAt || 0).getTime());
      const onlineDrivers = Array.from(storeOnlineDrivers.values()).filter(d => d.storeId === storeId);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        store: activeStore,
        preparingOrders,
        ongoingDeliveryOrders,
        completedOrders: validCompletedList,
        settings: { dispatchMode: activeStore.dispatchMode || 'MANUAL_SELECT' },
        onlineDrivers: onlineDrivers
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: { message: err.message } }));
    }
  }

  if (req.method === 'POST' && pathname === '/api/admin/assign-and-dispatch') {
    let bodyData = '';
    req.on('data', chunk => bodyData += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(bodyData);
        const { orderCode, driverPhone, driverName } = payload;

        if (!orderCode) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: { message: 'Informe o código do pedido' } }));
        }

        const cleanPhone = normalizePhone(driverPhone);
        const cleanCode = String(orderCode).replace(/^#+/, '').trim().toUpperCase();

        const assignObj = {
          driverPhone: cleanPhone,
          driverName: driverName || 'Motoboy',
          assignedAt: new Date().toISOString()
        };

        storeOrderAssignments.set(`${storeId}_${cleanCode}`, assignObj);

        const token = await getOAuthTokenForStore(activeStore);
        const rawOrders = await getAllDeliveryVipOrdersRaw(activeStore);
        const found = rawOrders.find(o => o.displayId === cleanCode || o.id === cleanCode);
        const targetUuid = found ? found.id : cleanCode;

        if (found) {
          storeOrderAssignments.set(`${storeId}_${targetUuid}`, assignObj);
        }

        saveAssignmentsToDisk(storeOrderAssignments);

        await notifyMerchantDispatchToDeliveryVip(activeStore, targetUuid, token);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: `Pedido #${cleanCode} da loja ${activeStore.name} alocado para ${driverName} e despachado!`,
          orderCode: cleanCode,
          driverName,
          driverPhone: cleanPhone
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: { message: err.message || 'Erro ao despachar' } }));
      }
    });
    return;
  }

  // 4. ENDPOINTS DA API DO ENTREGADOR (/api/driver/...)
  if (req.method === 'POST' && pathname === '/api/driver/login') {
    let bodyData = '';
    req.on('data', chunk => bodyData += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(bodyData);
        if (!payload.name || !payload.phone) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: { message: 'Informe nome e telefone.' } }));
        }

        const driverKey = normalizePhone(payload.phone);
        const fullDriverKey = `${storeId}_${driverKey}`;
        const driverData = {
          storeId,
          id: 'drv_' + driverKey,
          name: payload.name.trim(),
          phone: driverKey,
          status: payload.status || 'AVAILABLE',
          lastSeen: new Date().toISOString()
        };

        storeOnlineDrivers.set(fullDriverKey, driverData);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, driver: driverData }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: { message: 'Erro ao registrar motoboy' } }));
      }
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/driver/confirm-by-code') {
    let bodyData = '';
    req.on('data', chunk => bodyData += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(bodyData);
        const result = await confirmDeliveryOnDeliveryVip(activeStore, payload.orderCode, payload.driverName, payload.driverPhone);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: { message: err.message || 'Erro DeliveryVip' } }));
      }
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/driver/my-orders') {
    try {
      const driverPhone = normalizePhone(parsedUrl.query.phone || '');
      const dispatchedOrders = await getActiveDeliveryVipOrders(activeStore);

      const activeOrders = dispatchedOrders.filter(o => {
        const assignment = storeOrderAssignments.get(`${storeId}_${o.displayId}`) || storeOrderAssignments.get(`${storeId}_${o.id}`);
        if (!assignment) return false;
        return normalizePhone(assignment.driverPhone) === driverPhone;
      });

      pruneCompletedOrdersOlderThan12Hours();
      const validCompletedList = Array.from(storeCompletedOrders.values())
        .filter(item => {
          if (item.storeId !== storeId) return false;
          if (!driverPhone || !item.driverPhone) return false;
          return normalizePhone(item.driverPhone) === driverPhone;
        })
        .sort((a, b) => new Date(b.deliveredAt || 0).getTime() - new Date(a.deliveredAt || 0).getTime());

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        store: activeStore,
        activeOrders: activeOrders,
        completedOrders: validCompletedList
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: { message: err.message } }));
    }
  }

  // 5. ROTAS DE PÁGINAS HTML

  // Rota Super Admin (Proprietário do SaaS)
  if (pathname === '/superadmin' || pathname === '/saas_admin.html') {
    const filePath = path.join(__dirname, 'saas_admin.html');
    fs.readFile(filePath, (err, content) => {
      if (err) { res.writeHead(500); res.end('Erro saas_admin.html'); }
      else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(content); }
    });
    return;
  }

  // Servir Painel ADM de uma Loja Especifica
  if (pathname.includes('/admin')) {
    const filePath = path.join(__dirname, 'admin_portal.html');
    fs.readFile(filePath, (err, content) => {
      if (err) { res.writeHead(500); res.end('Erro admin_portal.html'); }
      else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(content); }
    });
    return;
  }

  // Servir Portal do Entregador de uma Loja Especifica
  if (pathname.includes('/driver') || pathname === '/') {
    const filePath = path.join(__dirname, 'driver_portal.html');
    fs.readFile(filePath, (err, content) => {
      if (err) { res.writeHead(500); res.end('Erro driver_portal.html'); }
      else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(content); }
    });
    return;
  }

  res.writeHead(404);
  res.end('Rota não encontrada');
});

setInterval(() => {
  for (const store of stores) {
    if (store.status === 'ACTIVE') {
      getActiveDeliveryVipOrders(store).catch(() => {});
    }
  }
}, 1000);

setInterval(() => {
  pruneCompletedOrdersOlderThan12Hours();
}, 60000);

server.listen(DEFAULT_CONFIG.port, () => {
  console.log(`=======================================================`);
  console.log(`  Plataforma SaaS CompetiLivery Ativa em: http://localhost:${DEFAULT_CONFIG.port}`);
  console.log(`  👑 Super Admin: http://localhost:${DEFAULT_CONFIG.port}/superadmin`);
  console.log(`=======================================================`);
});
