import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ShoppingBag, Bike, Settings, ShieldAlert, Smartphone } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Sidebar: React.FC = () => {
  const { user } = useAuth();

  const links = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/orders', label: 'Pedidos', icon: ShoppingBag },
    { to: '/drivers', label: 'Entregadores', icon: Bike },
    { to: '/settings', label: 'Configurações', icon: Settings },
  ];

  if (user?.role === 'DELIVERY_PERSON') {
    return null; // O entregador possui interface própria dedicada
  }

  return (
    <aside className="w-64 glass-panel border-r border-gray-800 flex flex-col justify-between py-6 px-4 hidden md:flex min-h-[calc(100vh-4rem)]">
      <div className="space-y-2">
        <div className="px-3 pb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Painel Principal
        </div>
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `flex items-center space-x-3 px-4 py-3 rounded-xl font-medium transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-brand-600 to-amber-600 text-white shadow-lg shadow-brand-500/20'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
                }`
              }
            >
              <Icon className="w-5 h-5" />
              <span>{link.label}</span>
            </NavLink>
          );
        })}
      </div>

      <div className="pt-4 border-t border-gray-800 space-y-2">
        <div className="px-3 pb-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Interface Mobile
        </div>
        <NavLink
          to="/driver-app"
          className="flex items-center space-x-3 px-4 py-2.5 rounded-xl font-medium text-amber-400 hover:bg-amber-500/10 border border-amber-500/20 transition-all text-sm"
        >
          <Smartphone className="w-4 h-4" />
          <span>App Entregador</span>
        </NavLink>
      </div>
    </aside>
  );
};
