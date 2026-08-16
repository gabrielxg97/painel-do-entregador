import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Order } from '../../types';
import { Search, Filter, RefreshCw, Eye } from 'lucide-react';
import { OrderDetailsModal } from './OrderDetailsModal';

export const OrdersPage: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (typeFilter) params.type = typeFilter;

      const res = await api.get('/orders', { params });
      if (res.data.success) {
        setOrders(res.data.data);
      }
    } catch (err) {
      console.error('Erro ao carregar pedidos', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [statusFilter, typeFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchOrders();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Gestão de Pedidos</h1>
          <p className="text-gray-400 text-sm">Visualize, filtre e gerencie todos os pedidos recebidos da DeliveryVip</p>
        </div>

        <button
          onClick={fetchOrders}
          className="p-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl border border-gray-700 transition-colors flex items-center gap-2 text-sm self-start md:self-auto"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Atualizar Pedidos</span>
        </button>
      </div>

      {/* Barra de Filtros */}
      <div className="glass-panel p-4 rounded-2xl flex flex-col md:flex-row gap-4 justify-between items-center">
        <form onSubmit={handleSearchSubmit} className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por código, cliente..."
            className="w-full bg-gray-900 border border-gray-700/80 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-brand-500"
          />
        </form>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-400">
            <Filter className="w-4 h-4 text-brand-500" />
            Filtros:
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-gray-900 text-gray-200 border border-gray-700 rounded-xl px-3 py-2 text-xs focus:outline-none"
          >
            <option value="">Todos os Status</option>
            <option value="NEW">Novos (NEW)</option>
            <option value="CONFIRMED">Confirmados (CONFIRMED)</option>
            <option value="PREPARING">Em Preparo (PREPARING)</option>
            <option value="READY_FOR_PICKUP">Prontos (READY_FOR_PICKUP)</option>
            <option value="DELIVERY_PERSON_ASSIGNED">Entregador Atribuído</option>
            <option value="DELIVERED">Entregues (DELIVERED)</option>
            <option value="CANCELLED">Cancelados (CANCELLED)</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-gray-900 text-gray-200 border border-gray-700 rounded-xl px-3 py-2 text-xs focus:outline-none"
          >
            <option value="">Todos os Tipos</option>
            <option value="DELIVERY">DELIVERY</option>
            <option value="TAKEOUT">TAKEOUT</option>
            <option value="INDOOR">INDOOR</option>
          </select>
        </div>
      </div>

      {/* Tabela de Pedidos */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">Carregando pedidos...</div>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center text-gray-500">Nenhum pedido encontrado com os filtros selecionados.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-gray-400 bg-gray-900/80 border-b border-gray-800">
                <tr>
                  <th className="py-3.5 px-4">Código</th>
                  <th className="py-3.5 px-4">Cliente</th>
                  <th className="py-3.5 px-4">Tipo / Canal</th>
                  <th className="py-3.5 px-4">Status Interno</th>
                  <th className="py-3.5 px-4">Entregador</th>
                  <th className="py-3.5 px-4">Valor Total</th>
                  <th className="py-3.5 px-4">Data / Hora</th>
                  <th className="py-3.5 px-4 text-center">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {orders.map((ord) => {
                  const driverName = ord.assignments?.[0]?.delivery_person?.name || 'Não atribuído';
                  return (
                    <tr key={ord.id} className="hover:bg-gray-800/40 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-white">#{ord.display_id || ord.deliveryvip_order_id.slice(-4)}</td>
                      <td className="py-3.5 px-4 font-medium text-gray-200">{ord.customer?.name || 'Cliente'}</td>
                      <td className="py-3.5 px-4 text-xs text-gray-400">
                        <span className="px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-300 font-semibold">
                          {ord.type}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getStatusBadge(ord.internal_status)}`}>
                          {ord.internal_status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-gray-300 font-medium">{driverName}</td>
                      <td className="py-3.5 px-4 font-bold text-amber-400">R$ {ord.order_amount.toFixed(2)}</td>
                      <td className="py-3.5 px-4 text-xs text-gray-400">
                        {new Date(ord.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => setSelectedOrderId(ord.id)}
                          className="p-2 text-brand-400 hover:bg-brand-500/10 rounded-lg transition-colors"
                          title="Ver Detalhes do Pedido"
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Detalhes */}
      {selectedOrderId && (
        <OrderDetailsModal
          orderId={selectedOrderId}
          onClose={() => setSelectedOrderId(null)}
          onRefresh={fetchOrders}
        />
      )}
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
