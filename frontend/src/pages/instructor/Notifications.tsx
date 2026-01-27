import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCircle, Trash2, ArrowLeft, Plus } from "lucide-react";

const InstructorNotifications: React.FC = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<any[]>([]);

  // Load notifications from localStorage or API
  useEffect(() => {
    const loadNotifications = () => {
      try {
        const stored = localStorage.getItem("instructorNotifications");
        if (stored) {
          setNotifications(JSON.parse(stored));
        } else {
          // Default notifications
          const defaultNotifications = [
            {
              id: 1,
              title: "New Assignment Submitted",
              message: "Student John Doe has submitted Assignment 3.",
              date: "2025-09-05",
              read: false,
            },
            {
              id: 3,
              title: "System Update",
              message: "Platform will be updated tonight at 11 PM.",
              date: "2025-09-03",
              read: true,
            },
          ];
          setNotifications(defaultNotifications);
          localStorage.setItem(
            "instructorNotifications",
            JSON.stringify(defaultNotifications)
          );
        }
      } catch (error) {
        console.error("Error loading notifications:", error);
      }
    };

    loadNotifications();
  }, []);

  const markAsRead = (id: number) => {
    const updatedNotifications = notifications.map((n) =>
      n.id === id ? { ...n, read: true } : n
    );
    setNotifications(updatedNotifications);
    localStorage.setItem(
      "instructorNotifications",
      JSON.stringify(updatedNotifications)
    );
  };

  const deleteNotification = (id: number) => {
    const updatedNotifications = notifications.filter((n) => n.id !== id);
    setNotifications(updatedNotifications);
    localStorage.setItem(
      "instructorNotifications",
      JSON.stringify(updatedNotifications)
    );
  };

  return (
    <div className="min-h-screen bg-gray-200 flex flex-col items-center py-10">
      <div className="w-full max-w-2xl bg-gray-100/70 rounded-3xl shadow-xl p-8 border border-gray-300">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/instructor/dashboard")}
              className="p-2 text-gray-800 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-300/70"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <Bell className="w-8 h-8 text-sky-500" />
            <h2 className="text-2xl font-black text-gray-900">Notifications</h2>
          </div>
          <button
            onClick={() => navigate("/instructor/announcements")}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100/70 border border-gray-300 text-sky-800 hover:bg-gray-200/70 rounded-xl transition-colors font-medium shadow-md"
          >
            <Plus className="w-4 h-4 text-sky-500" />
            <span>New Announcement</span>
          </button>
        </div>
        <ul className="space-y-4">
          {notifications.length === 0 ? (
            <li className="text-center py-6 text-gray-700">No notifications.</li>
          ) : (
            notifications.map((notification) => (
              <li
                key={notification.id}
                className={`p-5 rounded-2xl border border-gray-300 shadow-md transition-all duration-300 ${
                  notification.read
                    ? "bg-gray-100/50 hover:bg-gray-200/70"
                    : "bg-sky-50/70 border-sky-300 hover:bg-sky-100/70"
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 mb-1">{notification.title}</h3>
                    <p className="text-sm text-gray-700">{notification.message}</p>
                  </div>
                  <div className="flex-shrink-0 flex items-center gap-2">
                    {!notification.read && (
                      <button
                        onClick={() => markAsRead(notification.id)}
                        className="p-2 text-sky-600 hover:text-sky-700 transition-colors rounded-lg hover:bg-sky-100/50"
                        title="Mark as Read"
                      >
                        <CheckCircle className="w-5 h-5" />
                      </button>
                    )}
                    <button
                      onClick={() => deleteNotification(notification.id)}
                      className="p-2 text-red-600 hover:text-red-700 transition-colors rounded-lg hover:bg-red-100/50"
                      title="Delete Notification"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-600 text-right">
                  {notification.date}
                </p>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
};

export default InstructorNotifications;
