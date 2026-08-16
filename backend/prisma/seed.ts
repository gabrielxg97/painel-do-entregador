import { PrismaClient, UserRole, DeliveryPersonStatus, VehicleType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { encryptSecret } from '../src/common/crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Populando banco de dados com dados iniciais (Seeding)...');

  // 1. Criar Merchant Padrão
  const merchant = await prisma.merchant.upsert({
    where: { deliveryvip_merchant_id: 'default_merchant_uuid' },
    create: {
      name: 'Restaurante Exemplo DeliveryVip',
      deliveryvip_merchant_id: 'default_merchant_uuid',
      deliveryvip_client_id: 'default_client_id',
      deliveryvip_client_secret: encryptSecret('default_client_secret'),
      active: true,
    },
    update: {},
  });

  const passwordHash = await bcrypt.hash('123456', 10);

  // 2. Criar Usuário ADMIN
  await prisma.user.upsert({
    where: { email: 'admin@deliveryvip.com' },
    create: {
      merchant_id: merchant.id,
      name: 'Gabriel Administrador',
      email: 'admin@deliveryvip.com',
      password_hash: passwordHash,
      role: UserRole.ADMIN,
    },
    update: {},
  });

  // 3. Criar Usuário OPERATOR
  await prisma.user.upsert({
    where: { email: 'operador@deliveryvip.com' },
    create: {
      merchant_id: merchant.id,
      name: 'Carlos Operador',
      email: 'operador@deliveryvip.com',
      password_hash: passwordHash,
      role: UserRole.OPERATOR,
    },
    update: {},
  });

  // 4. Criar Entregador de Exemplo
  const deliveryPerson = await prisma.deliveryPerson.create({
    data: {
      merchant_id: merchant.id,
      name: 'João Entregador',
      phone: '11999998888',
      document: '123.456.789-00',
      vehicle_type: VehicleType.MOTORBIKE_BAG,
      vehicle_plate: 'ABC-1234',
      status: DeliveryPersonStatus.AVAILABLE,
      current_lat: -23.55052,
      current_lng: -46.633308,
    },
  });

  // 5. Criar Usuário para o Entregador
  await prisma.user.upsert({
    where: { email: 'entregador@deliveryvip.com' },
    create: {
      merchant_id: merchant.id,
      name: 'João Entregador',
      email: 'entregador@deliveryvip.com',
      password_hash: passwordHash,
      role: UserRole.DELIVERY_PERSON,
      delivery_person_id: deliveryPerson.id,
    },
    update: {},
  });

  console.log('✅ Seeding concluído com sucesso!');
  console.log('Credenciais de teste criadas (Senha padrão: 123456):');
  console.log(' - Admin: admin@deliveryvip.com');
  console.log(' - Operador: operador@deliveryvip.com');
  console.log(' - Entregador: entregador@deliveryvip.com');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
