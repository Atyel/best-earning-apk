import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/src/lib/firebase';
import { UserData, AppSettings } from '@/src/types';
import { generateDeviceId, getIPAddress } from '@/src/lib/utils';

interface AuthContextType {
  user: User | null;
  userData: UserData | null;
  settings: AppSettings;
  loading: boolean;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [settings, setSettings] = useState<AppSettings>({
    minWithdrawal: 5000,
    dailyAdLimit: 15,
    referralBonus: 50,
    coinRate: 0.01
  });
  const [loading, setLoading] = useState(true);

  const refreshUserData = async () => {
    if (user) {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        setUserData(userDoc.data() as UserData);
      }
    }
  };

  useEffect(() => {
    let unsubUser: (() => void) | null = null;

    // Load settings
    const unsubSettings = onSnapshot(doc(db, 'settings', 'app'), (doc) => {
      if (doc.exists()) {
        setSettings(prev => ({ ...prev, ...doc.data() as AppSettings }));
      }
    }, (error) => {
      if (error.code !== 'permission-denied') {
        console.error("Settings listener error:", error);
      }
    });

    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      // Always unsubscribe previous user listener if it exists
      if (unsubUser) {
        unsubUser();
        unsubUser = null;
      }

      setUser(firebaseUser);
      if (firebaseUser) {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const currentDeviceId = generateDeviceId();
        
        try {
          // 1. Initial Load / Create User
          const snapshot = await getDoc(userRef);
          if (snapshot.exists()) {
            const data = snapshot.data() as UserData;
            setUserData(data);
            // Update device ID if needed
            if (data.deviceId !== currentDeviceId) {
              await updateDoc(userRef, { deviceId: currentDeviceId });
            }
          } else {
            // Create new user logic
            const ip = await getIPAddress();
            const referralCode = Math.random().toString(36).substring(2, 8).toUpperCase() + Date.now().toString(36).substring(4, 8).toUpperCase();
            
            const newUserData: UserData = {
              uid: firebaseUser.uid,
              name: firebaseUser.displayName || 'User',
              email: firebaseUser.email || '',
              balance: 50,
              referralCode,
              referredBy: null,
              dailyAdCount: 0,
              lastAdWatchDate: new Date().toISOString().split('T')[0],
              deviceId: currentDeviceId,
              ip,
              createdAt: new Date().toISOString(),
              totalEarned: 50,
              totalWithdrawn: 0,
              totalReferrals: 0,
              referralEarnings: 0,
              completedTasks: 0,
              incompleteTasks: 0,
              blocked: false
            };
            await setDoc(userRef, newUserData);
            setUserData(newUserData);
          }
          // 2. Start Listener for updates (including multi-device detection)
          unsubUser = onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data() as UserData;
              
              // Multi-device detection: if deviceId changes to something else, logout
              if (data.deviceId && data.deviceId !== currentDeviceId) {
                console.warn("Multi-device login detected. Logging out.");
                auth.signOut().then(() => {
                  localStorage.setItem('blockMessage', 'আপনার একাউন্টটি অন্য একটি ডিভাইসে লগইন করা হয়েছে।');
                  window.location.reload();
                });
                return;
              }
              
              console.log("User data updated from snapshot. Balance:", data.balance);
              setUserData(data);
              setLoading(false); // Only stop loading once we have data from the listener
            }
          }, (error) => {
            console.error("User data listener error:", error);
            setLoading(false); // Fallback to prevent infinite loading
          });
          
        } catch (err) {
          console.error("Auth initialization error:", err);
          setLoading(false);
        }
      } else {
        setUserData(null);
        setLoading(false);
      }
    });

    return () => {
      unsubAuth();
      unsubSettings();
      if (unsubUser) unsubUser();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, userData, settings, loading, refreshUserData }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
