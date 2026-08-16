import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { DashboardData } from '../../types';
import { 
  ShoppingBag, 
  Clock, 
  CheckCircle2, 
  Bike, 
  AlertTriangle, 
  DollarSign, 
  RefreshCw, 
  Play,
  TrendingUp
} from 'lucide-react';
import { Link } from 'react-router-dom';

export const DashboardPage: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggeringMock, setTriggeringMock] = useState(false);

  const fetchDashboardData = async () => {
    try {
      const res = await api.get('/dashboard');
      if (res.data.success) {
        setData(res.data.data);
      }
    } catch (err) {
      console.error('Erro ao carregar dashboard', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 10000); // Auto-refresh a cada 10s
    return () => clearInterval(interval);
  }, []);

  const handleSimulateNewOrder = async () => {
    setTriggeringMock(true);
    try {
      await axiosPostMock('/mock/trigger-event', { eventType: 'CREATED' });
      await fetchDashboardData();
    } catch (err) {
      console.error('Erro ao disparar evento simulado', err);
    } finally {
      setTriggeringMock(false);
    }
  };

  const axiosPostMock = async (url: string, body: any) => {
    return fetch(`http://localhost:3001${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  const stats = data?.stats || {
    new: 0,
    preparing: 0,
    ready: 0,
    waitingDriver: 0,
    onDelivery: 0,
    delivered: 0,
    cancelled: 0,
    totalAmountToday: 0,
  };

  const driverStats = data?.driverStats || { available: 0, busy: 0, offline: 0, total: 0 };

  return (
    <div className="space-y-8">
      {/* Header com ações rápidas */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Dashboard Operacional</h1>
          <p className="text-gray-400 text-sm">Acompanhamento em tempo real dos pedidos DeliveryVip e frota de entregadores</p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchDashboardData}
            className="p-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl border border-gray-700 transition-colors flex items-center gap-2 text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Atualizar</span>
          </button>
          <button
            onClick={handleSimulateNewOrder}
            disabled={triggeringMock}
            className="py-2.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium rounded-xl shadow-lg shadow-emerald-600/20 flex items-center space-x-2 transition-all text-sm"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>{triggeringMock ? 'Simulando...' : 'Simular Novo Pedido (Mock)'}</span>
          </button>
        </div>
      </div>

      {/* Cards de Métricas e KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="glass-panel p-5 rounded-2xl border-l-4 border-l-amber-500">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Novos Pedidos</span>
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
              <ShoppingBag className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-white">{stats.new}</div>
          <p className="text-xs text-amber-400 mt-2 font-medium">Aguardando confirmação</p>
        </div>

        <div className="glass-panel p-5 rounded-2xl border-l-4 border-l-blue-500">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Em Preparo</span>
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-white">{stats.preparing}</div>
          <p className="text-xs text-blue-400 mt-2 font-medium">Em produção na cozinha</p>
        </div>

        <div className="glass-panel p-5 rounded-2xl border-l-4 border-l-purple-500">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Em Rota de Entrega</span>
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
              <Bike className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-white">{stats.onDelivery}</div>
          <p className="text-xs text-purple-400 mt-2 font-medium">Com entregador em trânsito</p>
        </div>

        <div className="glass-panel p-5 rounded-2xl border-l-4 border-l-emerald-500">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Faturamento Hoje</span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-white">R$ {stats.totalAmountToday.toFixed(2)}</div>
          <p className="text-xs text-emerald-400 mt-2 font-medium flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" />
            Total acumulado no dia
          </p>
        </div>
      </div>

      {/* Resumo Secundário: Status da Frota de Entregadores */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 glass-panel p-6 rounded-2xl">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Bike className="w-5 h-5 text-brand-500" />
            Status da Frota de Entregadores
          </h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <span className="text-sm font-medium text-emerald-300 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Disponíveis
              </span>
              <span className="text-lg font-bold text-white">{driverStats.available}</span>
            </div>

            <div className="flex justify-between items-center p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <span className="text-sm font-medium text-amber-300 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                Em Entrega (Ocupados)
              </span>
              <span className="text-lg font-bold text-white">{driverStats.busy}</span>
            </div>

            <div className="flex justify-between items-center p-3 rounded-xl bg-gray-800 border border-gray-700">
              <span className="text-sm font-medium text-gray-400 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-gray-500"></span>
                Offline
              </span>
              <span className="text-lg font-bold text-gray-300">{driverStats.offline}</span>
            </div>
          </div>

          <Link
            to="/drivers"
            className="mt-6 w-full py-2.5 bg-gray-800 hover:bg-gray-700 text-brand-400 rounded-xl font-medium text-sm flex items-center justify-center transition-colors"
          >
            Gerenciar Entregadores
          </Link>
        </div>

        {/* Tabela de Pedidos Recentes */}
        <div className="lg:col-span-2 glass-panel p-6 rounded-2xl">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-amber-500" />
              Últimos Pedidos Recebidos
            </h2>
            <Link to="/orders" className="text-xs font-semibold text-brand-500 hover:underline">
              Ver Todos os Pedidos →
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-gray-400 bg-gray-900/60 border-b border-gray-800">
                <tr>
                  <th className="py-3 px-3">Pedido</th>
                  <th className="py-3 px-3">Cliente</th>
                  <th className="py-3 px-3">Status Interno</th>
                  <th className="py-3 px-3">Valor</th>
                  <th className="py-3 px-3 text-right">Horário</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {data?.recentOrders && data.recentOrders.length > 0 ? (
                  data.recentOrders.slice(0, 5).map((order) => (
                    <tr key={order.id} className="hover:bg-gray-800/40 transition-colors">
                      <td className="py-3 px-3 font-semibold text-white">#{order.display_id || order.deliveryvip_order_id.slice(-4)}</td>
                      <td className="py-3 px-3 text-gray-300">{order.customer?.name || 'Cliente'}</td>
                      <td className="py-3 px-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getStatusBadge(order.internal_status)}`}>
                          {order.internal_status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-gray-200 font-medium">R$ {order.order_amount.toFixed(2)}</td>
                      <td className="py-3 px-3 text-gray-400 text-xs text-right">
                        {new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-gray-500">Nenhum pedido recebido ainda.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

function getStatusBadge(status: string): string {
  switch (status) {
    case 'NEW':
      return 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
    case 'CONFIRMED':
    case 'PREPARING':
      return 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
    case 'READY_FOR_PICKUP':
      return 'bg-teal-500/20 text-teal-300 border border-teal-500/30';
    case 'DELIVERY_PERSON_ASSIGNED':
    case 'GOING_TO_MERCHANT':
    case 'ARRIVED_AT_MERCHANT':
    case 'ORDER_PICKED_UP':
    case 'GOING_TO_CUSTOMER':
    case 'ARRIVED_AT_CUSTOMER':
      return 'bg-purple-500/20 text-purple-300 border border-purple-500/30';
    case 'DELIVERED':
    case 'CONCLUDED':
      return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
    case 'CANCELLED':
    case 'CANCELLATION_REQUESTED':
      return 'bg-red-500/20 text-red-300 border border-red-500/30';
    default:
      return 'bg-gray-800 text-gray-400';
  }
}
