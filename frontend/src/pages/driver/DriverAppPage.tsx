import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { 
  Bike, 
  MapPin, 
  Navigation, 
  CheckCircle2, 
  AlertTriangle, 
  Phone, 
  User, 
  DollarSign, 
  Package, 
  LogOut,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';

export const DriverAppPage: React.FC = () => {
  const { user, logout } = useAuth();
  const [activeDelivery, setActiveDelivery] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [driverStatus, setDriverStatus] = useState<string>('AVAILABLE');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [problemCode, setProblemCode] = useState('NOBODY_TO_RECEIVE');
  const [issueObs, setIssueObs] = useState('');
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');

  const fetchDeliveries = async () => {
    setLoading(true);
    try {
      const res = await api.get('/driver/deliveries');
      if (res.data.success) {
        setActiveDelivery(res.data.data.activeDelivery);
        setHistory(res.data.data.history || []);
      }
    } catch (err) {
      console.error('Erro ao buscar entregas', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeliveries();
    const interval = setInterval(fetchDeliveries, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleUpdateStatus = async (newStatus: string) => {
    if (!user?.deliveryPersonId) return;
    try {
      await api.patch(`/delivery-persons/${user.deliveryPersonId}/status`, { status: newStatus });
      setDriverStatus(newStatus);
    } catch (err) {}
  };

  const handleAcceptDelivery = async (orderId: string) => {
    setActionLoading(true);
    try {
      await api.post(`/driver/deliveries/${orderId}/accept`);
      await fetchDeliveries();
    } catch (err) {
      alert('Erro ao aceitar entrega');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAdvanceStep = async (orderId: string, nextStatus: string) => {
    setActionLoading(true);
    try {
      // Obter geolocalização se o navegador suportar
      let coords = { latitude: -23.55, longitude: -46.63 };
      if (navigator.geolocation) {
        try {
          const pos: any = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 3000 }));
          coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        } catch (e) {}
      }

      await api.post(`/driver/deliveries/${orderId}/step`, {
        nextStatus,
        latitude: coords.latitude,
        longitude: coords.longitude,
      });

      await fetchDeliveries();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Erro ao atualizar passo da entrega');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReportIssue = async () => {
    if (!activeDelivery?.order?.id) return;
    setActionLoading(true);
    try {
      await api.post(`/driver/deliveries/${activeDelivery.order.id}/issue`, {
        problemCode,
        observation: issueObs,
      });
      setShowIssueModal(false);
      alert('Ocorrência registrada e notificada com sucesso!');
      fetchDeliveries();
    } catch (err) {
      alert('Erro ao registrar ocorrência');
    } finally {
      setActionLoading(false);
    }
  };

  const order = activeDelivery?.order;
  const assignmentStatus = activeDelivery?.status;
  const internalStatus = order?.internal_status;

  return (
    <div className="min-h-screen bg-gray-950 text-white max-w-md mx-auto border-x border-gray-800 flex flex-col font-sans pb-20">
      {/* Header Mobile do Entregador */}
      <header className="p-4 bg-gray-900 border-b border-gray-800 flex justify-between items-center sticky top-0 z-20">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-brand-500/20 border border-brand-500/40 text-brand-500 flex items-center justify-center font-bold">
            <Bike className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-white text-sm leading-none">{user?.name || 'Entregador'}</h1>
            <span className="text-xs text-brand-400 font-medium">DeliveryVip Driver</span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <select
            value={driverStatus}
            onChange={(e) => handleUpdateStatus(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-xs rounded-lg px-2 py-1.5 text-white font-medium focus:outline-none"
          >
            <option value="AVAILABLE">DISPONÍVEL</option>
            <option value="BUSY">OCUPADO</option>
            <option value="OFFLINE">OFFLINE</option>
          </select>

          <button onClick={logout} className="p-1.5 text-gray-400 hover:text-red-400">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-gray-800 bg-gray-900/60">
        <button
          onClick={() => setActiveTab('active')}
          className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider text-center border-b-2 transition-colors ${
            activeTab === 'active' ? 'border-brand-500 text-brand-400' : 'border-transparent text-gray-500'
          }`}
        >
          Entrega Ativa
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider text-center border-b-2 transition-colors ${
            activeTab === 'history' ? 'border-brand-500 text-brand-400' : 'border-transparent text-gray-500'
          }`}
        >
          Histórico
        </button>
      </div>

      {/* Conteúdo Principal */}
      <div className="p-4 flex-1 space-y-4">
        {activeTab === 'active' ? (
          loading ? (
            <div className="p-12 text-center text-gray-500 text-sm">Carregando entregas...</div>
          ) : !activeDelivery || !order ? (
            <div className="glass-panel p-8 text-center rounded-2xl space-y-3 my-8">
              <div className="w-16 h-16 rounded-full bg-gray-800 text-gray-500 flex items-center justify-center mx-auto">
                <Bike className="w-8 h-8" />
              </div>
              <h2 className="text-base font-bold text-white">Nenhuma entrega ativa</h2>
              <p className="text-xs text-gray-400">Fique em status "DISPONÍVEL" para receber novos pedidos atribuídos.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Card da Entrega Ativa */}
              <div className="glass-panel p-5 rounded-2xl border border-brand-500/30 space-y-4 relative">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-xs font-bold text-brand-400 uppercase tracking-wider">Pedido em Andamento</span>
                    <h2 className="text-xl font-extrabold text-white">#{order.display_id || order.deliveryvip_order_id.slice(-4)}</h2>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    R$ {order.order_amount.toFixed(2)}
                  </span>
                </div>

                {/* Dados do Cliente */}
                <div className="p-3 rounded-xl bg-gray-900/80 border border-gray-800 space-y-1">
                  <div className="text-xs text-gray-400 font-semibold uppercase flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-brand-500" /> Cliente
                  </div>
                  <div className="text-sm font-bold text-white">{order.customer?.name || 'Cliente'}</div>
                  {order.customer?.phone && (
                    <a
                      href={`tel:${order.customer.phone}`}
                      className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:underline pt-1 font-semibold"
                    >
                      <Phone className="w-3.5 h-3.5" /> Ligar para o Cliente ({order.customer.phone})
                    </a>
                  )}
                </div>

                {/* Endereço */}
                <div className="p-3 rounded-xl bg-gray-900/80 border border-gray-800 space-y-1">
                  <div className="text-xs text-gray-400 font-semibold uppercase flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-amber-500" /> Endereço de Entrega
                  </div>
                  <div className="text-xs text-gray-200 font-medium">
                    {order.address?.formatted_address || `${order.address?.street}, ${order.address?.number} - ${order.address?.district}`}
                  </div>
                  {order.address?.complement && (
                    <div className="text-xs text-gray-400">Obs: {order.address.complement}</div>
                  )}

                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      order.address?.formatted_address || `${order.address?.street}, ${order.address?.number}`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline pt-2 font-semibold"
                  >
                    <Navigation className="w-3.5 h-3.5" /> Abrir no Google Maps / Waze
                  </a>
                </div>

                {/* Resumo de Itens */}
                <div className="p-3 rounded-xl bg-gray-900/80 border border-gray-800 space-y-1">
                  <div className="text-xs text-gray-400 font-semibold uppercase flex items-center gap-1">
                    <Package className="w-3.5 h-3.5 text-purple-400" /> Itens ({order.items?.length || 0})
                  </div>
                  <div className="text-xs text-gray-300 space-y-0.5">
                    {order.items?.map((item: any) => (
                      <div key={item.id}>• {item.quantity}x {item.name}</div>
                    ))}
                  </div>
                </div>

                {/* Botões do Fluxo Guiado Passo-a-Passo (Seção 46) */}
                <div className="pt-2 space-y-2">
                  {assignmentStatus === 'ASSIGNED' && (
                    <button
                      onClick={() => handleAcceptDelivery(order.id)}
                      disabled={actionLoading}
                      className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/25 flex items-center justify-center space-x-2 text-sm"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                      <span>ACEITAR PEDIDO DE ENTREGA</span>
                    </button>
                  )}

                  {assignmentStatus === 'ACCEPTED' && internalStatus === 'DELIVERY_PERSON_ASSIGNED' && (
                    <button
                      onClick={() => handleAdvanceStep(order.id, 'GOING_TO_MERCHANT')}
                      disabled={actionLoading}
                      className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl shadow-lg flex items-center justify-center space-x-2 text-sm"
                    >
                      <Navigation className="w-5 h-5" />
                      <span>IR PARA O ESTABELECIMENTO</span>
                    </button>
                  )}

                  {internalStatus === 'GOING_TO_MERCHANT' && (
                    <button
                      onClick={() => handleAdvanceStep(order.id, 'ARRIVED_AT_MERCHANT')}
                      disabled={actionLoading}
                      className="w-full py-3.5 bg-gradient-to-r from-amber-600 to-orange-600 text-white font-bold rounded-xl shadow-lg flex items-center justify-center space-x-2 text-sm"
                    >
                      <MapPin className="w-5 h-5" />
                      <span>CHEGUEI NO ESTABELECIMENTO</span>
                    </button>
                  )}

                  {internalStatus === 'ARRIVED_AT_MERCHANT' && (
                    <button
                      onClick={() => handleAdvanceStep(order.id, 'ORDER_PICKED_UP')}
                      disabled={actionLoading}
                      className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold rounded-xl shadow-lg flex items-center justify-center space-x-2 text-sm"
                    >
                      <Package className="w-5 h-5" />
                      <span>PEDIDO RETIRADO</span>
                    </button>
                  )}

                  {(internalStatus === 'ORDER_PICKED_UP' || internalStatus === 'GOING_TO_CUSTOMER') && (
                    <button
                      onClick={() => handleAdvanceStep(order.id, 'ARRIVED_AT_CUSTOMER')}
                      disabled={actionLoading}
                      className="w-full py-3.5 bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold rounded-xl shadow-lg flex items-center justify-center space-x-2 text-sm"
                    >
                      <MapPin className="w-5 h-5" />
                      <span>CHEGUEI NO CLIENTE</span>
                    </button>
                  )}

                  {internalStatus === 'ARRIVED_AT_CUSTOMER' && (
                    <button
                      onClick={() => handleAdvanceStep(order.id, 'DELIVERED')}
                      disabled={actionLoading}
                      className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-green-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/30 flex items-center justify-center space-x-2 text-sm animate-soft-pulse"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                      <span>CONFIRMAR ENTREGA CONCLUÍDA</span>
                    </button>
                  )}

                  <button
                    onClick={() => setShowIssueModal(true)}
                    className="w-full py-2.5 bg-gray-900 border border-red-500/40 text-red-400 font-semibold rounded-xl text-xs flex items-center justify-center space-x-2"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    <span>REPORTAR OCORRÊNCIA / PROBLEMA</span>
                  </button>
                </div>
              </div>
            </div>
          )
        ) : (
          /* Histórico */
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Histórico de Entregas</h2>
            {history.length === 0 ? (
              <div className="text-center py-8 text-xs text-gray-500">Nenhuma entrega concluída no histórico.</div>
            ) : (
              history.map((h: any) => (
                <div key={h.id} className="p-3 rounded-xl glass-panel border border-gray-800 flex justify-between items-center text-xs">
                  <div>
                    <div className="font-bold text-white">Pedido #{h.order?.display_id || h.order?.deliveryvip_order_id.slice(-4)}</div>
                    <div className="text-gray-400">{h.order?.customer?.name}</div>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold">
                    {h.status}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Modal de Ocorrência na Entrega (Seção 34 & 45) */}
      {showIssueModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-sm rounded-2xl border border-gray-800 p-5 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-red-500" />
              Reportar Ocorrência na Entrega
            </h3>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">Selecione o Motivo</label>
              <select
                value={problemCode}
                onChange={(e) => setProblemCode(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
              >
                <option value="NOBODY_TO_RECEIVE">Ninguém no local para receber</option>
                <option value="CUSTOMER_ADDRESS_UNKNOWN">Endereço do cliente não localizado</option>
                <option value="PAYMENT_PROBLEMS">Problema no pagamento / troco</option>
                <option value="CUSTOMER_DID_NOT_PLACE_ORDER">Cliente informou que não fez o pedido</option>
                <option value="ORDER_DAMAGED_OR_VIOLATED">Pedido avariado durante o transporte</option>
                <option value="DELIVERYPERSON_OCCURRENCE">Ocorrência com o entregador</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">Observações Adicionais</label>
              <textarea
                value={issueObs}
                onChange={(e) => setIssueObs(e.target.value)}
                placeholder="Descreva detalhes da ocorrência..."
                className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-xs text-white h-20 focus:outline-none"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowIssueModal(false)}
                className="px-3 py-2 bg-gray-800 text-gray-300 text-xs font-medium rounded-xl"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleReportIssue}
                disabled={actionLoading}
                className="px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-xl"
              >
                {actionLoading ? 'Enviando...' : 'Notificar DeliveryVip'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
