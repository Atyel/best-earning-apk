import React from 'react';
import { Bell, Check, Trash2, Info, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Notification } from '@/src/types';
import { doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';

interface NotificationListProps {
  notifications: Notification[];
  onClose: () => void;
}

export const NotificationList: React.FC<NotificationListProps> = ({ notifications, onClose }) => {
  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), {
        read: true
      });
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  const markAllAsRead = async () => {
    const batch = writeBatch(db);
    notifications.forEach(notification => {
      if (!notification.read) {
        const ref = doc(db, 'notifications', notification.id);
        batch.update(ref, { read: true });
      }
    });
    try {
      await batch.commit();
    } catch (error) {
      console.error("Error marking all as read:", error);
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', id));
    } catch (error) {
      console.error("Error deleting notification:", error);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'warning': return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'error': return <XCircle className="w-5 h-5 text-red-500" />;
      default: return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex justify-end">
      <motion.div 
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        className="w-full max-w-md bg-dark-bg h-full shadow-2xl flex flex-col"
      >
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-dark-card">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Bell className="w-5 h-5 text-accent" />
            Notifications
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full">
            <XCircle className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {notifications.length === 0 ? (
            <div className="text-center text-gray-500 py-10">
              <Bell className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>No notifications yet</p>
            </div>
          ) : (
            <AnimatePresence>
              {notifications.map((notification) => (
                <motion.div
                  key={notification.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  className={`p-4 rounded-xl border ${notification.read ? 'bg-dark-card border-white/5' : 'bg-accent/5 border-accent/20'} relative group`}
                  onClick={() => !notification.read && markAsRead(notification.id)}
                >
                  <div className="flex gap-3">
                    <div className="mt-1 flex-shrink-0">
                      {getIcon(notification.type)}
                    </div>
                    <div className="flex-1">
                      <h3 className={`font-medium ${notification.read ? 'text-gray-300' : 'text-white'}`}>
                        {notification.title}
                      </h3>
                      <p className="text-sm text-gray-400 mt-1 leading-relaxed">
                        {notification.message}
                      </p>
                      <p className="text-xs text-gray-500 mt-2">
                        {new Date(notification.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotification(notification.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/10 rounded text-red-400 transition-all self-start"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {!notification.read && (
                    <div className="absolute top-4 right-4 w-2 h-2 bg-accent rounded-full animate-pulse" />
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>

        {notifications.length > 0 && (
          <div className="p-4 border-t border-white/10 bg-dark-card">
            <button 
              onClick={markAllAsRead}
              className="w-full py-3 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              Mark all as read
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};
