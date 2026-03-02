import React from 'react';
import { ShieldAlert, Lock } from 'lucide-react';

interface SecurityOverlayProps {
  message: string;
  isBlocking?: boolean;
  onReload?: () => void;
}

export const SecurityOverlay: React.FC<SecurityOverlayProps> = ({ message, isBlocking = false, onReload }) => {
  return (
    <div className="fixed inset-0 bg-black/95 z-[9999] flex items-center justify-center p-6 backdrop-blur-xl">
      <div className="bg-gray-900 border border-red-500/50 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl animate-in fade-in zoom-in duration-300">
        <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
          {isBlocking ? <Lock className="w-10 h-10 text-red-500" /> : <ShieldAlert className="w-10 h-10 text-red-500" />}
        </div>
        <h2 className="text-2xl font-bold text-white mb-4">Security Alert</h2>
        <p className="text-gray-300 mb-8 text-lg leading-relaxed">{message}</p>
        
        {isBlocking ? (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
            <p className="text-red-400 text-sm font-medium">Your account has been flagged for suspicious activity.</p>
          </div>
        ) : (
          <button 
            onClick={onReload || (() => window.location.reload())}
            className="bg-red-500 hover:bg-red-600 text-white px-8 py-3 rounded-xl font-bold transition-all transform hover:scale-105 shadow-lg shadow-red-500/25"
          >
            I Fixed It, Reload App
          </button>
        )}
      </div>
    </div>
  );
};
