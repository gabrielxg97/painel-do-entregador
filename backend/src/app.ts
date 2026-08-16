import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import authRoutes from './routes/authRoutes';
import merchantRoutes from './routes/merchantRoutes';
import orderRoutes from './routes/orderRoutes';
import deliveryPersonRoutes from './routes/deliveryPersonRoutes';
import driverRoutes from './routes/driverRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import auditRoutes from './routes/auditRoutes';
import { Logger } from './common/logger';

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rota de Healthcheck
app.get('/health', (req: Request, res: Response) => {
  res.json({ success: true, service: 'DeliveryVip Backend API', timestamp: new Date() });
});

// Registro de Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/merchants', merchantRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/delivery-persons', deliveryPersonRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/audit', auditRoutes);

// Rota 404
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Rota não encontrada: ${req.method} ${req.url}`,
    },
  });
});

// Middleware Global de Tratamento de Erros (Seção 61)
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  Logger.error('Erro interno na requisição:', err);

  const statusCode = err.statusCode || 500;
  const errorCode = err.code || 'INTERNAL_SERVER_ERROR';
  const errorMessage = err.message || 'Ocorreu um erro interno no servidor';

  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message: errorMessage,
    },
  });
});

export default app;
