import { Router, Response } from 'express';
import { prisma } from '../db/prisma';
import { authenticate, authorize, AuthenticatedRequest } from '../middleware/auth';
import { UserRole, InternalOrderStatus, AssignmentStatus, DeliveryPersonStatus } from '@prisma/client';
import { OrderStateMachine } from '../orders/orderStateMachine';
import { DeliveryVipClient } from '../deliveryvip/deliveryVipClient';
import { decryptSecret } from '../common/crypto';
import { config } from '../config/env';

const router = Router();

async function getDeliveryVipClientForMerchant(merchantId: string): Promise<DeliveryVipClient> {
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
  if (merchant && merchant.deliveryvip_client_secret) {
    return new DeliveryVipClient({
      apiUrl: config.deliveryvip.apiUrl,
      clientId: merchant.deliveryvip_client_id,
      clientSecret: decryptSecret(merchant.deliveryvip_client_secret),
      merchantId: merchant.deliveryvip_merchant_id,
    });
  }
  return new DeliveryVipClient({
    apiUrl: config.deliveryvip.apiUrl,
    clientId: config.deliveryvip.clientId,
    clientSecret: config.deliveryvip.clientSecret,
    merchantId: config.deliveryvip.merchantId,
  });
}

// 0. A. Marcar Pedido como "SAIU PARA ENTREGA" ("ENTREGANDO") na DeliveryVip
router.post('/dispatch-by-code', async (req: Request, res: Response) => {
  const { orderCode } = req.body;

  if (!orderCode) {
    return res.status(400).json({ success: false, error: { message: 'Por favor, informe o código do pedido.' } });
  }

  const cleanCode = String(orderCode).trim();

  let order = await prisma.order.findFirst({
    where: {
      OR: [
        { display_id: cleanCode },
        { deliveryvip_order_id: cleanCode },
        { id: cleanCode },
      ],
    },
  });

  const deliveryvipOrderId = order ? order.deliveryvip_order_id : cleanCode;
  const merchantId = order ? order.merchant_id : undefined;

  try {
    const client = await getDeliveryVipClientForMerchant(merchantId || 'default');

    // 1. Marcar como pronto para retirada se necessário
    try {
      await client.readyForPickup(deliveryvipOrderId);
    } catch (e) {}

    // 2. Disparar endpoint oficial /dispatch para mudar status na DeliveryVip para "ENTREGANDO"
    await client.dispatchOrder(deliveryvipOrderId);

    // 3. Enviar evento de Tracking DELIVERY_ONGOING
    await client.sendTracking(deliveryvipOrderId, {
      event: {
        type: 'DELIVERY_ONGOING',
        message: 'Pedido saiu para entrega com o entregador',
        datetime: new Date().toISOString(),
      },
    });

    if (order) {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          internal_status: InternalOrderStatus.GOING_TO_CUSTOMER,
          deliveryvip_status: 'DISPATCHED',
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        action: 'DRIVER_DISPATCH_BY_CODE',
        order_id: order?.id || null,
        previous_status: order?.internal_status || 'PREPARING',
        new_status: InternalOrderStatus.GOING_TO_CUSTOMER,
        details: { orderCode: cleanCode, deliveryvipOrderId },
      },
    });

    return res.json({
      success: true,
      message: `Sucesso! O pedido #${order?.display_id || cleanCode} foi alterado para ENTREGANDO na DeliveryVip.`,
      data: { orderId: deliveryvipOrderId, status: 'DISPATCHED' },
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      error: { message: `Falha ao notificar a DeliveryVip: ${error.message}` },
    });
  }
});

