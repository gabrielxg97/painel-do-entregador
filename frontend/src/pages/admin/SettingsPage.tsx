import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Store, ShieldCheck, CheckCircle2, XCircle, RefreshCw, Key, Lock } from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const [name, setName] = useState('');
  const [merchantId, setMerchantId] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchMerchantSettings();
  }, []);

  const fetchMerchantSettings = async () => {
    setLoading(true);
    try {
      const res = await api.get('/merchants/my-merchant');
      if (res.data.success) {
        const m = res.data.data;
        setName(m.name);
        setMerchantId(m.deliveryvip_merchant_id);
        setClientId(m.deliveryvip_client_id);
        setLastSync(m.lastEventAt);
      }
    } catch (err) {
      console.error('Erro ao carregar configurações', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await api.post('/merchants/save', {
        name,
        deliveryvip_merchant_id: merchantId,
        deliveryvip_client_id: clientId,
        deliveryvip_client_secret: clientSecret || undefined,
      });

      if (res.data.success) {
        setMessage('Configurações do Merchant salvas com sucesso!');
        setClientSecret(''); // Limpar o campo de secret por segurança
        fetchMerchantSettings();
      }
    } catch (err: any) {
      setMessage(`Erro ao salvar: ${err.response?.data?.error?.message || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.post('/merchants/test-connection');
      setTestResult({
        success: res.data.success,
        message: res.data.message || 'Conexão validada com a API DeliveryVip!',
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.response?.data?.error?.message || 'Falha na conexão com a DeliveryVip',
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-gray-400">Carregando configurações...</div>;
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Configurações da Integração DeliveryVip</h1>
        <p className="text-gray-400 text-sm">Gerencie suas credenciais de API Merchant V3 e teste o status da conexão</p>
      </div>

      {message && (
        <div className="p-4 rounded-xl bg-brand-500/10 border border-brand-500/30 text-brand-300 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-brand-500" />
          <span>{message}</span>
        </div>
      )}

      {testResult && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-center gap-2 ${
            testResult.success
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}
        >
          {testResult.success ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
          <span>{testResult.message}</span>
        </div>
      )}

      <div className="glass-panel p-6 rounded-2xl border border-gray-800 space-y-6">
        <form onSubmit={handleSave} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase mb-2">Nome do Estabelecimento / Merchant</label>
            <div className="relative">
              <Store className="w-5 h-5 absolute left-3.5 top-3.5 text-gray-500" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Ex: Pizzaria Nostra"
                className="w-full bg-gray-900 border border-gray-700/80 rounded-xl py-3 pl-11 pr-4 text-white focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-semibold text-gray-300 uppercase mb-2">Merchant ID (UUID)</label>
              <div className="relative">
                <Key className="w-5 h-5 absolute left-3.5 top-3.5 text-gray-500" />
                <input
                  type="text"
                  value={merchantId}
                  onChange={(e) => setMerchantId(e.target.value)}
                  required
                  placeholder="UUID do Merchant DeliveryVip"
                  className="w-full bg-gray-900 border border-gray-700/80 rounded-xl py-3 pl-11 pr-4 text-white focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 uppercase mb-2">Client ID (OAuth 2.0)</label>
              <div className="relative">
                <ShieldCheck className="w-5 h-5 absolute left-3.5 top-3.5 text-gray-500" />
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  required
                  placeholder="Client ID da DeliveryVip"
                  className="w-full bg-gray-900 border border-gray-700/80 rounded-xl py-3 pl-11 pr-4 text-white focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase mb-2">
              Client Secret <span className="text-gray-500 normal-case font-normal">(Deixe em branco para manter a secret atual criptografada no backend)</span>
            </label>
            <div className="relative">
              <Lock className="w-5 h-5 absolute left-3.5 top-3.5 text-gray-500" />
              <input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="••••••••••••••••••••••••••••••••"
                className="w-full bg-gray-900 border border-gray-700/80 rounded-xl py-3 pl-11 pr-4 text-white focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          <div className="pt-4 flex flex-wrap items-center justify-between gap-4 border-t border-gray-800">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing}
              className="py-3 px-5 bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium rounded-xl border border-gray-700 transition-colors flex items-center space-x-2 text-sm"
            >
              <RefreshCw className={`w-4 h-4 ${testing ? 'animate-spin' : ''}`} />
              <span>{testing ? 'Testando Conexão...' : 'Testar Conexão com DeliveryVip'}</span>
            </button>

            <button
              type="submit"
              disabled={saving}
              className="py-3 px-6 bg-gradient-to-r from-brand-600 to-amber-600 hover:from-brand-500 hover:to-amber-500 text-white font-semibold rounded-xl shadow-lg shadow-brand-500/20 transition-all text-sm"
            >
              {saving ? 'Salvando...' : 'Salvar Configurações'}
            </button>
          </div>
        </form>

        {lastSync && (
          <div className="text-xs text-gray-500 pt-3 border-t border-gray-800/60">
            Último evento recebido do Polling Worker: {new Date(lastSync).toLocaleString('pt-BR')}
          </div>
        )}
      </div>
    </div>
  );
};
