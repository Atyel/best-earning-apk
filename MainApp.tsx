import React, { useState, useEffect, useRef } from 'react';
import { Bell, User as UserIcon, Home as HomeIcon, Wallet, Users, Copy, ExternalLink, Play, Gamepad2, Timer, CheckCircle, AlertTriangle, ListFilter, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '@/src/context/AuthContext';
import { doc, updateDoc, increment, addDoc, collection, query, where, orderBy, limit, getDocs, onSnapshot, getDoc } from 'firebase/firestore';
import { db, auth } from '@/src/lib/firebase';
import { Task, WithdrawalRequest, Notification, UserData } from '@/src/types';
import { NotificationList } from './NotificationList';
import { securityMonitor } from '@/src/lib/security';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const MainApp: React.FC = () => {
  const { userData, settings, user, refreshUserData } = useAuth();
  const [activePage, setActivePage] = useState('home');
  const [currentTask, setCurrentTask] = useState<Task | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [showPopup, setShowPopup] = useState(false);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawMethod, setWithdrawMethod] = useState('Bkash');
  const [withdrawNumber, setWithdrawNumber] = useState('');
  
  // Notification State
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // Withdrawal Filtering State
  const [filterType, setFilterType] = useState<'all' | 'today' | 'yesterday' | '7days' | 'custom'>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs: Notification[] = [];
      snapshot.forEach((doc) => {
        notifs.push({ id: doc.id, ...doc.data() } as Notification);
      });
      setNotifications(notifs);
    }, (error) => {
      if (error.code !== 'permission-denied') {
        console.error("Notifications listener error:", error);
      }
    });

    return () => unsubscribe();
  }, [user]);

  // Real-time Withdrawals Listener
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'withdrawals'),
      where('userId', '==', user.uid),
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const withdraws: WithdrawalRequest[] = [];
      snapshot.forEach((doc) => {
        withdraws.push({ id: doc.id, ...doc.data() } as WithdrawalRequest);
      });
      setWithdrawals(withdraws);
    }, (error) => {
      if (error.code !== 'permission-denied') {
        console.error("Withdrawals listener error:", error);
      }
    });

    return () => unsubscribe();
  }, [user]);

  const unreadCount = notifications.filter(n => !n.read).length;
  
  const [internalBrowserUrl, setInternalBrowserUrl] = useState<string | null>(null);
  
  // Multi-tab Browser State
  const [browserTabs, setBrowserTabs] = useState<{id: number, url: string, title: string}[]>([]);
  const [activeTabId, setActiveTabId] = useState<number>(0);

  // Refs for timer management
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const taskStartTimeRef = useRef<number>(0);
  const isTaskActiveRef = useRef<boolean>(false);
  const timeLeftRef = useRef<number>(0);

  // Window size state for dynamic full-screen
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Custom Alert State
  const [alertConfig, setAlertConfig] = useState<{show: boolean, type: 'success' | 'error', title: string, message: string}>({
    show: false, type: 'success', title: '', message: ''
  });

  const showCustomAlert = (type: 'success' | 'error', title: string, message: string) => {
    setAlertConfig({ show: true, type, title, message });
  };

  // Initialize security monitor
  useEffect(() => {
    if (user) {
      securityMonitor.setUserId(user.uid);
    }
  }, [user]);

  // Handle App Visibility (Pause/Resume Timer)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // App went to background - pause timer
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        // Save state immediately when backgrounded
        if (currentTask) {
          localStorage.setItem('activeTask', JSON.stringify({
            task: currentTask,
            timeLeft: timeLeftRef.current,
            tabs: browserTabs,
            activeTab: activeTabId,
            url: internalBrowserUrl,
            timestamp: Date.now()
          }));
        }
        securityMonitor.logEvent('app_background', 'Timer paused due to background');
      } else {
        // App returned to foreground - resume timer if task is active
        if (isTaskActiveRef.current && timeLeftRef.current > 0 && !timerRef.current) {
          timerRef.current = setInterval(() => {
            timeLeftRef.current -= 1;
            setTimeLeft(timeLeftRef.current);
            
            if (timeLeftRef.current <= 0) {
              if (timerRef.current) clearInterval(timerRef.current);
            }
          }, 1000);
          securityMonitor.logEvent('app_foreground', 'Timer resumed');
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [currentTask, browserTabs, activeTabId, internalBrowserUrl]);

  // Restore task state on mount
  useEffect(() => {
    const saved = localStorage.getItem('activeTask');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        // Check if valid (less than 15 mins old)
        if (Date.now() - data.timestamp < 15 * 60 * 1000) {
          setCurrentTask(data.task);
          setTimeLeft(data.timeLeft);
          timeLeftRef.current = data.timeLeft;
          setBrowserTabs(data.tabs || []);
          setActiveTabId(data.activeTab || 0);
          setInternalBrowserUrl(data.url);
          
          // Resume timer
          isTaskActiveRef.current = true;
          if (data.timeLeft > 0) {
            timerRef.current = setInterval(() => {
              timeLeftRef.current -= 1;
              setTimeLeft(timeLeftRef.current);
              
              if (timeLeftRef.current <= 0) {
                if (timerRef.current) clearInterval(timerRef.current);
              }
            }, 1000);
          }
        } else {
          localStorage.removeItem('activeTask');
        }
      } catch (e) {
        console.error("Failed to restore task state", e);
        localStorage.removeItem('activeTask');
      }
    }
  }, []);

  // Persist state on changes
  useEffect(() => {
    if (currentTask && isTaskActiveRef.current) {
      localStorage.setItem('activeTask', JSON.stringify({
        task: currentTask,
        timeLeft: timeLeftRef.current,
        tabs: browserTabs,
        activeTab: activeTabId,
        url: internalBrowserUrl,
        timestamp: Date.now()
      }));
    } else if (!currentTask) {
      localStorage.removeItem('activeTask');
    }
  }, [currentTask, timeLeft, browserTabs, activeTabId, internalBrowserUrl]);

  // Effect to handle blocked user logout
  useEffect(() => {
    if (userData?.blocked) {
      auth.signOut();
      alert('আপনার অ্যাকাউন্টটি ব্লক করা হয়েছে।');
    }
  }, [userData?.blocked]);

  useEffect(() => {
    // Withdrawal history is now real-time via onSnapshot
  }, [activePage, user]);

  const getFilteredWithdrawals = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - (24 * 60 * 60 * 1000);
    const last7Days = today - (7 * 24 * 60 * 60 * 1000);

    return withdrawals.filter(w => {
      const wDate = new Date(w.timestamp).getTime();
      
      if (filterType === 'today') return wDate >= today;
      if (filterType === 'yesterday') return wDate >= yesterday && wDate < today;
      if (filterType === '7days') return wDate >= last7Days;
      if (filterType === 'custom') {
        const start = fromDate ? new Date(fromDate).getTime() : 0;
        const end = toDate ? new Date(toDate).getTime() + (24 * 60 * 60 * 1000) : Infinity;
        return wDate >= start && wDate <= end;
      }
      return true;
    });
  };

  const filteredWithdrawals = getFilteredWithdrawals();

  const handleTaskClick = (type: Task['type'], waitSeconds: number, coins: number, url?: string) => {
    if (userData?.blocked) return;
    
    const today = new Date().toISOString().split('T')[0];
    const dailyCount = userData?.lastAdWatchDate === today ? (userData?.dailyAdCount || 0) : 0;
    
    if (dailyCount >= settings.dailyAdLimit) {
      showCustomAlert('error', 'Limit Reached', 'Daily limit reached!');
      return;
    }

    const task: Task = {
      id: Date.now().toString(),
      type,
      waitSeconds,
      coins,
      url,
      startTime: Date.now(),
      completed: false
    };

    setCurrentTask(task);
    setShowPopup(true);
    setTimeLeft(waitSeconds);

    // Show popup for 3 seconds then start task
    setTimeout(() => {
      setShowPopup(false);
      startTask(task);
    }, 3000);
  };

  const startTask = async (task: Task) => {
    if (task.url) {
      setInternalBrowserUrl(task.url);
      setBrowserTabs([{ id: 1, url: task.url, title: 'Task' }]);
      setActiveTabId(1);
    }
    
    isTaskActiveRef.current = true;
    taskStartTimeRef.current = Date.now();
    
    await securityMonitor.logEvent('task_start', `Started ${task.type} task`, { taskId: task.id, url: task.url });
    
    // Start countdown
    timeLeftRef.current = task.waitSeconds;
    setTimeLeft(timeLeftRef.current);
    
    if (timerRef.current) clearInterval(timerRef.current);
    
    timerRef.current = setInterval(() => {
      timeLeftRef.current -= 1;
      setTimeLeft(timeLeftRef.current);
      
      if (timeLeftRef.current <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        // Task timer finished
      }
    }, 1000);
  };

  const addNewTab = () => {
    const newId = browserTabs.length > 0 ? Math.max(...browserTabs.map(t => t.id)) + 1 : 1;
    setBrowserTabs([...browserTabs, { id: newId, url: 'https://www.google.com', title: 'New Tab' }]);
    setActiveTabId(newId);
  };

  const closeTab = (id: number) => {
    const newTabs = browserTabs.filter(t => t.id !== id);
    if (newTabs.length === 0) {
      // If closing last tab, warn user
      if (timeLeft > 0) {
        if (window.confirm("Closing all tabs will exit the task. Continue?")) {
          handleTaskIncomplete('User closed all tabs');
        }
        return;
      } else {
        // If task done, just close browser
        if (currentTask) completeTask(currentTask);
        return;
      }
    }
    setBrowserTabs(newTabs);
    if (activeTabId === id) {
      setActiveTabId(newTabs[newTabs.length - 1].id);
    }
  };

  const handleBrowserClose = () => {
    if (!currentTask) return;

    if (timeLeft > 0) {
      // User closed browser before time up
      handleTaskIncomplete('User closed browser early');
    } else {
      // Time is up, task successful
      completeTask(currentTask);
    }
  };

  const handleTaskIncomplete = async (reason: string = 'Unknown') => {
    if (timerRef.current) clearInterval(timerRef.current);
    isTaskActiveRef.current = false;
    
    // Track incomplete task in database
    if (user && currentTask) {
      try {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          incompleteTasks: increment(1)
        });
        
        await securityMonitor.logEvent('task_fail', reason, { 
          taskId: currentTask.id, 
          timeLeft,
          requiredTime: currentTask.waitSeconds 
        });
      } catch (e) {
        console.error("Error tracking incomplete task:", e);
      }
    }

    setCurrentTask(null);
    setTimeLeft(0);
    setInternalBrowserUrl(null);
    setBrowserTabs([]); // Clear tabs
    
    // Show custom alert dialog instead of window.alert
    showCustomAlert('error', "টাস্ক অসম্পূর্ণ!", "আপনি টাস্ক অসম্পূর্ণ রেখেই চলে আসছেন, এর জন্য কোনো পেমেন্ট পাবেন না।");
  };

  const completeTask = async (task: Task) => {
    if (!user || !userData) {
      console.error("Cannot complete task: User or UserData missing", { user: !!user, userData: !!userData });
      return;
    }

    // Strict Security Check
    const isValid = securityMonitor.checkTaskValidity(taskStartTimeRef.current, task.waitSeconds);
    
    if (!isValid) {
      console.warn("Task validation failed", { 
        startTime: taskStartTimeRef.current, 
        required: task.waitSeconds, 
        now: Date.now(),
        elapsed: (Date.now() - taskStartTimeRef.current) / 1000
      });
      handleTaskIncomplete('Security validation failed: Time mismatch');
      return;
    }

    isTaskActiveRef.current = false;
    setCurrentTask(null);
    setInternalBrowserUrl(null);
    setBrowserTabs([]); // Clear tabs

    const today = new Date().toISOString().split('T')[0];
    const userRef = doc(db, 'users', user.uid);

    try {
      // Fetch latest user data from server to ensure accurate daily count
      const userDoc = await getDoc(userRef);
      if (!userDoc.exists()) {
        console.error("User document does not exist during task completion");
        return;
      }
      const latestData = userDoc.data() as UserData;
      const rewardAmount = Number(task.coins);
      const currentBalance = Number(latestData.balance || 0);

      if (isNaN(rewardAmount)) {
        console.error("Invalid reward amount:", task.coins);
        return;
      }

      console.log(`Updating balance for user ${user.uid}: Current=${currentBalance}, Reward=${rewardAmount}`);

      const updatePayload: any = {
        totalEarned: increment(rewardAmount),
        completedTasks: increment(1),
        dailyAdCount: latestData.lastAdWatchDate === today ? increment(1) : 1,
        lastAdWatchDate: today,
        lastTaskTime: new Date().toISOString()
      };

      // Ensure balance is updated. If it's currently NaN or missing, set it to rewardAmount.
      // Otherwise, use increment for atomicity.
      const currentBalanceNum = Number(currentBalance);
      if (isNaN(currentBalanceNum)) {
        updatePayload.balance = rewardAmount;
      } else {
        updatePayload.balance = increment(rewardAmount);
      }

      console.log("Applying update to Firestore:", updatePayload);
      await updateDoc(userRef, updatePayload);
      
      // Force a local refresh of userData to ensure UI updates immediately
      if (refreshUserData) {
        await refreshUserData();
      }

      await securityMonitor.logEvent('task_complete', `Completed ${task.type} task`, { 
        taskId: task.id, 
        coins: rewardAmount 
      });

      showCustomAlert('success', "অভিনন্দন!", `আপনি সফল ভাবে টাস্ক টি কমপ্লিট করেছেন। ${rewardAmount} কয়েন যোগ হয়েছে।`);
    } catch (e) {
      console.error("Coin reward failed:", e);
      showCustomAlert('error', "Error", "Something went wrong while rewarding coins. Please contact support.");
    }
  };

  const handleWithdraw = async () => {
    if (!user || !userData) return;
    
    // Validation
    const amount = parseInt(withdrawAmount);
    
    if (!withdrawAmount || isNaN(amount) || amount <= 0) {
      showCustomAlert('error', 'Error', 'Please enter a valid positive amount');
      return;
    }
    if (!withdrawNumber || withdrawNumber.trim().length < 10) {
      showCustomAlert('error', 'Error', 'Please enter a valid account number');
      return;
    }
    if (amount < settings.minWithdrawal) {
      showCustomAlert('error', 'Error', `Minimum withdrawal is ${settings.minWithdrawal} coins`);
      return;
    }
    if (amount > userData.balance) {
      showCustomAlert('error', 'Error', 'Insufficient balance');
      return;
    }

    try {
      // Re-verify balance from Firestore before submitting (extra security)
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists()) return;
      const currentBalance = Number(userDoc.data().balance);
      
      if (isNaN(currentBalance) || amount > currentBalance) {
        showCustomAlert('error', 'Error', 'Insufficient balance (Refreshed)');
        return;
      }

      console.log(`Submitting withdrawal for user ${user.uid}: Amount=${amount}`);
      
      await addDoc(collection(db, 'withdrawals'), {
        userId: user.uid,
        userName: userData.name,
        userEmail: userData.email,
        amount,
        method: withdrawMethod,
        number: withdrawNumber,
        status: 'pending',
        timestamp: new Date().toISOString()
      });

      console.log(`Updating user balance: -${amount}`);
      await updateDoc(doc(db, 'users', user.uid), {
        balance: increment(-amount),
        totalWithdrawn: increment(amount)
      });

      if (refreshUserData) {
        await refreshUserData();
      }

      showCustomAlert('success', 'Success', 'Withdrawal request submitted!');
      setWithdrawAmount('');
      setWithdrawNumber('');
    } catch (e) {
      console.error(e);
      showCustomAlert('error', 'Error', 'Failed to submit withdrawal request. Please try again.');
    }
  };

  useEffect(() => {
    if (userData?.blocked) {
      localStorage.setItem('blockMessage', 'আপনার একাউন্ট টি ব্লক করা হয়েছে। দয়া করে কাস্টমার সার্ভিস এ যোগাযোগ করুন');
      auth.signOut();
    }
  }, [userData?.blocked]);

  return (
    <div className="min-h-screen flex flex-col pb-20">
      <header className="flex items-center justify-between p-4 sticky top-0 bg-dark-bg/80 backdrop-blur-md z-10">
        <h1 className="text-xl font-bold">Best Earning App</h1>
        <div className="flex items-center space-x-4">
          <div className="relative cursor-pointer" onClick={() => setShowNotifications(true)}>
            <Bell className="w-6 h-6" />
            {unreadCount > 0 && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] flex items-center justify-center text-white font-bold">
                {unreadCount > 9 ? '9+' : unreadCount}
              </div>
            )}
          </div>
          <UserIcon className="w-6 h-6 cursor-pointer" onClick={() => setActivePage('profile')} />
        </div>
      </header>

      {showNotifications && (
        <NotificationList 
          notifications={notifications} 
          onClose={() => setShowNotifications(false)} 
        />
      )}

      <main className="flex-grow p-4">
        <AnimatePresence mode="wait">
          {activePage === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/20 p-6 rounded-2xl">
                <p className="text-gray-400 text-sm">Your Balance</p>
                <div className="flex items-end justify-between mt-1">
                  <div>
                    {userData ? (
                      <>
                        <p className="text-4xl font-bold text-white">
                          {typeof userData.balance === 'number' ? userData.balance.toLocaleString() : '0'} Coins
                        </p>
                        <p className="text-accent text-sm mt-1">
                          ≈ ৳{((userData.balance || 0) * settings.coinRate).toFixed(2)}
                        </p>
                      </>
                    ) : (
                      <div className="space-y-2 animate-pulse">
                        <div className="h-8 w-32 bg-white/10 rounded-lg"></div>
                        <div className="h-4 w-20 bg-white/5 rounded-lg"></div>
                      </div>
                    )}
                  </div>
                  <button 
                    onClick={() => setActivePage('wallet')}
                    className="bg-white text-dark-bg font-bold px-4 py-2 rounded-xl text-sm"
                  >
                    Withdraw
                  </button>
                </div>
              </div>

              <section>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-bold">Daily Tasks</h2>
                  <span className="text-xs text-gray-500">
                    {settings.dailyAdLimit - (userData?.dailyAdCount || 0)} tasks left
                  </span>
                </div>

                <div className="space-y-3">
                  <TaskCard 
                    title="Watch Video Ad" 
                    reward={50} 
                    icon={<Play className="w-6 h-6" />}
                    color="bg-orange-500"
                    onClick={() => handleTaskClick('video', 5, 50)}
                  />
                  <TaskCard 
                    title="Website Visit 1" 
                    reward={50} 
                    icon={<ExternalLink className="w-6 h-6" />}
                    color="bg-blue-600"
                    onClick={() => handleTaskClick('website', 20, 50, 'https://bestearningapk11.blogspot.com')}
                  />
                  <TaskCard 
                    title="Website Visit 2" 
                    reward={50} 
                    icon={<ExternalLink className="w-6 h-6" />}
                    color="bg-blue-600"
                    onClick={() => handleTaskClick('website', 20, 50, 'https://bestearningapk1.blogspot.com')}
                  />
                  <TaskCard 
                    title="Special Task" 
                    reward={100} 
                    icon={<Gamepad2 className="w-6 h-6" />}
                    color="bg-green-600"
                    onClick={() => handleTaskClick('special', 30, 100, 'https://www.effectivegatecpm.com/mwgxympcy?key=76f87ec28dc349a0b520ca9e7b413c57')}
                  />
                </div>
              </section>
            </motion.div>
          )}

          {activePage === 'wallet' && (
            <motion.div
              key="wallet"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <h2 className="text-2xl font-bold text-center">My Wallet</h2>
              <div className="card space-y-4">
                <div>
                  <div className="flex justify-between items-center">
                    <p className="text-gray-400 text-sm">Available Balance</p>
                    <button 
                      onClick={() => refreshUserData()} 
                      className="text-accent text-xs flex items-center space-x-1 hover:underline"
                    >
                      <Timer className="w-3 h-3" />
                      <span>Refresh</span>
                    </button>
                  </div>
                  {userData ? (
                    <>
                      <p className="text-3xl font-bold text-accent">
                        {typeof userData.balance === 'number' ? userData.balance.toLocaleString() : '0'} Coins
                      </p>
                      <p className="text-sm text-gray-500">
                        ≈ ৳{((userData.balance || 0) * settings.coinRate).toFixed(2)}
                      </p>
                    </>
                  ) : (
                    <div className="space-y-2 animate-pulse py-2">
                      <div className="h-8 w-24 bg-accent/10 rounded-lg"></div>
                      <div className="h-4 w-16 bg-white/5 rounded-lg"></div>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <input 
                    type="number" 
                    placeholder="Enter amount" 
                    className="input-field"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                  />
                  <select 
                    className="input-field"
                    value={withdrawMethod}
                    onChange={(e) => setWithdrawMethod(e.target.value)}
                  >
                    <option value="Bkash">Bkash</option>
                    <option value="Nagad">Nagad</option>
                    <option value="Rocket">Rocket</option>
                  </select>
                  <input 
                    type="text" 
                    placeholder="Account Number" 
                    className="input-field"
                    value={withdrawNumber}
                    onChange={(e) => setWithdrawNumber(e.target.value)}
                  />
                  <button onClick={handleWithdraw} className="btn-accent w-full">Request Withdrawal</button>
                  <p className="text-center text-xs text-gray-500">Minimum: {settings.minWithdrawal} Coins</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold flex items-center">
                    Recent Withdrawals
                    <button 
                      onClick={() => setShowFilterPanel(!showFilterPanel)}
                      className={cn(
                        "ml-2 p-1 rounded-lg transition-colors",
                        showFilterPanel ? "bg-accent text-dark-bg" : "bg-white/5 text-gray-400 hover:text-white"
                      )}
                    >
                      <ListFilter className="w-4 h-4" />
                    </button>
                  </h3>
                </div>

                {/* Filter Buttons */}
                <div className="flex flex-wrap gap-2">
                  <FilterButton active={filterType === 'all'} onClick={() => setFilterType('all')}>All</FilterButton>
                  <FilterButton active={filterType === 'today'} onClick={() => setFilterType('today')}>Today</FilterButton>
                  <FilterButton active={filterType === 'yesterday'} onClick={() => setFilterType('yesterday')}>Yesterday</FilterButton>
                  <FilterButton active={filterType === '7days'} onClick={() => setFilterType('7days')}>Last 7 Days</FilterButton>
                  <FilterButton active={filterType === 'custom'} onClick={() => setFilterType('custom')}>Custom</FilterButton>
                </div>

                {/* Custom Date Range Panel */}
                <AnimatePresence>
                  {filterType === 'custom' && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="grid grid-cols-2 gap-3 p-3 bg-white/5 rounded-xl border border-white/10">
                        <div>
                          <label className="text-[10px] text-gray-500 uppercase block mb-1">From</label>
                          <input 
                            type="date" 
                            className="w-full bg-dark-bg border border-white/10 rounded-lg p-2 text-xs text-white"
                            value={fromDate}
                            onChange={(e) => setFromDate(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500 uppercase block mb-1">To</label>
                          <input 
                            type="date" 
                            className="w-full bg-dark-bg border border-white/10 rounded-lg p-2 text-xs text-white"
                            value={toDate}
                            onChange={(e) => setToDate(e.target.value)}
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {filteredWithdrawals.length === 0 ? (
                  <p className="text-center text-gray-500 text-sm py-8">No history found for this period</p>
                ) : (
                  filteredWithdrawals.map(w => (
                    <div key={w.id} className="card flex justify-between items-center">
                      <div>
                        <p className="font-bold">{w.amount} Coins</p>
                        <p className="text-xs text-gray-500">{w.method}: {w.number}</p>
                        <p className="text-[10px] text-gray-400 mt-1">{new Date(w.timestamp).toLocaleString()}</p>
                      </div>
                      <span className={cn(
                        "text-[10px] font-bold uppercase px-2 py-1 rounded-full border",
                        String(w.status || 'pending').trim().toLowerCase() === 'approved' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 
                        String(w.status || 'pending').trim().toLowerCase() === 'rejected' ? 'bg-red-500/10 text-red-500 border-red-500/20' : 
                        'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
                      )}>
                        {w.status || 'pending'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {activePage === 'refer' && (
            <motion.div
              key="refer"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <h2 className="text-2xl font-bold text-center">Refer & Earn</h2>
              <div className="card text-center space-y-6 py-8">
                <div>
                  <p className="text-gray-400 text-sm mb-2">Your Referral Code</p>
                  <div className="bg-dark-bg border border-accent border-dashed p-4 rounded-xl flex items-center justify-center space-x-4">
                    <span className="text-2xl font-bold tracking-widest text-accent">{userData?.referralCode}</span>
                    <button onClick={() => {
                      navigator.clipboard.writeText(userData?.referralCode || '');
                      alert('Copied!');
                    }}>
                      <Copy className="w-5 h-5 text-gray-400" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-dark-bg p-4 rounded-xl">
                    <p className="text-2xl font-bold text-accent">{userData?.totalReferrals || 0}</p>
                    <p className="text-xs text-gray-500">Total Referrals</p>
                  </div>
                  <div className="bg-dark-bg p-4 rounded-xl">
                    <p className="text-2xl font-bold text-accent">{userData?.referralEarnings || 0}</p>
                    <p className="text-xs text-gray-500">Referral Earnings</p>
                  </div>
                </div>

                <button className="btn-accent w-full">Share With Friends</button>
              </div>
            </motion.div>
          )}

          {activePage === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex flex-col items-center">
                <div className="w-20 h-20 bg-accent rounded-full flex items-center justify-center mb-4">
                  <UserIcon className="w-10 h-10 text-dark-bg" />
                </div>
                <h2 className="text-xl font-bold">{userData?.name}</h2>
                <p className="text-gray-400 text-sm">{userData?.email}</p>
                <span className="mt-2 text-xs font-bold text-green-500 uppercase tracking-widest">Active Member</span>
              </div>

              <div className="card space-y-3">
                <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">Statistics</p>
                <div className="space-y-2">
                  <StatRow label="Total Earned" value={`${userData?.totalEarned || 0} Coins`} />
                  <StatRow label="Total Withdrawn" value={`${userData?.totalWithdrawn || 0} Coins`} />
                  <StatRow label="Completed Tasks" value={userData?.completedTasks || 0} />
                  <StatRow label="Incomplete Tasks" value={userData?.incompleteTasks || 0} />
                </div>
              </div>

              <div className="card space-y-2">
                <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">Device Info</p>
                <p className="text-[10px] font-mono text-gray-500 break-all">ID: {userData?.deviceId}</p>
                <p className="text-[10px] font-mono text-gray-500">IP: {userData?.ip}</p>
              </div>

              <button 
                onClick={() => auth.signOut()}
                className="w-full py-4 rounded-xl bg-red-500/10 text-red-500 font-bold border border-red-500/20"
              >
                Logout
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 max-w-[400px] mx-auto bg-card-bg/80 backdrop-blur-md border-t border-white/5 grid grid-cols-4 py-3 px-2">
        <NavLink active={activePage === 'home'} onClick={() => setActivePage('home')} icon={<HomeIcon />} label="Home" />
        <NavLink active={activePage === 'wallet'} onClick={() => setActivePage('wallet')} icon={<Wallet />} label="Wallet" />
        <NavLink active={activePage === 'refer'} onClick={() => setActivePage('refer')} icon={<Users />} label="Refer" />
        <NavLink active={activePage === 'profile'} onClick={() => setActivePage('profile')} icon={<UserIcon />} label="Profile" />
      </nav>

      {/* Internal Browser (Full Screen) */}
      <AnimatePresence>
        {internalBrowserUrl && (
          <motion.div 
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            className="fixed inset-0 z-[150] bg-white flex flex-col"
            style={{ width: windowSize.width, height: windowSize.height }}
          >
            <div className="bg-dark-bg text-white shadow-lg shrink-0 flex flex-col">
              <div className="p-3 flex items-center justify-between border-b border-white/10">
                <div className="flex items-center space-x-3">
                  <div className="bg-accent/20 p-2 rounded-full">
                    <Timer className="w-6 h-6 text-accent" />
                  </div>
                  <div>
                    <p className="font-bold text-base">Task Timer</p>
                    <p className="text-xl font-bold text-accent">{timeLeft > 0 ? timeLeft : 'Done!'}s</p>
                  </div>
                </div>
                <button 
                  onClick={handleBrowserClose}
                  className={`px-4 py-2 rounded-lg font-bold text-base ${timeLeft > 0 ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}
                >
                  {timeLeft > 0 ? 'Exit (No Reward)' : 'Claim Reward'}
                </button>
              </div>
              
              {/* Tab Bar */}
              <div className="flex items-center bg-black/20 overflow-x-auto px-2 py-1 space-x-1 no-scrollbar">
                {browserTabs.map(tab => (
                  <div 
                    key={tab.id}
                    onClick={() => setActiveTabId(tab.id)}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-t-lg text-sm cursor-pointer min-w-[100px] max-w-[150px] border-b-2 transition-colors ${activeTabId === tab.id ? 'bg-white text-black border-accent' : 'bg-white/5 text-gray-400 border-transparent hover:bg-white/10'}`}
                  >
                    <span className="truncate flex-grow">{tab.title || 'Loading...'}</span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                      className="p-1 hover:bg-black/10 rounded-full"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button 
                  onClick={addNewTab}
                  className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg"
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex-grow w-full h-full relative bg-gray-100">
              {browserTabs.map(tab => (
                <div 
                  key={tab.id} 
                  className={`absolute inset-0 w-full h-full ${activeTabId === tab.id ? 'z-10' : 'z-0 opacity-0 pointer-events-none'}`}
                >
                  <iframe 
                    src={tab.url} 
                    className="w-full h-full border-none"
                    title={`Task Browser Tab ${tab.id}`}
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                  />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Alert Popup */}
      <AnimatePresence>
        {alertConfig.show && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="bg-card-bg border border-white/10 p-6 rounded-2xl w-full max-w-xs text-center space-y-4"
            >
              <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center ${alertConfig.type === 'success' ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                {alertConfig.type === 'success' ? <CheckCircle className="w-8 h-8 text-green-500" /> : <AlertTriangle className="w-8 h-8 text-red-500" />}
              </div>
              <h3 className={`text-xl font-bold ${alertConfig.type === 'success' ? 'text-green-500' : 'text-red-500'}`}>
                {alertConfig.title}
              </h3>
              <p className="text-gray-300 text-sm">{alertConfig.message}</p>
              <button 
                onClick={() => setAlertConfig(prev => ({ ...prev, show: false }))}
                className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 font-bold transition-colors"
              >
                OK
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Task Preparation Popup */}
      <AnimatePresence>
        {showPopup && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-dark-bg flex items-center justify-center p-6"
          >
            <div className="bg-card-bg border border-white/10 p-8 rounded-3xl w-full max-w-xs text-center space-y-6">
              <h2 className="text-accent font-bold text-xl">Best Earning App</h2>
              <p className="text-3xl font-bold">{currentTask?.coins} Coins</p>
              <div className="bg-white/5 p-6 rounded-2xl flex items-center justify-center space-x-4">
                <Timer className="w-8 h-8 text-accent" />
                <span className="text-5xl font-bold text-accent">{timeLeft}</span>
                <span className="text-sm">Seconds</span>
              </div>
              <p className="text-gray-500 text-xs">Wait for the timer to finish. Do not close the app.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {timeLeft > 0 && !showPopup && (
        <div className="fixed inset-0 z-[90] bg-dark-bg/90 flex items-center justify-center p-6 backdrop-blur-sm">
          <div className="bg-card-bg p-8 rounded-3xl text-center space-y-4 max-w-xs w-full border border-accent/20">
            <h3 className="text-accent font-bold">Task in Progress</h3>
            <div className="text-6xl font-bold">{timeLeft}</div>
            <p className="text-gray-500 text-sm">Please wait while we verify your task completion.</p>
          </div>
        </div>
      )}
    </div>
  );
};

const TaskCard: React.FC<{ title: string; reward: number; icon: React.ReactNode; color: string; onClick: () => void }> = ({ title, reward, icon, color, onClick }) => (
  <div className="card flex items-center justify-between group">
    <div className="flex items-center space-x-4">
      <div className={`${color} p-3 rounded-xl text-white`}>
        {icon}
      </div>
      <div>
        <h3 className="font-bold text-sm">{title}</h3>
        <p className="text-xs text-gray-500">Reward: {reward} Coins</p>
      </div>
    </div>
    <button 
      onClick={onClick}
      className="bg-accent text-dark-bg font-bold px-4 py-2 rounded-xl text-xs active:scale-95 transition-transform"
    >
      Claim
    </button>
  </div>
);

const NavLink: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string }> = ({ active, onClick, icon, label }) => (
  <button 
    onClick={onClick}
    className={`flex flex-col items-center space-y-1 transition-colors ${active ? 'text-accent' : 'text-gray-500'}`}
  >
    {React.cloneElement(icon as React.ReactElement, { className: 'w-5 h-5' })}
    <span className="text-[10px] font-medium">{label}</span>
  </button>
);

const StatRow: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="flex justify-between items-center text-sm">
    <span className="text-gray-500">{label}</span>
    <span className="text-accent font-bold">{value}</span>
  </div>
);

const FilterButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button 
    onClick={onClick}
    className={cn(
      "px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
      active 
        ? "bg-accent text-dark-bg border-accent shadow-lg shadow-accent/20" 
        : "bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white"
    )}
  >
    {children}
  </button>
);