// 0. B. Marcar Pedido como "ENTREGUE" na DeliveryVip
router.post('/confirm-by-code', async (req: Request, res: Response) => {
  const { orderCode, clientId, clientSecret, merchantId, apiUrl } = req.body;

  if (!orderCode) {
    return res.status(400).json({ success: false, error: { message: 'Por favor, informe o código do pedido.' } });
  }

  // Remover hashtag # se fornecida pelo entregador
  const cleanCode = String(orderCode).replace(/^#+/, '').trim().toUpperCase();

  // Credenciais ativas da loja COMPETILIVERY (ou informadas)
  const activeClientId = clientId || process.env.DELIVERYVIP_CLIENT_ID || '37VRXfJKDRLWo9NYpOO3mqYQVx1FJxjWiHxuA-fkwaM';
  const activeClientSecret = clientSecret || process.env.DELIVERYVIP_CLIENT_SECRET || '7c6r0i47NdGFJW8t8sA48E84C73Cj2kjDaRwvvl4iZs';
  const activeMerchantId = merchantId || process.env.DELIVERYVIP_MERCHANT_ID || '11c151b6-01b8-4d9a-8cb4-d8cedbe3412d';
  const activeApiUrl = apiUrl || process.env.DELIVERYVIP_API_URL || 'https://api.deliveryvip.com.br';

  try {
    const client = new DeliveryVipClient({
      apiUrl: activeApiUrl,
      clientId: activeClientId,
      clientSecret: activeClientSecret,
      merchantId: activeMerchantId,
    });

    // Obter lista de pedidos do merchant na DeliveryVip para mapear o displayId (ex: LMDMKN -> UUID)
    let targetOrderUuid = cleanCode;
    try {
      const merchantOrders = await client.getMerchantOrders(activeMerchantId);
      const found = merchantOrders.find((o: any) => o.displayId === cleanCode || o.id === cleanCode);
      if (found) {
        targetOrderUuid = found.id;
      }
    } catch (err) {
      console.warn('Não foi possível listar os pedidos para buscar displayId:', err);
    }

    // 1. Enviar /dispatch (para transição segura caso esteja em PREPARING / READY_FOR_PICKUP)
    try {
      await client.readyForPickup(targetOrderUuid);
      await client.dispatchOrder(targetOrderUuid);
    } catch (e) {}

    // 2. Enviar /delivered para alterar status para ENTREGUE / CONCLUDED
    await client.orderDelivered(targetOrderUuid);

    // 3. Enviar evento de tracking ORDER_DELIVERED
    try {
      await client.sendTracking(targetOrderUuid, {
        event: {
          type: 'ORDER_DELIVERED',
          message: 'Pedido entregue pelo entregador com sucesso',
          datetime: new Date().toISOString(),
        },
      });
    } catch (e) {}

    // Atualizar banco local se existir
    const order = await prisma.order.findFirst({
      where: {
        OR: [
          { display_id: cleanCode },
          { deliveryvip_order_id: cleanCode },
          { deliveryvip_order_id: targetOrderUuid },
        ],
      },
    });

    if (order) {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          internal_status: InternalOrderStatus.DELIVERED,
          deliveryvip_status: 'DELIVERED',
          delivery_at: new Date(),
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        action: 'DRIVER_CONFIRM_DELIVERY_BY_CODE',
        order_id: order?.id || null,
        previous_status: order?.internal_status || 'UNKNOWN',
        new_status: InternalOrderStatus.DELIVERED,
        details: { orderCode: cleanCode, targetOrderUuid },
      },
    });

    return res.json({
      success: true,
      message: `Sucesso! O pedido #${cleanCode} da loja COMPETILIVERY foi marcado como ENTREGUE (CONCLUDED) na DeliveryVip!`,
      data: { orderCode: cleanCode, orderUuid: targetOrderUuid, status: 'CONCLUDED' },
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      error: { message: `Falha ao notificar a DeliveryVip: ${error.message}` },
    });
  }
});

// 1. Obter entregas ativas e histórico do entregador logado
router.get('/deliveries', authenticate, authorize([UserRole.DELIVERY_PERSON, UserRole.ADMIN]), async (req: AuthenticatedRequest, res: Response) => {
  const deliveryPersonId = req.user?.deliveryPersonId;

  if (!deliveryPersonId) {
    return res.status(400).json({ success: false, error: { message: 'Usuário não está vinculado a uma conta de entregador' } });
  }

  // Buscar atribuição ativa
  const activeAssignment = await prisma.deliveryAssignment.findFirst({
    where: {
      delivery_person_id: deliveryPersonId,
      status: { in: ['ASSIGNED', 'ACCEPTED', 'ARRIVED_MERCHANT', 'PICKED_UP', 'ARRIVED_CUSTOMER'] },
    },
    include: {
      order: {
        include: {
          customer: true,
          address: true,
          items: { include: { options: true } },
          payments: true,
          merchant: { select: { name: true } },
        },
      },
    },
    orderBy: { created_at: 'desc' },
  });

  // Histórico recente
  const historyAssignments = await prisma.deliveryAssignment.findMany({
    where: {
      delivery_person_id: deliveryPersonId,
      status: { in: ['DELIVERED', 'REJECTED', 'CANCELLED'] },
    },
    include: {
      order: {
        include: { customer: true, address: true },
      },
    },
    orderBy: { created_at: 'desc' },
    take: 20,
  });

  return res.json({
    success: true,
    data: {
      activeDelivery: activeAssignment || null,
      history: historyAssignments,
    },
  });
});

