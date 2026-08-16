import axios, { AxiosInstance } from 'axios';
import { TokenManager } from './tokenManager';
import { Logger } from '../common/logger';
import { prisma } from '../db/prisma';

export interface MerchantCredentials {
  apiUrl: string;
  clientId: string;
  clientSecret: string;
  merchantId: string;
}

export class DeliveryVipClient {
  private credentials: MerchantCredentials;

  constructor(credentials: MerchantCredentials) {
    this.credentials = credentials;
  }

  private async getAuthToken(): Promise<string> {
    return TokenManager.getToken(
      this.credentials.apiUrl,
      this.credentials.clientId,
      this.credentials.clientSecret
    );
  }

  private async request(method: string, endpoint: string, data?: any, customHeaders?: any) {
    const token = await this.getAuthToken();
    const url = `${this.credentials.apiUrl}${endpoint}`;
    const startTime = Date.now();

    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...customHeaders,
    };

    let responseStatus: number | undefined;
    let responseData: any;
    let errorMsg: string | undefined;

    try {
      const response = await axios({
        method,
        url,
        data,
        headers,
        timeout: 15000,
      });

      responseStatus = response.status;
      responseData = response.data;
      return responseData;
    } catch (error: any) {
      responseStatus = error.response?.status;
      responseData = error.response?.data;
      errorMsg = error.message;
      Logger.error(`Erro ao chamar endpoint ${method} ${endpoint}`, { status: responseStatus, data: responseData });
      throw error;
    } finally {
      const durationMs = Date.now() - startTime;
      // Salvar log auditável de API (sem expor tokens/secrets)
      prisma.apiLog.create({
        data: {
          service: 'DeliveryVip',
          endpoint,
          method,
          request_body: data ? Logger.sanitize(data) : undefined,
          response_status: responseStatus,
          response_body: responseData ? Logger.sanitize(responseData) : undefined,
          duration_ms: durationMs,
          error: errorMsg,
        },
      }).catch(err => Logger.error('Erro ao salvar ApiLog', err));
    }
  }

  // 1. Polling de Eventos
  async pollEvents(): Promise<any[]> {
    const headers = {
      'x-polling-merchants': this.credentials.merchantId,
    };
    return this.request('GET', '/merchant/v3/events:polling?orderType=DELIVERY', undefined, headers);
  }

  // 2. Envio de Acknowledgment
  async sendAck(ackList: { id: string; orderId?: string; eventType?: string }[]): Promise<any> {
    if (!ackList || ackList.length === 0) return;
    return this.request('POST', '/merchant/v3/events/acknowledgment', ackList);
  }

  // 3. Consulta Detalhada de Pedido (OBRIGATÓRIO antes de confirmar)
  async getOrderDetails(orderId: string): Promise<any> {
    return this.request('GET', `/merchant/v3/orders/${orderId}`);
  }

  // 4. Listagem de Pedidos para Sincronização / Reconciliação
  async listOrders(params?: Record<string, any>): Promise<any> {
    const query = new URLSearchParams(params).toString();
    const endpoint = `/merchant/v3/${this.credentials.merchantId}/orders${query ? `?${query}` : ''}`;
    return this.request('GET', endpoint);
  }

  // 5. Confirmar Pedido
  async confirmOrder(orderId: string, payload?: { reason?: string; orderExternalCode?: string }): Promise<any> {
    const body = {
      reason: payload?.reason || 'Pedido recebido e confirmado',
      createdAt: new Date().toISOString(),
      orderExternalCode: payload?.orderExternalCode || orderId,
    };
    return this.request('POST', `/merchant/v3/orders/${orderId}/confirm`, body);
  }

  // 6. Iniciar Preparo
  async startPreparing(orderId: string): Promise<any> {
    return this.request('POST', `/merchant/v3/orders/${orderId}/preparing`);
  }

  // 7. Marcar como Pronto para Retirada
  async readyForPickup(orderId: string): Promise<any> {
    return this.request('POST', `/merchant/v3/orders/${orderId}/readyForPickup`);
  }

  // 8. Despachar Pedido
  async dispatchOrder(orderId: string): Promise<any> {
    return this.request('POST', `/merchant/v3/orders/${orderId}/dispatch`);
  }

  // 9. Pedido Retirado (Takeout)
  async orderPickedUp(orderId: string): Promise<any> {
    return this.request('POST', `/merchant/v3/orders/${orderId}/pickedUp`);
  }

  // 10. Pedido Entregue
  async orderDelivered(orderId: string): Promise<any> {
    return this.request('POST', `/merchant/v3/orders/${orderId}/delivered`);
  }

  // 11. Solicitacao de Cancelamento
  async requestCancellation(orderId: string, payload: {
    reason: string;
    code?: string;
    mode?: 'AUTO' | 'MANUAL';
    outOfStockItems?: string[];
    invalidItems?: string[];
  }): Promise<any> {
    const body = {
      reason: payload.reason,
      code: payload.code || 'UNAVAILABLE_ITEM',
      mode: payload.mode || 'MANUAL',
      outOfStockItems: payload.outOfStockItems || [],
      invalidItems: payload.invalidItems || [],
    };
    return this.request('POST', `/merchant/v3/orders/${orderId}/requestCancellation`, body);
  }

  // 12. Aceitar Cancelamento
  async acceptCancellation(orderId: string): Promise<any> {
    return this.request('POST', `/merchant/v3/orders/${orderId}/acceptCancellation`);
  }

  // 13. Negar Cancelamento
  async denyCancellation(orderId: string): Promise<any> {
    return this.request('POST', `/merchant/v3/orders/${orderId}/denyCancellation`);
  }

  // 14. Atualizacao de Tracking (Geolocalizacao, ETA, Entregador, Status)
  async sendTracking(orderId: string, trackingData: {
    event?: { type: string; message?: string; datetime?: string };
    problem?: string;
    vehicle?: { type: string; licencePlate?: string };
    eta?: { pickupEtaInMinutes?: number; deliveryEtaInMinutes?: number };
    deliveryPerson?: { id: string; name: string; pictureURL?: string };
    geoLocalization?: { latitude: number; longitude: number; timestamp?: string };
    externalTrackingURL?: string;
  }): Promise<any> {
    return this.request('POST', `/merchant/v3/orders/${orderId}/tracking`, trackingData);
  }
}
