import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCircle, Trash2, ArrowLeft, Plus } from "lucide-react";

const DoctorNotifications: React.FC = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<any[]>([]);

  // Load notifications from localStorage or API
  useEffect(() => {
    const loadNotifications = () => {
      try {
        const stored = localStorage.getItem("doctorNotifications");
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
            "doctorNotifications",
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
      "doctorNotifications",
      JSON.stringify(updatedNotifications)
    );
  };

  const deleteNotification = (id: number) => {
    const updatedNotifications = notifications.filter((n) => n.id !== id);
    setNotifications(updatedNotifications);
    localStorage.setItem(
      "doctorNotifications",
      JSON.stringify(updatedNotifications)
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10">
      <div className="w-full max-w-2xl bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/doctor/dashboard")}
              className="p-2 text-gray-600 hover:text-gray-800 transition-colors rounded-lg hover:bg-gray-100"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <Bell className="w-8 h-8 text-sky-600" />
            <h2 className="text-2xl font-bold text-gray-900">Notifications</h2>
          </div>
          <button
            onClick={() => navigate("/doctor/announcements")}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-sky-200 text-sky-700 hover:bg-sky-50 rounded-lg transition-colors font-medium"
          >
            <Plus className="w-4 h-4" />
            <span>New Announcement</span>
          </button>
        </div>
        <ul className="space-y-4">
          {notifications.length === 0 ? (
            <li className="text-gray-600 text-center py-8">
              No notifications.
            </li>
          ) : (
            notifications.map((n) => (
              <li
                key={n.id}
                className={`flex items-start gap-4 p-4 rounded-xl border transition-all ${
                  n.read
                    ? "bg-gray-50 border-gray-200"
                    : "bg-sky-50 border-sky-200 shadow-sm"
                }`}
              >
                <div className="flex flex-col items-center gap-2 pt-1">
                  {n.read ? (
                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <Bell className="w-5 h-5 text-sky-600 animate-pulse" />
                  )}
                  <span className="text-xs text-gray-500">{n.date}</span>
                </div>
                <div className="flex-1">
                  <h3
                    className={`font-semibold text-gray-900 ${
                      n.read ? "opacity-70" : ""
                    }`}
                  >
                    {n.title}
                  </h3>
                  <p
                    className={`text-gray-700 text-sm ${
                      n.read ? "opacity-70" : ""
                    }`}
                  >
                    {n.message}
                  </p>
                  <div className="mt-2 flex gap-2">
                    {!n.read && (
                      <button
                        className="px-3 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 text-xs"
                        onClick={() => markAsRead(n.id)}
                      >
                        Mark as Read
                      </button>
                    )}
                    <button
                      className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-xs flex items-center gap-1"
                      onClick={() => deleteNotification(n.id)}
                    >
                      <Trash2 className="w-4 h-4" /> Delete
                    </button>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
};

export default DoctorNotifications;
