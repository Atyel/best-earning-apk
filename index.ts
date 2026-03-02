export interface UserData {
  uid: string;
  name: string;
  email: string;
  balance: number;
  referralCode: string;
  referredBy: string | null;
  dailyAdCount: number;
  lastAdWatchDate: string;
  deviceId: string;
  ip: string;
  createdAt: string;
  totalEarned: number;
  totalWithdrawn: number;
  totalReferrals: number;
  referralEarnings: number;
  completedTasks: number;
  incompleteTasks: number;
  blocked: boolean;
  lastTaskTime?: string;
}

export interface AppSettings {
  minWithdrawal: number;
  dailyAdLimit: number;
  referralBonus: number;
  coinRate: number;
}

export interface WithdrawalRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  amount: number;
  method: string;
  number: string;
  status: 'pending' | 'approved' | 'rejected';
  timestamp: string;
  approvedAt?: string;
  rejectedAt?: string;
}

export interface ActivityLog {
  userId: string;
  type: string;
  description: string;
  timestamp: string;
}

export interface Task {
  id: string;
  type: 'video' | 'website' | 'special' | 'game';
  waitSeconds: number;
  coins: number;
  url?: string;
  startTime?: number;
  completed: boolean;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  createdAt: string;
}
