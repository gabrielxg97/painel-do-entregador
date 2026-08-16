import { Router, Response } from 'express';
import { prisma } from '../db/prisma';
import { authenticate, authorize, AuthenticatedRequest } from '../middleware/auth';
import { UserRole } from '@prisma/client';

const router = Router();

// Listar logs de auditoria de ações
router.get('/', authenticate, authorize([UserRole.ADMIN, UserRole.OPERATOR]), async (req: AuthenticatedRequest, res: Response) => {
  const auditLogs = await prisma.auditLog.findMany({
    include: {
      user: { select: { name: true, email: true, role: true } },
      order: { select: { display_id: true, deliveryvip_order_id: true } },
    },
    orderBy: { created_at: 'desc' },
    take: 50,
  });

  return res.json({ success: true, data: auditLogs });
});

// Listar logs de requisições API
router.get('/api-logs', authenticate, authorize([UserRole.ADMIN]), async (req: AuthenticatedRequest, res: Response) => {
  const apiLogs = await prisma.apiLog.findMany({
    orderBy: { created_at: 'desc' },
    take: 50,
  });

  return res.json({ success: true, data: apiLogs });
});

export default router;
