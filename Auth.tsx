import React, { useState } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail
} from 'firebase/auth';
import {
  doc,
  setDoc,
  getDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  increment,
  serverTimestamp
} from 'firebase/firestore';
import { auth, db } from '@/src/lib/firebase';
import { getIPAddress, generateDeviceId } from '@/src/lib/utils';
import { AlertTriangle } from 'lucide-react';

export const Auth: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // ================= LOGIN =================
      if (isLogin) {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        const userDoc = await getDoc(doc(db, 'users', user.uid));

        if (userDoc.exists()) {
          const userData = userDoc.data();

          if (userData?.isBlocked === true) {
            await auth.signOut();
            throw new Error('আপনার একাউন্ট টি ব্লক করা হয়েছে। দয়া করে কাস্টমার সার্ভিস এ যোগাযোগ করুন');
          }
        }
      }

      // ================= SIGNUP =================
      else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        await updateProfile(user, { displayName: name });

        const ip = await getIPAddress();
        const deviceId = generateDeviceId();

        const newReferralCode =
          Math.random().toString(36).substring(2, 8).toUpperCase() +
          Date.now().toString(36).substring(4, 8).toUpperCase();

        const userData = {
          uid: user.uid,
          name,
          email,
          balance: 50,
          referralCode: newReferralCode,
          referredBy: referralCode || null,
          dailyAdCount: 0,
          lastAdWatchDate: new Date().toISOString().split('T')[0],
          deviceId,
          ip,

          // 🔐 Block System
          isBlocked: false,
          blockType: null,
          blockReason: null,
          blockedAt: null,
          blockedBy: null,

          // 💰 Earnings
          totalEarned: 50,
          totalWithdrawn: 0,
          totalReferrals: 0,
          referralEarnings: 0,
          completedTasks: 0,
          incompleteTasks: 0,

          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        await setDoc(doc(db, 'users', user.uid), userData);

        // ================= Welcome Notification =================
        await addDoc(collection(db, 'notifications'), {
          userId: user.uid,
          title: 'Welcome!',
          message: 'Welcome to Best Earning App! Start completing tasks to earn money.',
          type: 'info',
          read: false,
          createdAt: serverTimestamp()
        });

        // ================= Referral Logic =================
        if (referralCode) {
          const q = query(
            collection(db, 'users'),
            where('referralCode', '==', referralCode)
          );

          const querySnapshot = await getDocs(q);

          if (!querySnapshot.empty) {
            const referrerDoc = querySnapshot.docs[0];

            await updateDoc(doc(db, 'users', referrerDoc.id), {
              totalReferrals: increment(1),
              referralEarnings: increment(50),
              balance: increment(50),
              updatedAt: serverTimestamp()
            });

            await addDoc(collection(db, 'notifications'), {
              userId: referrerDoc.id,
              title: 'New Referral!',
              message: `${name} joined using your referral code. You earned 50 coins!`,
              type: 'success',
              read: false,
              createdAt: serverTimestamp()
            });
          }
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Please enter your email first');
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      setError('Password reset email sent!');
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen p-6 flex flex-col justify-center relative">
      {error && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-gray-900 border border-red-500/50 rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Account Status</h3>
            <p className="text-gray-300 mb-6">{error}</p>
            <button
              onClick={() => setError('')}
              className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-xl w-full"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <h1 className="text-3xl font-bold text-center mb-2 text-accent">
        Best Earning App
      </h1>

      <form onSubmit={handleAuth} className="space-y-4">
        {!isLogin && (
          <input
            type="text"
            placeholder="Full Name"
            className="input-field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        )}

        <input
          type="email"
          placeholder="Email"
          className="input-field"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <input
          type="password"
          placeholder="Password"
          className="input-field"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {!isLogin && (
          <input
            type="text"
            placeholder="Referral Code (Optional)"
            className="input-field"
            value={referralCode}
            onChange={(e) => setReferralCode(e.target.value)}
          />
        )}

        <button type="submit" className="btn-accent w-full" disabled={loading}>
          {loading ? 'Processing...' : isLogin ? 'Login' : 'Sign Up'}
        </button>
      </form>

      <div className="mt-6 text-center space-y-2">
        <p className="text-gray-400">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="font-semibold text-accent"
          >
            {isLogin ? 'Sign Up' : 'Login'}
          </button>
        </p>

        {isLogin && (
          <button onClick={handleForgotPassword} className="text-sm text-accent">
            Forgot Password?
          </button>
        )}
      </div>
    </div>
  );
};