// 2. Aceitar entrega atribuída
router.post('/deliveries/:id/accept', authenticate, authorize([UserRole.DELIVERY_PERSON, UserRole.ADMIN]), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params; // ID da order
  const deliveryPersonId = req.user?.deliveryPersonId;

  const assignment = await prisma.deliveryAssignment.findFirst({
    where: { order_id: id, delivery_person_id: deliveryPersonId, status: 'ASSIGNED' },
  });

  if (!assignment) {
    return res.status(404).json({ success: false, error: { message: 'Atribuição de entrega não encontrada para este pedido' } });
  }

  await prisma.deliveryAssignment.update({
    where: { id: assignment.id },
    data: {
      status: AssignmentStatus.ACCEPTED,
      accepted_at: new Date(),
    },
  });

  return res.json({ success: true, message: 'Entrega aceita com sucesso!' });
});

// 3. Avançar Passo do Fluxo de Entrega (Step-by-Step Execution)
router.post('/deliveries/:id/step', authenticate, authorize([UserRole.DELIVERY_PERSON, UserRole.ADMIN]), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params; // Order ID
  const { nextStatus, latitude, longitude, confirmationCode } = req.body;
  const deliveryPersonId = req.user?.deliveryPersonId;

  const order = await prisma.order.findUnique({
    where: { id },
    include: { address: true, customer: true },
  });

  if (!order) return res.status(404).json({ success: false, error: { message: 'Pedido não encontrado' } });

  const assignment = await prisma.deliveryAssignment.findFirst({
    where: { order_id: id, delivery_person_id: deliveryPersonId },
    orderBy: { created_at: 'desc' },
  });

  if (!assignment) return res.status(404).json({ success: false, error: { message: 'Atribuição não encontrada' } });

  const targetStatus = nextStatus as InternalOrderStatus;
  OrderStateMachine.validateTransition(order.internal_status, targetStatus);

  const client = await getDeliveryVipClientForMerchant(order.merchant_id);
  const deliveryPerson = await prisma.deliveryPerson.findUnique({ where: { id: deliveryPersonId! } });

  let assignmentStatusUpdate: AssignmentStatus = assignment.status;
  let trackingEvent: string | undefined;
  let trackingMessage: string | undefined;

  // Atualizações conforme o status do passo
  switch (targetStatus) {
    case InternalOrderStatus.GOING_TO_MERCHANT:
      trackingEvent = 'PICKUP_ONGOING';
      trackingMessage = 'Entregador em deslocamento para o estabelecimento';
      break;

    case InternalOrderStatus.ARRIVED_AT_MERCHANT:
      assignmentStatusUpdate = AssignmentStatus.ARRIVED_MERCHANT;
      trackingEvent = 'ARRIVED_AT_MERCHANT';
      trackingMessage = 'Entregador chegou ao estabelecimento';
      await prisma.deliveryAssignment.update({
        where: { id: assignment.id },
        data: { arrived_merchant_at: new Date() },
      });
      break;

    case InternalOrderStatus.ORDER_PICKED_UP:
    case InternalOrderStatus.GOING_TO_CUSTOMER:
      assignmentStatusUpdate = AssignmentStatus.PICKED_UP;
      trackingEvent = 'DELIVERY_ONGOING';
      trackingMessage = 'Pedido retirado pelo entregador. Em rota para o cliente';
      await prisma.deliveryAssignment.update({
        where: { id: assignment.id },
        data: { picked_up_at: new Date() },
      });
      break;

    case InternalOrderStatus.ARRIVED_AT_CUSTOMER:
      assignmentStatusUpdate = AssignmentStatus.ARRIVED_CUSTOMER;
      trackingEvent = 'ARRIVED_AT_CUSTOMER';
      trackingMessage = 'Entregador chegou ao endereço do cliente';
      await prisma.deliveryAssignment.update({
        where: { id: assignment.id },
        data: { arrived_customer_at: new Date() },
      });
      break;

    case InternalOrderStatus.DELIVERED:
      assignmentStatusUpdate = AssignmentStatus.DELIVERED;
      trackingEvent = 'ORDER_DELIVERED';
      trackingMessage = 'Entrega concluída com sucesso';
      await prisma.deliveryAssignment.update({
        where: { id: assignment.id },
        data: { delivered_at: new Date() },
      });

      // Liberar entregador
      await prisma.deliveryPerson.update({
        where: { id: deliveryPersonId! },
        data: { status: DeliveryPersonStatus.AVAILABLE },
      });

      // Notificar DeliveryVip através do endpoint /delivered oficial
      try {
        await client.orderDelivered(order.deliveryvip_order_id);
      } catch (err) {
        // Log error
      }
      break;

    default:
      break;
  }

  // Atualizar Pedido
  const updatedOrder = await prisma.order.update({
    where: { id },
    data: {
      internal_status: targetStatus,
      deliveryvip_status: targetStatus === InternalOrderStatus.DELIVERED ? 'DELIVERED' : order.deliveryvip_status,
      ...(targetStatus === InternalOrderStatus.DELIVERED ? { delivery_at: new Date() } : {}),
    },
  });

  // Atualizar atribuição
  await prisma.deliveryAssignment.update({
    where: { id: assignment.id },
    data: { status: assignmentStatusUpdate },
  });

  // Enviar evento de Tracking para a DeliveryVip
  if (trackingEvent && deliveryPerson) {
    try {
      await client.sendTracking(order.deliveryvip_order_id, {
        event: {
          type: trackingEvent,
          message: trackingMessage,
          datetime: new Date().toISOString(),
        },
        deliveryPerson: {
          id: deliveryPerson.id,
          name: deliveryPerson.name,
          pictureURL: deliveryPerson.picture_url || undefined,
        },
        vehicle: {
          type: deliveryPerson.vehicle_type,
          licencePlate: deliveryPerson.vehicle_plate || undefined,
        },
        ...(latitude && longitude ? { geoLocalization: { latitude: parseFloat(latitude), longitude: parseFloat(longitude), timestamp: new Date().toISOString() } } : {}),
      });
    } catch (err) {
      // Ignorar falha secundária de tracking
    }
  }

  // Audit Log
  await prisma.auditLog.create({
    data: {
      user_id: req.user?.userId,
      action: 'DRIVER_ADVANCE_STEP',
      order_id: id,
      previous_status: order.internal_status,
      new_status: targetStatus,
      details: { step: targetStatus, confirmationCode },
    },
  });

  return res.json({ success: true, data: updatedOrder });
});

// 4. Reportar Ocorrência / Problema na Entrega
router.post('/deliveries/:id/issue', authenticate, authorize([UserRole.DELIVERY_PERSON, UserRole.ADMIN]), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { problemCode, observation } = req.body;
  const deliveryPersonId = req.user?.deliveryPersonId;

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) return res.status(404).json({ success: false, error: { message: 'Pedido não encontrado' } });

  const client = await getDeliveryVipClientForMerchant(order.merchant_id);

  // Enviar problema no tracking
  try {
    await client.sendTracking(order.deliveryvip_order_id, {
      problem: problemCode || 'DELIVERYPERSON_OCCURRENCE',
    });
  } catch (err) {}

  await prisma.auditLog.create({
    data: {
      user_id: req.user?.userId,
      action: 'REPORT_DELIVERY_ISSUE',
      order_id: id,
      details: { problemCode, observation },
    },
  });

  return res.json({ success: true, message: 'Ocorrência registrada e notificada à DeliveryVip com sucesso!' });
});

export default router;
