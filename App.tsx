import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Auth } from './components/Auth';
import { MainApp } from './components/MainApp';
import { SecurityOverlay } from './components/SecurityOverlay';
import { detectAdBlock, detectVPN, generateDeviceId } from './lib/utils';
import { securityMonitor } from './lib/security';
import { doc, updateDoc, collection, query, where, getDocs, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './lib/firebase';

const AppContent: React.FC = () => {
  const { user, loading, userData } = useAuth();
  const [securityViolation, setSecurityViolation] = useState<string | null>(null);
  const [isBlocking, setIsBlocking] = useState(false);

  // Global Security Checks
  useEffect(() => {
    const checkSecurity = async () => {
      // 1. AdBlock Detection (Runs for everyone)
      const isAdBlock = await detectAdBlock();
      if (isAdBlock) {
        setSecurityViolation('অ্যাড ব্লকার ডিটেক্ট হয়েছে! দয়া করে এটি বন্ধ করে অ্যাপটি রিলোড দিন।');
        // Only log if user is logged in, otherwise just block
        if (user) await securityMonitor.logEvent('suspicious_activity', 'Ad Blocker detected');
        return;
      }

      // 2. VPN Detection (Runs for everyone)
      const isVPN = await detectVPN();
      if (isVPN) {
        setSecurityViolation('VPN বা প্রক্সি ডিটেক্ট হয়েছে! দয়া করে VPN বন্ধ করে অ্যাপটি ব্যবহার করুন।');
        if (user) await securityMonitor.logEvent('suspicious_activity', 'VPN detected');
        return;
      }

      // 3. Multi-Account / Device Check (Only for logged-in users)
      if (user && userData) {
        // The multi-device logout logic is now handled in AuthContext.tsx
        // using the 'users' collection which has proper permissions.
      }

      // If all checks pass
      setSecurityViolation(null);
    };

    // Run checks immediately and then every 30 seconds
    checkSecurity();
    const interval = setInterval(checkSecurity, 30000);
    
    return () => clearInterval(interval);
  }, [user, userData]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent"></div>
      </div>
    );
  }

  return (
    <div className="relative">
      {securityViolation && (
        <SecurityOverlay 
          message={securityViolation} 
          isBlocking={isBlocking} 
          onReload={() => window.location.reload()} 
        />
      )}
      
      {!user ? <Auth /> : <MainApp />}
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
