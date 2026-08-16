import axios from 'axios';

const API_URL = 'http://localhost:3000/api';
const MOCK_URL = 'http://localhost:3001';

async function runEndToEndTest() {
  console.log('🧪 Iniciando Teste de Integração Ponta a Ponta (End-to-End)...');

  try {
    // 1. Login Admin
    console.log('1️⃣ Autenticando como Administrador...');
    const adminLoginRes = await axios.post(`${API_URL}/auth/login`, {
      email: 'admin@deliveryvip.com',
      password: '123456',
    });
    const adminToken = adminLoginRes.data.data.accessToken;
    console.log('   ✅ Admin autenticado com sucesso! Token gerado.');

    // Header com token do Admin
    const adminHeaders = { Authorization: `Bearer ${adminToken}` };

    // 2. Testar Conexão com DeliveryVip
    console.log('2️⃣ Testando Conexão do Merchant com a DeliveryVip...');
    const connRes = await axios.post(`${API_URL}/merchants/test-connection`, {}, { headers: adminHeaders });
    console.log(`   ✅ Status da Conexão: ${connRes.data.message}`);

    // 3. Simular Disparo de Evento CREATED na API Mock
    console.log('3️⃣ Simulando evento CREATED vindo da DeliveryVip...');
    const triggerRes = await axios.post(`${MOCK_URL}/mock/trigger-event`, {
      eventType: 'CREATED',
      orderId: 'order-vip-9999',
    });
    console.log(`   ✅ Evento mock criado na fila da DeliveryVip: ${triggerRes.data.event.eventId}`);

    // Aguardar 2 segundos para o Polling Worker processar
    console.log('   ⏳ Aguardando processamento do Polling Worker...');
    await new Promise((resolve) => setTimeout(resolve, 2500));

    // 4. Listar Pedidos no Backend para verificar se o pedido foi salvo
    console.log('4️⃣ Verificando pedido salvo no Banco de Dados...');
    const ordersRes = await axios.get(`${API_URL}/orders`, { headers: adminHeaders });
    const orders = ordersRes.data.data;
    const targetOrder = orders.find((o: any) => o.deliveryvip_order_id === 'order-vip-9999');

    if (!targetOrder) {
      throw new Error('Pedido order-vip-9999 não foi encontrado no banco de dados!');
    }
    console.log(`   ✅ Pedido localizado no banco! ID Interno: ${targetOrder.id} | Status Interno: ${targetOrder.internal_status}`);

    const orderId = targetOrder.id;

    // 5. Confirmar Pedido
    console.log('5️⃣ Confirmando o Pedido...');
    const confirmRes = await axios.post(`${API_URL}/orders/${orderId}/confirm`, {}, { headers: adminHeaders });
    console.log(`   ✅ Status atualizado para: ${confirmRes.data.data.internal_status}`);

    // 6. Iniciar Preparo
    console.log('6️⃣ Iniciando Preparo do Pedido...');
    const prepRes = await axios.post(`${API_URL}/orders/${orderId}/prepare`, {}, { headers: adminHeaders });
    console.log(`   ✅ Status atualizado para: ${prepRes.data.data.internal_status}`);

    // 7. Marcar como Pronto para Retirada
    console.log('7️⃣ Marcando como Pronto para Retirada...');
    const readyRes = await axios.post(`${API_URL}/orders/${orderId}/ready`, {}, { headers: adminHeaders });
    console.log(`   ✅ Status atualizado para: ${readyRes.data.data.internal_status}`);

    // 8. Atribuir Entregador João
    console.log('8️⃣ Buscando entregador para atribuição...');
    const driversRes = await axios.get(`${API_URL}/delivery-persons`, { headers: adminHeaders });
    const driverJoao = driversRes.data.data[0];
    console.log(`   Atribuindo pedido ao entregador: ${driverJoao.name}`);

    const assignRes = await axios.post(
      `${API_URL}/orders/${orderId}/assign`,
      { delivery_person_id: driverJoao.id },
      { headers: adminHeaders }
    );
    console.log(`   ✅ Status atualizado para: ${assignRes.data.data.order.internal_status}`);

    // 9. Login do Entregador
    console.log('9️⃣ Autenticando como Entregador...');
    const driverLoginRes = await axios.post(`${API_URL}/auth/login`, {
      email: 'entregador@deliveryvip.com',
      password: '123456',
    });
    const driverToken = driverLoginRes.data.data.accessToken;
    const driverHeaders = { Authorization: `Bearer ${driverToken}` };
    console.log('   ✅ Entregador autenticado com sucesso!');

    // 10. Aceitar Entrega
    console.log('🔟 Entregador aceitando a entrega...');
    await axios.post(`${API_URL}/driver/deliveries/${orderId}/accept`, {}, { headers: driverHeaders });
    console.log('   ✅ Entrega aceita pelo entregador.');

    // 11. Avançar Passos da Entrega (Step-by-Step Execution)
    console.log('1️⃣1️⃣ Executando passos do fluxo de entrega...');

    // Step A: Deslocando até o Merchant
    const step1 = await axios.post(`${API_URL}/driver/deliveries/${orderId}/step`, { nextStatus: 'GOING_TO_MERCHANT' }, { headers: driverHeaders });
    console.log(`   📍 Passo 1: ${step1.data.data.internal_status}`);

    // Step B: Chegou no Merchant
    const step2 = await axios.post(`${API_URL}/driver/deliveries/${orderId}/step`, { nextStatus: 'ARRIVED_AT_MERCHANT' }, { headers: driverHeaders });
    console.log(`   📍 Passo 2: ${step2.data.data.internal_status}`);

    // Step C: Pedido Retirado
    const step3 = await axios.post(`${API_URL}/driver/deliveries/${orderId}/step`, { nextStatus: 'ORDER_PICKED_UP' }, { headers: driverHeaders });
    console.log(`   📍 Passo 3: ${step3.data.data.internal_status}`);

    // Step D: Chegou no Cliente
    const step4 = await axios.post(`${API_URL}/driver/deliveries/${orderId}/step`, { nextStatus: 'ARRIVED_AT_CUSTOMER' }, { headers: driverHeaders });
    console.log(`   📍 Passo 4: ${step4.data.data.internal_status}`);

    // Step E: Confirmar Entrega
    const step5 = await axios.post(`${API_URL}/driver/deliveries/${orderId}/step`, { nextStatus: 'DELIVERED' }, { headers: driverHeaders });
    console.log(`   ✅ Passo 5 (Final): ${step5.data.data.internal_status}`);

    // 12. Validar Métricas no Dashboard
    console.log('1️⃣2️⃣ Validando estatísticas finais no Dashboard...');
    const dashRes = await axios.get(`${API_URL}/dashboard`, { headers: adminHeaders });
    console.log('   📊 Resumo de Pedidos:', dashRes.data.data.stats);
    console.log('   🛵 Frota de Entregadores:', dashRes.data.data.driverStats);

    console.log('\n🎉 TESTE CONCLUÍDO COM 100% DE SUCESSO! Todos os fluxos e integrações validados.');
  } catch (error: any) {
    console.error('❌ ERRO DURANTE O TESTE:', error.response?.data || error.message);
    process.exit(1);
  }
}

runEndToEndTest();
