import { Router, Response } from 'express';
import { prisma } from '../db/prisma';
import { authenticate, authorize, AuthenticatedRequest } from '../middleware/auth';
import { UserRole, InternalOrderStatus } from '@prisma/client';
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

// 1. Listar Pedidos com Filtros
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const { status, search, type, sales_channel, date, delivery_person_id } = req.query;
  const merchantId = req.user?.merchantId;

  const whereClause: any = {
    merchant_id: merchantId,
  };

  if (status) {
    whereClause.internal_status = status as InternalOrderStatus;
  }

  if (type) {
    whereClause.type = type as any;
  }

  if (sales_channel) {
    whereClause.sales_channel = sales_channel as any;
  }

  if (search) {
    whereClause.OR = [
      { display_id: { contains: String(search), mode: 'insensitive' } },
      { deliveryvip_order_id: { contains: String(search), mode: 'insensitive' } },
      { customer: { name: { contains: String(search), mode: 'insensitive' } } },
    ];
  }

  if (delivery_person_id) {
    whereClause.assignments = {
      some: {
        delivery_person_id: String(delivery_person_id),
      },
    };
  }

  const orders = await prisma.order.findMany({
    where: whereClause,
    include: {
      customer: true,
      address: true,
      items: { include: { options: true } },
      assignments: {
        where: { status: { notIn: ['REJECTED', 'CANCELLED'] } },
        include: { delivery_person: true },
        orderBy: { created_at: 'desc' },
        take: 1,
      },
      payments: true,
    },
    orderBy: { created_at: 'desc' },
  });

  return res.json({ success: true, data: orders });
});

// 2. Detalhes de um Pedido
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: true,
      address: true,
      items: { include: { options: true } },
      fees: true,
      discounts: true,
      payments: true,
      assignments: {
        include: { delivery_person: true },
        orderBy: { created_at: 'desc' },
      },
      audit_logs: {
        include: { user: true },
        orderBy: { created_at: 'desc' },
      },
    },
  });

  if (!order) {
    return res.status(404).json({ success: false, error: { code: 'ORDER_NOT_FOUND', message: 'Pedido não encontrado' } });
  }

  return res.json({ success: true, data: order });
});

// 3. Confirmar Pedido (NEW -> CONFIRMED)
router.post('/:id/confirm', authenticate, authorize([UserRole.ADMIN, UserRole.OPERATOR]), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const order = await prisma.order.findUnique({ where: { id } });

  if (!order) return res.status(404).json({ success: false, error: { message: 'Pedido não encontrado' } });

  OrderStateMachine.validateTransition(order.internal_status, InternalOrderStatus.CONFIRMED);

  try {
    const client = await getDeliveryVipClientForMerchant(order.merchant_id);
    // IMPORTANTE: requisição de confirmação para a DeliveryVip
    await client.confirmOrder(order.deliveryvip_order_id);

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: {
        internal_status: InternalOrderStatus.CONFIRMED,
        deliveryvip_status: 'CONFIRMED',
      },
    });

    // Registrar Audit Log
    await prisma.auditLog.create({
      data: {
        user_id: req.user?.userId,
        action: 'CONFIRM_ORDER',
        order_id: id,
        previous_status: order.internal_status,
        new_status: InternalOrderStatus.CONFIRMED,
      },
    });

    return res.json({ success: true, data: updatedOrder });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: { message: `Erro ao confirmar pedido na DeliveryVip: ${error.message}` } });
  }
});

// 4. Iniciar Preparo (CONFIRMED -> PREPARING)
router.post('/:id/prepare', authenticate, authorize([UserRole.ADMIN, UserRole.OPERATOR]), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const order = await prisma.order.findUnique({ where: { id } });

  if (!order) return res.status(404).json({ success: false, error: { message: 'Pedido não encontrado' } });

  OrderStateMachine.validateTransition(order.internal_status, InternalOrderStatus.PREPARING);

  try {
    const client = await getDeliveryVipClientForMerchant(order.merchant_id);
    await client.startPreparing(order.deliveryvip_order_id);

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: {
        internal_status: InternalOrderStatus.PREPARING,
        deliveryvip_status: 'PREPARING',
        preparation_start_at: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        user_id: req.user?.userId,
        action: 'PREPARE_ORDER',
        order_id: id,
        previous_status: order.internal_status,
        new_status: InternalOrderStatus.PREPARING,
      },
    });

    return res.json({ success: true, data: updatedOrder });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: { message: error.message } });
  }
});

