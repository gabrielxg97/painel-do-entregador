import { Router, Response } from 'express';
import { prisma } from '../db/prisma';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const merchantId = req.user?.merchantId;

  // 1. Agrupamento de pedidos por status
  const orders = await prisma.order.findMany({
    where: { merchant_id: merchantId },
    select: { internal_status: true, order_amount: true, created_at: true },
  });

  const stats = {
    new: 0,
    preparing: 0,
    ready: 0,
    waitingDriver: 0,
    onDelivery: 0,
    delivered: 0,
    cancelled: 0,
    totalAmountToday: 0,
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  orders.forEach((ord) => {
    const isToday = new Date(ord.created_at) >= today;
    if (isToday && ord.internal_status !== 'CANCELLED') {
      stats.totalAmountToday += ord.order_amount;
    }

    switch (ord.internal_status) {
      case 'NEW':
        stats.new++;
        break;
      case 'CONFIRMED':
      case 'PREPARING':
        stats.preparing++;
        break;
      case 'READY_FOR_PICKUP':
        stats.ready++;
        break;
      case 'WAITING_DELIVERY_PERSON':
        stats.waitingDriver++;
        break;
      case 'DELIVERY_PERSON_ASSIGNED':
      case 'GOING_TO_MERCHANT':
      case 'ARRIVED_AT_MERCHANT':
      case 'ORDER_PICKED_UP':
      case 'GOING_TO_CUSTOMER':
      case 'ARRIVED_AT_CUSTOMER':
        stats.onDelivery++;
        break;
      case 'DELIVERED':
      case 'CONCLUDED':
        stats.delivered++;
        break;
      case 'CANCELLATION_REQUESTED':
      case 'CANCELLED':
        stats.cancelled++;
        break;
    }
  });

  // 2. Status dos entregadores
  const drivers = await prisma.deliveryPerson.findMany({
    where: { merchant_id: merchantId },
    select: { status: true },
  });

  const driverStats = {
    available: drivers.filter((d) => d.status === 'AVAILABLE').length,
    busy: drivers.filter((d) => d.status === 'BUSY').length,
    offline: drivers.filter((d) => d.status === 'OFFLINE').length,
    total: drivers.length,
  };

  // 3. Pedidos recentes
  const recentOrders = await prisma.order.findMany({
    where: { merchant_id: merchantId },
    include: {
      customer: true,
      address: true,
      assignments: {
        include: { delivery_person: true },
        take: 1,
        orderBy: { created_at: 'desc' },
      },
    },
    orderBy: { created_at: 'desc' },
    take: 10,
  });

  return res.json({
    success: true,
    data: {
      stats,
      driverStats,
      recentOrders,
    },
  });
});

export default router;
