const https = require('https');

const CONFIG = {
  clientId: '37VRXfJKDRLWo9NYpOO3mqYQVx1FJxjWiHxuA-fkwaM',
  clientSecret: '7c6r0i47NdGFJW8t8sA48E84C73Cj2kjDaRwvvl4iZs',
  merchantId: '11c151b6-01b8-4d9a-8cb4-d8cedbe3412d'
};

function getIsoDateWithTz() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}-03:00`;
}

function httpsReq(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function testFullSequence() {
  const tokenData = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CONFIG.clientId,
    client_secret: CONFIG.clientSecret,
    scope: 'od.all dv.partner'
  }).toString();

  const tokenRes = await httpsReq({
    hostname: 'api.deliveryvip.com.br',
    path: '/authentication/v1/oauth/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(tokenData)
    }
  }, tokenData);

  const tokenObj = JSON.parse(tokenRes.body);
  const token = tokenObj.access_token;

  const listRes = await httpsReq({
    hostname: 'api.deliveryvip.com.br',
    path: `/merchant/v3/${CONFIG.merchantId}/orders`,
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const orders = JSON.parse(listRes.body);
  const ew4l3j = orders.find(o => o.displayId === 'EW4L3J');
  if (ew4l3j) {
    console.log('Testando sequencia no pedido:', ew4l3j.displayId, ew4l3j.id);

    // Step 1: Dispatch
    const dispatchRes = await httpsReq({
      hostname: 'api.deliveryvip.com.br',
      path: `/merchant/v3/orders/${ew4l3j.id}/dispatch`,
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log('1. Dispatch status:', dispatchRes.status, dispatchRes.body);

    // Step 2: Tracking (DELIVERY_ONGOING)
    const trackBody = JSON.stringify({
      event: {
        type: 'DELIVERY_ONGOING',
        datetime: getIsoDateWithTz()
      }
    });

    const trackRes = await httpsReq({
      hostname: 'api.deliveryvip.com.br',
      path: `/merchant/v3/orders/${ew4l3j.id}/tracking`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(trackBody)
      }
    }, trackBody);
    console.log('2. Tracking status:', trackRes.status, trackRes.body);
  }
}

testFullSequence().catch(console.error);