// 5. Marcar Pronto para Retirada (PREPARING -> READY_FOR_PICKUP)
router.post('/:id/ready', authenticate, authorize([UserRole.ADMIN, UserRole.OPERATOR]), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const order = await prisma.order.findUnique({ where: { id } });

  if (!order) return res.status(404).json({ success: false, error: { message: 'Pedido não encontrado' } });

  OrderStateMachine.validateTransition(order.internal_status, InternalOrderStatus.READY_FOR_PICKUP);

  try {
    const client = await getDeliveryVipClientForMerchant(order.merchant_id);
    await client.readyForPickup(order.deliveryvip_order_id);

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: {
        internal_status: InternalOrderStatus.READY_FOR_PICKUP,
        deliveryvip_status: 'READY_FOR_PICKUP',
      },
    });

    await prisma.auditLog.create({
      data: {
        user_id: req.user?.userId,
        action: 'READY_FOR_PICKUP_ORDER',
        order_id: id,
        previous_status: order.internal_status,
        new_status: InternalOrderStatus.READY_FOR_PICKUP,
      },
    });

    return res.json({ success: true, data: updatedOrder });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: { message: error.message } });
  }
});

// 6. Atribuir Entregador ao Pedido
router.post('/:id/assign', authenticate, authorize([UserRole.ADMIN, UserRole.OPERATOR]), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { delivery_person_id } = req.body;

  if (!delivery_person_id) {
    return res.status(400).json({ success: false, error: { message: 'ID do entregador é obrigatório' } });
  }

  const order = await prisma.order.findUnique({ where: { id } });
  const deliveryPerson = await prisma.deliveryPerson.findUnique({ where: { id: delivery_person_id } });

  if (!order || !deliveryPerson) {
    return res.status(404).json({ success: false, error: { message: 'Pedido ou entregador não encontrado' } });
  }

  OrderStateMachine.validateTransition(order.internal_status, InternalOrderStatus.DELIVERY_PERSON_ASSIGNED);

  // Criar atribuição mantendo o histórico (Regra 25)
  const assignment = await prisma.deliveryAssignment.create({
    data: {
      order_id: id,
      delivery_person_id,
      status: 'ASSIGNED',
      assigned_at: new Date(),
    },
  });

  // Atualizar pedido e entregador
  const updatedOrder = await prisma.order.update({
    where: { id },
    data: {
      internal_status: InternalOrderStatus.DELIVERY_PERSON_ASSIGNED,
    },
  });

  await prisma.deliveryPerson.update({
    where: { id: delivery_person_id },
    data: { status: 'BUSY' },
  });

  // Atualizar tracking na DeliveryVip informando o entregador
  try {
    const client = await getDeliveryVipClientForMerchant(order.merchant_id);
    await client.sendTracking(order.deliveryvip_order_id, {
      deliveryPerson: {
        id: deliveryPerson.id,
        name: deliveryPerson.name,
        pictureURL: deliveryPerson.picture_url || undefined,
      },
      vehicle: {
        type: deliveryPerson.vehicle_type,
        licencePlate: deliveryPerson.vehicle_plate || undefined,
      },
    });
  } catch (err) {
    // Ignorar falha de tracking não impeditiva
  }

  await prisma.auditLog.create({
    data: {
      user_id: req.user?.userId,
      action: 'ASSIGN_DELIVERY_PERSON',
      order_id: id,
      previous_status: order.internal_status,
      new_status: InternalOrderStatus.DELIVERY_PERSON_ASSIGNED,
      details: { delivery_person_id, delivery_person_name: deliveryPerson.name },
    },
  });

  return res.json({ success: true, data: { order: updatedOrder, assignment } });
});

// 7. Solagitar / Confirmar Cancelamento
router.post('/:id/cancel', authenticate, authorize([UserRole.ADMIN, UserRole.OPERATOR]), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { reason, code } = req.body;

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) return res.status(404).json({ success: false, error: { message: 'Pedido não encontrado' } });

  OrderStateMachine.validateTransition(order.internal_status, InternalOrderStatus.CANCELLED);

  try {
    const client = await getDeliveryVipClientForMerchant(order.merchant_id);
    await client.requestCancellation(order.deliveryvip_order_id, {
      reason: reason || 'Cancelamento solicitado pelo operador',
      code: code || 'INTERNAL_DIFFICULTIES_OF_THE_RESTAURANT',
    });

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: {
        internal_status: InternalOrderStatus.CANCELLED,
        deliveryvip_status: 'CANCELLED',
        cancellation_reason: reason,
        cancellation_code: code,
      },
    });

    await prisma.auditLog.create({
      data: {
        user_id: req.user?.userId,
        action: 'CANCEL_ORDER',
        order_id: id,
        previous_status: order.internal_status,
        new_status: InternalOrderStatus.CANCELLED,
      },
    });

    return res.json({ success: true, data: updatedOrder });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: { message: error.message } });
  }
});

export default router;
