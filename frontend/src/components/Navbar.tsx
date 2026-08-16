import React from 'react';
import { useAuth } from '../context/AuthContext';
import { LogOut, User as UserIcon, Store, Shield } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <header className="h-16 glass-panel border-b border-gray-800 px-6 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center space-x-3">
        <div className="bg-gradient-to-tr from-brand-600 to-amber-500 p-2 rounded-xl text-white font-bold tracking-wider text-xl shadow-lg shadow-brand-500/20 flex items-center gap-2">
          <Store className="w-6 h-6" />
          <span>DeliveryVip<span className="text-amber-300 font-light">Manager</span></span>
        </div>
        {user?.merchantName && (
          <span className="hidden md:inline-flex items-center gap-1 text-xs px-3 py-1 bg-gray-800 text-gray-300 rounded-full border border-gray-700">
            <Store className="w-3.5 h-3.5 text-brand-500" />
            {user.merchantName}
          </span>
        )}
      </div>

      <div className="flex items-center space-x-4">
        {user && (
          <div className="flex items-center space-x-3">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium text-gray-200">{user.name}</div>
              <div className="text-xs text-gray-400 flex items-center justify-end gap-1">
                <Shield className="w-3 h-3 text-amber-400" />
                {user.role}
              </div>
            </div>
            <div className="w-9 h-9 rounded-full bg-brand-500/20 border border-brand-500/40 text-brand-500 flex items-center justify-center font-bold">
              <UserIcon className="w-5 h-5" />
            </div>
            <button
              onClick={logout}
              className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors"
              title="Sair do sistema"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
