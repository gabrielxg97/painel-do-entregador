import { prisma } from '../db/prisma';
import { decryptSecret } from '../common/crypto';
import { EventProcessorService } from '../deliveryvip/eventProcessor';
import { DeliveryVipClient, MerchantCredentials } from '../deliveryvip/deliveryVipClient';
import { Logger } from '../common/logger';
import { config } from '../config/env';

export class PollingWorker {
  private isRunning: boolean = false;
  private intervalMs: number;

  constructor(intervalSeconds: number = 30) {
    this.intervalMs = intervalSeconds * 1000;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    Logger.info(`🚀 DeliveryVip Polling Worker iniciado (Intervalo: ${this.intervalMs / 1000}s)`);

    while (this.isRunning) {
      try {
        await this.pollAllActiveMerchants();
      } catch (error: any) {
        Logger.error('Erro no ciclo do PollingWorker:', error.message);
      }

      await this.sleep(this.intervalMs);
    }
  }

  stop(): void {
    this.isRunning = false;
    Logger.info('🛑 DeliveryVip Polling Worker parado.');
  }

  private async pollAllActiveMerchants(): Promise<void> {
    // 1. Buscar merchants ativos no banco
    const merchants = await prisma.merchant.findMany({
      where: { active: true },
    });

    let merchantList: MerchantCredentials[] = [];

    if (merchants.length > 0) {
      merchantList = merchants.map((m) => ({
        apiUrl: config.deliveryvip.apiUrl,
        clientId: m.deliveryvip_client_id,
        clientSecret: decryptSecret(m.deliveryvip_client_secret),
        merchantId: m.deliveryvip_merchant_id,
      }));
    } else if (config.deliveryvip.clientId && config.deliveryvip.clientSecret && config.deliveryvip.merchantId) {
      // Fallback para credenciais do .env se nenhum merchant cadastrado no banco ainda
      merchantList = [{
        apiUrl: config.deliveryvip.apiUrl,
        clientId: config.deliveryvip.clientId,
        clientSecret: config.deliveryvip.clientSecret,
        merchantId: config.deliveryvip.merchantId,
      }];
    }

    if (merchantList.length === 0) {
      Logger.warn('Nenhum merchant ativo ou configurado para realizar polling.');
      return;
    }

    for (const merchant of merchantList) {
      await this.pollMerchantWithRetry(merchant);
    }
  }

  private async pollMerchantWithRetry(merchant: MerchantCredentials, maxRetries: number = 3): Promise<void> {
    let attempt = 0;
    let delay = 1000;

    while (attempt < maxRetries) {
      try {
        const client = new DeliveryVipClient(merchant);
        const events = await client.pollEvents();

        if (events && Array.isArray(events) && events.length > 0) {
          Logger.info(`Recebidos ${events.length} evento(s) da DeliveryVip para Merchant ${merchant.merchantId}`);
          await EventProcessorService.processEvents(merchant, events);
        }
        return; // Sucesso, sair da função de retry
      } catch (error: any) {
        attempt++;
        Logger.warn(`Tentativa ${attempt}/${maxRetries} falhou ao realizar polling para Merchant ${merchant.merchantId}: ${error.message}`);
        
        if (attempt >= maxRetries) {
          Logger.error(`Maximo de tentativas atingido para polling do Merchant ${merchant.merchantId}`);
          break;
        }

        await this.sleep(delay);
        delay *= 2; // Backoff exponencial
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
