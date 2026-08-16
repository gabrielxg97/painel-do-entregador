import { Router, Response } from 'express';
import { prisma } from '../db/prisma';
import { encryptSecret, decryptSecret } from '../common/crypto';
import { authenticate, authorize, AuthenticatedRequest } from '../middleware/auth';
import { UserRole } from '@prisma/client';
import { DeliveryVipClient } from '../deliveryvip/deliveryVipClient';
import { config } from '../config/env';

const router = Router();

// 1. Listar Merchants (ADMIN)
router.get('/', authenticate, authorize([UserRole.ADMIN]), async (req: AuthenticatedRequest, res: Response) => {
  const merchants = await prisma.merchant.findMany({
    select: {
      id: true,
      name: true,
      deliveryvip_merchant_id: true,
      deliveryvip_client_id: true,
      active: true,
      created_at: true,
      updated_at: true,
    },
  });

  return res.json({ success: true, data: merchants });
});

// 2. Obter Merchant do Usuário Logado
router.get('/my-merchant', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false });

  const merchant = await prisma.merchant.findUnique({
    where: { id: req.user.merchantId },
    select: {
      id: true,
      name: true,
      deliveryvip_merchant_id: true,
      deliveryvip_client_id: true,
      active: true,
      created_at: true,
      updated_at: true,
    },
  });

  if (!merchant) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Merchant não encontrado' } });

  // Buscar status de última sincronização e contadores
  const lastEvent = await prisma.deliveryEvent.findFirst({
    where: { merchant_id: merchant.deliveryvip_merchant_id },
    orderBy: { created_at: 'desc' },
  });

  return res.json({
    success: true,
    data: {
      ...merchant,
      lastEventAt: lastEvent?.created_at || null,
      lastEventType: lastEvent?.event_type || null,
    },
  });
});

// 3. Cadastrar ou Atualizar Merchant (ADMIN ou OPERATOR)
router.post('/save', authenticate, authorize([UserRole.ADMIN, UserRole.OPERATOR]), async (req: AuthenticatedRequest, res: Response) => {
  const { name, deliveryvip_merchant_id, deliveryvip_client_id, deliveryvip_client_secret } = req.body;

  if (!name || !deliveryvip_merchant_id || !deliveryvip_client_id) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'Preencha todos os campos obrigatórios' } });
  }

  // Criptografar client_secret se fornecido
  const encryptedSecret = deliveryvip_client_secret ? encryptSecret(deliveryvip_client_secret) : undefined;

  const merchant = await prisma.merchant.upsert({
    where: { deliveryvip_merchant_id },
    create: {
      name,
      deliveryvip_merchant_id,
      deliveryvip_client_id,
      deliveryvip_client_secret: encryptedSecret || '',
      active: true,
    },
    update: {
      name,
      deliveryvip_client_id,
      ...(encryptedSecret ? { deliveryvip_client_secret: encryptedSecret } : {}),
      active: true,
    },
    select: {
      id: true,
      name: true,
      deliveryvip_merchant_id: true,
      deliveryvip_client_id: true,
      active: true,
      created_at: true,
      updated_at: true,
    },
  });

  return res.json({ success: true, data: merchant });
});

// 4. Testar Conexão com DeliveryVip
router.post('/test-connection', authenticate, authorize([UserRole.ADMIN, UserRole.OPERATOR]), async (req: AuthenticatedRequest, res: Response) => {
  const merchantId = req.user?.merchantId;
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });

  const creds = merchant
    ? {
        apiUrl: config.deliveryvip.apiUrl,
        clientId: merchant.deliveryvip_client_id,
        clientSecret: decryptSecret(merchant.deliveryvip_client_secret),
        merchantId: merchant.deliveryvip_merchant_id,
      }
    : {
        apiUrl: config.deliveryvip.apiUrl,
        clientId: config.deliveryvip.clientId,
        clientSecret: config.deliveryvip.clientSecret,
        merchantId: config.deliveryvip.merchantId,
      };

  try {
    const client = new DeliveryVipClient(creds);
    // Tentar listar pedidos para testar autenticação e conectividade
    await client.listOrders({ per_page: 1 });
    return res.json({ success: true, message: 'Conexão com a DeliveryVip estabelecida com sucesso!' });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: { code: 'CONNECTION_FAILED', message: `Falha na conexão: ${error.message}` } });
  }
});

export default router;
