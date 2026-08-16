import React, { useState, useEffect } from 'react';
import { Order, DeliveryPerson } from '../../types';
import { api } from '../../services/api';
import { X, CheckCircle, Clock, Bike, XCircle, MapPin, User as UserIcon, Phone, DollarSign, Package, AlertCircle } from 'lucide-react';

interface OrderDetailsModalProps {
  orderId: string | null;
  onClose: () => void;
  onRefresh: () => void;
}

export const OrderDetailsModal: React.FC<OrderDetailsModalProps> = ({ orderId, onClose, onRefresh }) => {
  const [order, setOrder] = useState<Order | null>(null);
  const [drivers, setDrivers] = useState<DeliveryPerson[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (orderId) {
      fetchOrderDetails();
      fetchDrivers();
    }
  }, [orderId]);

  const fetchOrderDetails = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/orders/${orderId}`);
      if (res.data.success) {
        setOrder(res.data.data);
      }
    } catch (err: any) {
      setError('Erro ao carregar detalhes do pedido');
    } finally {
      setLoading(false);
    }
  };

  const fetchDrivers = async () => {
    try {
      const res = await api.get('/delivery-persons');
      if (res.data.success) {
        setDrivers(res.data.data);
      }
    } catch (err) {}
  };

  const handleAction = async (endpoint: string, payload?: any) => {
    if (!orderId) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await api.post(`/orders/${orderId}/${endpoint}`, payload);
      if (res.data.success) {
        await fetchOrderDetails();
        onRefresh();
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Falha ao executar ação no pedido');
    } finally {
      setActionLoading(false);
    }
  };

  if (!orderId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <div className="glass-panel w-full max-w-4xl rounded-2xl border border-gray-800 shadow-2xl overflow-hidden my-8">
        {/* Header do Modal */}
        <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-900/80">
          <div>
            <div className="flex items-center space-x-3">
              <h2 className="text-xl font-bold text-white">Pedido #{order?.display_id || order?.deliveryvip_order_id.slice(-4)}</h2>
              <span className="text-xs px-2.5 py-1 rounded-full bg-brand-500/20 text-brand-400 font-semibold border border-brand-500/30">
                {order?.type} — {order?.sales_channel}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">ID DeliveryVip: {order?.deliveryvip_order_id}</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800">
            <X className="w-6 h-6" />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="p-12 text-center text-gray-400">Carregando detalhes do pedido...</div>
        ) : order ? (
          <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
            {/* Status Atual & Ações Dinâmicas (Seção 42) */}
            <div className="p-5 rounded-2xl bg-gray-900/60 border border-gray-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <span className="text-xs text-gray-400 uppercase font-semibold">Status Atual do Pedido</span>
                <div className="text-lg font-bold text-brand-400">{order.internal_status}</div>
              </div>

              {/* Botões Condicionais por Estado */}
              <div className="flex flex-wrap gap-2">
                {order.internal_status === 'NEW' && (
                  <button
                    onClick={() => handleAction('confirm')}
                    disabled={actionLoading}
                    className="py-2 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl text-sm transition-colors flex items-center gap-1.5"
                  >
                    <CheckCircle className="w-4 h-4" /> Confirmar Pedido
                  </button>
                )}

                {order.internal_status === 'CONFIRMED' && (
                  <button
                    onClick={() => handleAction('prepare')}
                    disabled={actionLoading}
                    className="py-2 px-4 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl text-sm transition-colors flex items-center gap-1.5"
                  >
                    <Clock className="w-4 h-4" /> Iniciar Preparo
                  </button>
                )}

                {order.internal_status === 'PREPARING' && (
                  <button
                    onClick={() => handleAction('ready')}
                    disabled={actionLoading}
                    className="py-2 px-4 bg-teal-600 hover:bg-teal-500 text-white font-medium rounded-xl text-sm transition-colors flex items-center gap-1.5"
                  >
                    <Package className="w-4 h-4" /> Marcar Pronto para Retirada
                  </button>
                )}

                {(order.internal_status === 'READY_FOR_PICKUP' || order.internal_status === 'WAITING_DELIVERY_PERSON') && (
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedDriverId}
                      onChange={(e) => setSelectedDriverId(e.target.value)}
                      className="bg-gray-800 text-white border border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none"
                    >
                      <option value="">Selecione um entregador...</option>
                      {drivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.status})
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleAction('assign', { delivery_person_id: selectedDriverId })}
                      disabled={actionLoading || !selectedDriverId}
                      className="py-2 px-4 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-xl text-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Bike className="w-4 h-4" /> Atribuir Entregador
                    </button>
                  </div>
                )}

                {order.internal_status !== 'CANCELLED' && order.internal_status !== 'CONCLUDED' && order.internal_status !== 'DELIVERED' && (
                  <button
                    onClick={() => handleAction('cancel', { reason: 'Cancelado pelo operador', code: 'INTERNAL_DIFFICULTIES_OF_THE_RESTAURANT' })}
                    disabled={actionLoading}
                    className="py-2 px-4 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 font-medium rounded-xl text-sm transition-colors flex items-center gap-1.5"
                  >
                    <XCircle className="w-4 h-4" /> Cancelar Pedido
                  </button>
                )}
              </div>
            </div>

            {/* Informações do Cliente e Endereço */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="glass-panel p-5 rounded-2xl space-y-3">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <UserIcon className="w-4 h-4 text-brand-500" /> Cliente
                </h3>
                <div className="text-gray-200 font-medium">{order.customer?.name || 'Cliente não identificado'}</div>
                {order.customer?.phone && (
                  <div className="text-xs text-gray-400 flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-gray-500" /> {order.customer.phone}
                  </div>
                )}
              </div>

              <div className="glass-panel p-5 rounded-2xl space-y-3">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-amber-500" /> Endereço de Entrega
                </h3>
                <div className="text-gray-200 text-sm">
                  {order.address?.formatted_address || `${order.address?.street}, ${order.address?.number} - ${order.address?.district}`}
                </div>
                {order.address?.complement && (
                  <div className="text-xs text-gray-400">Complemento: {order.address.complement}</div>
                )}
              </div>
            </div>

            {/* Itens do Pedido */}
            <div className="glass-panel p-5 rounded-2xl space-y-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-500" /> Itens do Pedido
              </h3>
              <div className="divide-y divide-gray-800">
                {order.items?.map((item) => (
                  <div key={item.id} className="py-3 flex justify-between items-start">
                    <div>
                      <div className="font-semibold text-white">
                        {item.quantity}x {item.name}
                      </div>
                      {item.options && item.options.length > 0 && (
                        <div className="text-xs text-gray-400 mt-1 pl-4 space-y-0.5">
                          {item.options.map((opt) => (
                            <div key={opt.id}>+ {opt.quantity}x {opt.name}</div>
                          ))}
                        </div>
                      )}
                      {item.special_instructions && (
                        <div className="text-xs text-amber-400 italic mt-1">Obs: {item.special_instructions}</div>
                      )}
                    </div>
                    <div className="font-semibold text-gray-200">R$ {item.total_price.toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Financeiro */}
            <div className="glass-panel p-5 rounded-2xl space-y-2">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-500" /> Valores e Pagamento
              </h3>
              <div className="flex justify-between text-sm text-gray-400">
                <span>Subtotal dos itens:</span>
                <span>R$ {order.items_price.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-400">
                <span>Taxa de entrega:</span>
                <span>R$ {order.other_fees.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-emerald-400">
                <span>Descontos:</span>
                <span>- R$ {order.discount_amount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-white pt-2 border-t border-gray-800">
                <span>Valor Total:</span>
                <span className="text-amber-400">R$ {order.order_amount.toFixed(2)}</span>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
