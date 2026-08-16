import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db/prisma';
import { authenticate, authorize, AuthenticatedRequest } from '../middleware/auth';
import { UserRole, DeliveryPersonStatus, VehicleType } from '@prisma/client';

const router = Router();

// 1. Listar todos os Entregadores
router.get('/', authenticate, authorize([UserRole.ADMIN, UserRole.OPERATOR]), async (req: AuthenticatedRequest, res: Response) => {
  const merchantId = req.user?.merchantId;

  const deliveryPersons = await prisma.deliveryPerson.findMany({
    where: { merchant_id: merchantId },
    include: {
      user: { select: { email: true, role: true } },
      assignments: {
        where: { status: { in: ['ASSIGNED', 'ACCEPTED', 'ARRIVED_MERCHANT', 'PICKED_UP', 'ARRIVED_CUSTOMER'] } },
        include: { order: true },
      },
    },
    orderBy: { name: 'asc' },
  });

  return res.json({ success: true, data: deliveryPersons });
});

// 2. Cadastrar Novo Entregador + Conta de Usuário para Login
router.post('/', authenticate, authorize([UserRole.ADMIN, UserRole.OPERATOR]), async (req: AuthenticatedRequest, res: Response) => {
  const { name, phone, document, vehicle_type, vehicle_plate, picture_url, email, password } = req.body;
  const merchantId = req.user?.merchantId;

  if (!name || !phone || !document || !email || !password) {
    return res.status(400).json({ success: false, error: { message: 'Preencha todos os campos obrigatórios' } });
  }

  // Verificar se e-mail já existe
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return res.status(400).json({ success: false, error: { message: 'Já existe um usuário cadastrado com este e-mail' } });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const deliveryPerson = await prisma.deliveryPerson.create({
    data: {
      merchant_id: merchantId!,
      name,
      phone,
      document,
      vehicle_type: (vehicle_type as VehicleType) || VehicleType.MOTORBIKE_BAG,
      vehicle_plate,
      picture_url,
      status: DeliveryPersonStatus.OFFLINE,
    },
  });

  // Criar conta de usuário associada com role DELIVERY_PERSON
  await prisma.user.create({
    data: {
      merchant_id: merchantId!,
      name,
      email,
      password_hash: passwordHash,
      role: UserRole.DELIVERY_PERSON,
      delivery_person_id: deliveryPerson.id,
    },
  });

  return res.json({ success: true, data: deliveryPerson });
});

// 3. Atualizar Status do Entregador
router.patch('/:id/status', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status || !Object.values(DeliveryPersonStatus).includes(status)) {
    return res.status(400).json({ success: false, error: { message: 'Status de entregador inválido' } });
  }

  const updated = await prisma.deliveryPerson.update({
    where: { id },
    data: { status: status as DeliveryPersonStatus },
  });

  return res.json({ success: true, data: updated });
});

// 4. Atualizar Localização GPS do Entregador (Respeitando regra 35)
router.post('/:id/location', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { latitude, longitude } = req.body;

  if (latitude === undefined || longitude === undefined) {
    return res.status(400).json({ success: false, error: { message: 'Coordenadas de latitude e longitude são necessárias' } });
  }

  const updated = await prisma.deliveryPerson.update({
    where: { id },
    data: {
      current_lat: parseFloat(latitude),
      current_lng: parseFloat(longitude),
    },
  });

  return res.json({ success: true, data: updated });
});

export default router;
