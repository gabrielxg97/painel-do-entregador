import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/deliveryvip_db?schema=public',
  jwtSecret: process.env.JWT_SECRET || 'deliveryvip_jwt_super_secret_key_2026',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'deliveryvip_jwt_refresh_secret_key_2026',
  encryptionKey: process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef',
  deliveryvip: {
    apiUrl: process.env.DELIVERYVIP_API_URL || 'https://api.deliveryvip.com.br',
    clientId: process.env.DELIVERYVIP_CLIENT_ID || '',
    clientSecret: process.env.DELIVERYVIP_CLIENT_SECRET || '',
    merchantId: process.env.DELIVERYVIP_MERCHANT_ID || '',
  },
};
