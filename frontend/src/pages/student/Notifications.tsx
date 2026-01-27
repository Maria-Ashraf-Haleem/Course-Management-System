import { useState, useEffect } from 'react';
import { Bell, AlertCircle, ArrowLeft, FileText, MessageCircle, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getStudentAnnouncements, markAnnouncementAsRead, markAllAnnouncementsAsRead } from '../../lib/api';

 

interface Notification {
  id: number;
  type: 'submission' | 'feedback' | 'grade' | 'system';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  actionUrl?: string;
}

export default function Notifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    try {
      setIsLoading(true);
      const response = await getStudentAnnouncements({ limit: 100 });
      const data = response.data;
      const rows = Array.isArray(data) ? data : data?.data || [];
      const mapped: Notification[] = (rows ?? []).map((a: any) => ({
        id: a.id,
        type: 'system',
        title: a.title,
        message: a.message,
        timestamp: a.timestamp || a.sent_at,
        read: Boolean(a.read),
      }));
      // Show only unread notifications
      setNotifications(mapped.filter(n => !n.read));
    } catch (error) {
      console.error('Error loading notifications:', error);
      setNotifications([]);
    } finally {
      setIsLoading(false);
    }
  };

  const markAsRead = async (notificationId: number) => {
    try {
      await markAnnouncementAsRead(notificationId);
      // Remove from current list immediately (we only show unread)
      setNotifications(prev => prev.filter(notif => notif.id !== notificationId));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await markAllAnnouncementsAsRead();
      // Clear list since we display only unread items
      setNotifications([]);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'submission':
        return <FileText className="w-5 h-5" />;
      case 'feedback':
        return <MessageCircle className="w-5 h-5" />;
      case 'grade':
        return <Star className="w-5 h-5" />;
      case 'system':
        return <AlertCircle className="w-5 h-5" />;
      default:
        return <Bell className="w-5 h-5" />;
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'submission':
        return 'text-sky-400 bg-sky-500/20 border-sky-400/30';
      case 'feedback':
        return 'text-sky-400 bg-sky-500/20 border-sky-400/30'; // Changed to sky
      case 'grade':
        return 'text-yellow-400 bg-yellow-500/20 border-yellow-400/30';
      case 'system':
        return 'text-orange-400 bg-orange-500/20 border-orange-400/30';
      default:
        return 'text-gray-400 bg-gray-500/20 border-gray-400/30';
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-200 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-sky-400 to-sky-600 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Bell className="w-8 h-8 text-white" />
          </div>
          <p className="text-gray-800 font-medium">Loading notifications...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-200">
      {/* Header */}
      <div className="bg-gray-200/10 backdrop-blur-md border-b border-gray-300">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/student/dashboard')}
                className="p-2 text-gray-800 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-300/70"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-sky-500 to-sky-600 rounded-xl flex items-center justify-center">
                  <Bell className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-black text-gray-900">Notifications</h1>
                  <p className="text-sm text-gray-800">
                    {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            </div>
            
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="px-4 py-2 bg-sky-500/20 border border-sky-400/30 text-sky-600 hover:bg-sky-500/30 rounded-lg transition-colors text-sm font-medium"
              >
                Mark All Read
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="space-y-4">
          {notifications.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-24 h-24 bg-gray-300 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <Bell className="w-12 h-12 text-gray-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                No notifications
              </h3>
              <p className="text-gray-700">
                You're all caught up!
              </p>
            </div>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                className={`bg-gray-100/70 backdrop-blur-xl rounded-3xl border p-6 transition-all duration-300 hover:scale-[1.02] ${
                  notification.read
                    ? 'border-gray-300 opacity-75'
                    : 'border-sky-300 shadow-lg shadow-sky-500/10' // Changed border and shadow for unread
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${getNotificationColor(notification.type)}`}>
                    {getNotificationIcon(notification.type)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-lg font-bold text-gray-900">{notification.title}</h3>
                      <div className="flex items-center gap-2">
                        {!notification.read && (
                          <div className="w-2 h-2 bg-sky-500 rounded-full animate-pulse" />
                        )}
                        <span className="text-xs text-gray-600">
                          {new Date(notification.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    
                    <p className="text-gray-800 text-sm mb-4 leading-relaxed">
                      {notification.message}
                    </p>
                    
                    <div className="flex items-center gap-3">
                      {!notification.read && (
                        <button
                          onClick={() => markAsRead(notification.id)}
                          className="px-3 py-1.5 bg-sky-500/20 border border-sky-400/30 text-sky-600 hover:bg-sky-500/30 rounded-lg transition-colors text-xs font-medium"
                        >
                          Mark as Read
                        </button>
                      )}
                      
                      {notification.actionUrl && (
                        <button
                          onClick={() => navigate(notification.actionUrl!)}
                          className="px-3 py-1.5 bg-gray-100/70 border border-gray-300 text-gray-800 hover:bg-gray-200/70 rounded-lg transition-colors text-xs font-medium"
                        >
                          View Details
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
