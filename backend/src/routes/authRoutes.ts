import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db/prisma';
import { generateToken, generateRefreshToken } from '../common/jwt';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

router.post('/login', async (req: AuthenticatedRequest, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'E-mail e senha são obrigatórios' } });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { merchant: true, delivery_person: true },
  });

  if (!user) {
    return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Credenciais inválidas' } });
  }

  const isValidPassword = await bcrypt.compare(password, user.password_hash);
  if (!isValidPassword) {
    return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Credenciais inválidas' } });
  }

  const tokenPayload = {
    userId: user.id,
    merchantId: user.merchant_id,
    role: user.role,
    deliveryPersonId: user.delivery_person_id,
  };

  const accessToken = generateToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  return res.json({
    success: true,
    data: {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        merchantId: user.merchant_id,
        merchantName: user.merchant.name,
        deliveryPersonId: user.delivery_person_id,
      },
    },
  });
});

router.get('/me', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Não autenticado' } });

  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    include: { merchant: true, delivery_person: true },
  });

  if (!user) {
    return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'Usuário não encontrado' } });
  }

  return res.json({
    success: true,
    data: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      merchantId: user.merchant_id,
      merchantName: user.merchant.name,
      deliveryPersonId: user.delivery_person_id,
    },
  });
});

export default router;
