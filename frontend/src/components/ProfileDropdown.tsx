import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { User, Settings, LogOut, ChevronDown, Save, Eye } from "lucide-react";
import { clearToken } from "../lib/auth";

interface ProfileDropdownProps {
  userInfo: {
    fullName: string;
    email: string;
    role: string;
    specialization?: string;
    department?: string;
    phone?: string;
  };
}

export default function ProfileDropdown({ userInfo }: ProfileDropdownProps) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [profileData, setProfileData] = useState({
    fullName: userInfo.fullName || "",
    email: userInfo.email || "",
    specialization: userInfo.specialization || "",
    department: userInfo.department || "",
    phone: userInfo.phone || "",
  });

  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // Check if click is outside both the button and the dropdown
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        // Also check if the click is not on the dropdown portal
        const dropdownElement = document.querySelector(
          "[data-dropdown-portal]"
        );
        if (!dropdownElement || !dropdownElement.contains(target)) {
          setIsOpen(false);
          setShowAccountSettings(false);
        }
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleLogout = () => {
    clearToken();
    navigate("/signin");
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // TODO: Call API to update profile
      localStorage.setItem("displayName", profileData.fullName);
      localStorage.setItem("userEmail", profileData.email);

      setMessage({ type: "success", text: "Profile updated successfully!" });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error ? error.message : "Failed to update profile",
      });
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="relative z-50" ref={dropdownRef}>
      {/* Profile Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-3 p-2 rounded-lg hover:bg-white/10 transition-colors"
      >
        <div className="w-8 h-8 bg-gradient-to-br from-sky-500 to-sky-600 rounded-full flex items-center justify-center text-white text-sm font-semibold">
          {getInitials(userInfo.fullName)}
        </div>
        <div className="hidden md:block text-left">
          <p className="text-sm font-medium text-gray-900">
            {userInfo.fullName}
          </p>
          <p className="text-xs text-gray-700">{userInfo.role}</p>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-gray-700 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen &&
        createPortal(
          <div
            data-dropdown-portal
            className="fixed top-16 right-6 w-72 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
            style={{
              backgroundColor: "#ffffff",
              zIndex: 99999,
              position: "fixed",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {!showAccountSettings && (
              <>
                {/* Profile Header */}
                <div className="p-4 bg-white border-b border-gray-100">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-sky-500 to-sky-600 rounded-full flex items-center justify-center text-white font-semibold text-lg">
                      {getInitials(userInfo.fullName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">
                        {userInfo.fullName}
                      </p>
                      <p className="text-sm text-gray-700 truncate">
                        {userInfo.email}
                      </p>
                      <p className="text-xs text-sky-600 font-medium uppercase tracking-wide">
                        {userInfo.role}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Menu Items */}
                <div className="py-1">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsOpen(false);
                      navigate(`/${userInfo.role.toLowerCase()}/profile`);
                    }}
                    className="w-full flex items-center space-x-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors group"
                  >
                    <Eye className="w-5 h-5 text-sky-600 group-hover:text-sky-700" />
                    <span className="text-sm font-medium text-gray-900">
                      View Profile
                    </span>
                  </button>

                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsOpen(false);
                      navigate(
                        `/${userInfo.role.toLowerCase()}/account-settings`
                      );
                    }}
                    className="w-full flex items-center space-x-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors group"
                  >
                    <User className="w-5 h-5 text-sky-600 group-hover:text-sky-700" />
                    <span className="text-sm font-medium text-gray-900">
                      Account Settings
                    </span>
                  </button>

                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsOpen(false);
                      navigate(`/${userInfo.role.toLowerCase()}/settings`);
                    }}
                    className="w-full flex items-center space-x-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors group"
                  >
                    <Settings className="w-5 h-5 text-sky-600 group-hover:text-sky-700" />
                    <span className="text-sm font-medium text-gray-900">
                      App Settings
                    </span>
                  </button>

                  <div className="border-t border-gray-100 my-1"></div>

                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleLogout();
                    }}
                    className="w-full flex items-center space-x-3 px-4 py-3 text-left hover:bg-red-50 transition-colors text-red-600 group"
                  >
                    <LogOut className="w-5 h-5 group-hover:text-red-700" />
                    <span className="text-sm font-medium group-hover:text-red-700">
                      Sign Out
                    </span>
                  </button>
                </div>
              </>
            )}

            {/* Account Settings Panel */}
            {showAccountSettings && (
              <div className="max-h-96 overflow-y-auto bg-white">
                <div className="p-4 border-b border-gray-100 bg-white">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">
                      Account Settings
                    </h3>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowAccountSettings(false);
                      }}
                      className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-200 text-gray-600 hover:text-gray-800 transition-colors"
                    >
                      ×
                    </button>
                  </div>
                </div>

                <div className="p-4">
                  {message && (
                    <div
                      className={`mb-4 p-3 rounded-lg text-sm ${
                        message.type === "success"
                          ? "bg-green-50 text-green-800 border border-green-200"
                          : "bg-red-50 text-red-800 border border-red-200"
                      }`}
                    >
                      {message.text}
                    </div>
                  )}

                  <form onSubmit={handleProfileUpdate} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-800 mb-1">
                        Full Name
                      </label>
                      <input
                        type="text"
                        value={profileData.fullName}
                        onChange={(e) =>
                          setProfileData((prev) => ({
                            ...prev,
                            fullName: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-gray-900"
                        placeholder="Enter your full name"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-800 mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        value={profileData.email}
                        onChange={(e) =>
                          setProfileData((prev) => ({
                            ...prev,
                            email: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-gray-900"
                        placeholder="Enter your email"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-800 mb-1">
                        Specialization
                      </label>
                      <input
                        type="text"
                        value={profileData.specialization}
                        onChange={(e) =>
                          setProfileData((prev) => ({
                            ...prev,
                            specialization: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-gray-900"
                        placeholder="Enter your specialization"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-800 mb-1">
                        Department
                      </label>
                      <input
                        type="text"
                        value={profileData.department}
                        onChange={(e) =>
                          setProfileData((prev) => ({
                            ...prev,
                            department: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-gray-900"
                        placeholder="Enter your department"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-800 mb-1">
                        Phone
                      </label>
                      <input
                        type="tel"
                        value={profileData.phone}
                        onChange={(e) =>
                          setProfileData((prev) => ({
                            ...prev,
                            phone: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-gray-900"
                        placeholder="Enter your phone number"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-sky-500 text-white py-2.5 px-4 rounded-lg hover:bg-sky-600 transition-colors flex items-center justify-center space-x-2 text-sm font-medium"
                    >
                      <Save className="w-4 h-4" />
                      <span>Save Changes</span>
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
