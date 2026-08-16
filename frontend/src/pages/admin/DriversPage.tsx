import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { DeliveryPerson } from '../../types';
import { Bike, Plus, UserCheck, Shield, Phone, CreditCard, RefreshCw, X } from 'lucide-react';

export const DriversPage: React.FC = () => {
  const [drivers, setDrivers] = useState<DeliveryPerson[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showModal, setShowModal] = useState<boolean>(false);

  // Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [document, setDocument] = useState('');
  const [vehicleType, setVehicleType] = useState('MOTORBIKE_BAG');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchDrivers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/delivery-persons');
      if (res.data.success) {
        setDrivers(res.data.data);
      }
    } catch (err) {
      console.error('Erro ao carregar entregadores', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDrivers();
  }, []);

  const handleCreateDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await api.post('/delivery-persons', {
        name,
        phone,
        document,
        vehicle_type: vehicleType,
        vehicle_plate: vehiclePlate,
        email,
        password,
      });

      if (res.data.success) {
        setShowModal(false);
        resetForm();
        fetchDrivers();
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.response?.data?.error || 'Erro ao cadastrar entregador');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setName('');
    setPhone('');
    setDocument('');
    setVehiclePlate('');
    setEmail('');
    setPassword('');
    setError(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Gestão de Entregadores</h1>
          <p className="text-gray-400 text-sm">Cadastre e acompanhe o status da frota de entregadores em tempo real</p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchDrivers}
            className="p-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl border border-gray-700 transition-colors flex items-center gap-2 text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Atualizar</span>
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="py-2.5 px-4 bg-gradient-to-r from-brand-600 to-amber-600 hover:from-brand-500 hover:to-amber-500 text-white font-semibold rounded-xl shadow-lg shadow-brand-500/20 flex items-center space-x-2 transition-all text-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Entregador</span>
          </button>
        </div>
      </div>

      {/* Grid de Entregadores */}
      {loading ? (
        <div className="p-12 text-center text-gray-400">Carregando entregadores...</div>
      ) : drivers.length === 0 ? (
        <div className="glass-panel p-12 text-center text-gray-500 rounded-2xl">
          Nenhum entregador cadastrado ainda. Clique em "Novo Entregador" para adicionar.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {drivers.map((driver) => (
            <div key={driver.id} className="glass-panel p-6 rounded-2xl border border-gray-800 space-y-4 relative overflow-hidden">
              <div className="flex justify-between items-start">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center font-bold text-lg">
                    <Bike className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">{driver.name}</h3>
                    <p className="text-xs text-gray-400">{driver.vehicle_type} {driver.vehicle_plate ? `• ${driver.vehicle_plate}` : ''}</p>
                  </div>
                </div>

                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getDriverStatusBadge(driver.status)}`}>
                  {driver.status}
                </span>
              </div>

              <div className="space-y-2 pt-2 border-t border-gray-800/80 text-xs text-gray-300">
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-gray-500" />
                  <span>{driver.phone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <CreditCard className="w-3.5 h-3.5 text-gray-500" />
                  <span>CPF: {driver.document}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Cadastro de Entregador */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
          <div className="glass-panel w-full max-w-lg rounded-2xl border border-gray-800 shadow-2xl p-6 my-8">
            <div className="flex justify-between items-center pb-4 border-b border-gray-800">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Bike className="w-5 h-5 text-brand-500" />
                Cadastrar Novo Entregador
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleCreateDriver} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase mb-1">Nome Completo</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Ex: João da Silva"
                  className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase mb-1">Telefone</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    placeholder="(11) 99999-8888"
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase mb-1">CPF / Documento</label>
                  <input
                    type="text"
                    value={document}
                    onChange={(e) => setDocument(e.target.value)}
                    required
                    placeholder="123.456.789-00"
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase mb-1">Tipo de Veículo</label>
                  <select
                    value={vehicleType}
                    onChange={(e) => setVehicleType(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="MOTORBIKE_BAG">Moto (Bag)</option>
                    <option value="MOTORBIKE_BOX">Moto (Baú)</option>
                    <option value="CAR">Carro</option>
                    <option value="BICYCLE">Bicicleta</option>
                    <option value="SCOOTER">Patinete/Scooter</option>
                    <option value="VUC">VUC</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase mb-1">Placa (Opcional)</label>
                  <input
                    type="text"
                    value={vehiclePlate}
                    onChange={(e) => setVehiclePlate(e.target.value)}
                    placeholder="ABC-1234"
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-gray-800">
                <p className="text-xs text-brand-400 font-semibold mb-2">Credenciais de Acesso ao App Mobile:</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase mb-1">E-mail para Login</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="entregador@email.com"
                      className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase mb-1">Senha Inicial</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="••••••••"
                      className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 bg-gray-800 text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 bg-gradient-to-r from-brand-600 to-amber-600 text-white rounded-xl text-sm font-semibold shadow-lg shadow-brand-500/20"
                >
                  {submitting ? 'Salvando...' : 'Cadastrar Entregador'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

function getDriverStatusBadge(status: string): string {
  switch (status) {
    case 'AVAILABLE':
      return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
    case 'BUSY':
      return 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
    case 'OFFLINE':
      return 'bg-gray-800 text-gray-400 border border-gray-700';
    default:
      return 'bg-red-500/20 text-red-400';
  }
}
