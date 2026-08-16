import axios from 'axios';
import { Logger } from '../common/logger';

interface TokenCache {
  accessToken: string;
  expiresAt: number; // Timestamp em ms
}

export class TokenManager {
  private static tokenStore = new Map<string, TokenCache>();

  static async getToken(apiUrl: string, clientId: string, clientSecret: string): Promise<string> {
    const key = `${apiUrl}:${clientId}`;
    const cached = this.tokenStore.get(key);

    // Se o token existe e é válido por mais de 5 minutos, reutilizar
    if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) {
      return cached.accessToken;
    }

    Logger.info(`Buscando novo token OAuth 2.0 para client_id: ${clientId}`);
    try {
      const response = await axios.post(
        `${apiUrl}/authentication/v1/oauth/token`,
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
          scope: 'od.all dv.partner',
        }).toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 10000,
        }
      );

      const accessToken = response.data.access_token || response.data.accessToken;
      const expiresIn = response.data.expires_in || response.data.expiresIn || 86400;

      const expiresAt = Date.now() + expiresIn * 1000;
      this.tokenStore.set(key, { accessToken, expiresAt });

      Logger.info(`Novo token OAuth 2.0 obtido com sucesso para client_id: ${clientId}`);
      return accessToken;
    } catch (error: any) {
      Logger.error(`Erro ao obter token OAuth 2.0 para client_id: ${clientId}`, error.response?.data || error.message);
      throw new Error(`Falha na autenticação OAuth 2.0 com a DeliveryVip: ${error.message}`);
    }
  }

  static clearToken(apiUrl: string, clientId: string): void {
    const key = `${apiUrl}:${clientId}`;
    this.tokenStore.delete(key);
  }
}
