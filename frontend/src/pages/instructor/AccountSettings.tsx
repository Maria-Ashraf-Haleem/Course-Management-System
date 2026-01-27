import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  User,
  Mail,
  Phone,
  Stethoscope,
  CheckCircle,
  AlertCircle,
  Key,
  Eye,
  EyeOff,
  GraduationCap,
  Calendar,
  CreditCard,
  Award,
} from "lucide-react";
import { getMe, updateMe, changePassword, getInstructorProfile, updateInstructorProfile } from "../../lib/api";

export default function AccountSettings() {
  const navigate = useNavigate();

  const [profileData, setProfileData] = useState({
    fullName: "",
    email: "",
    phone: "",
    joinDate: "",
    license: "",
    specialization: "",
    department: "",
    yearsOfExperience: "",
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{
    [key: string]: string;
  }>({});

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      setIsLoading(true);
      const [meResponse, instrResponse] = await Promise.all([getMe(), getInstructorProfile()]);

      const user = meResponse.data as any;
      const p = (instrResponse as any).data || {};

      // Normalize joinDate to yyyy-mm-dd for input[type=date]
      const toDateInput = (d?: string) => {
        if (!d) return "";
        try {
          const dt = new Date(d);
          if (isNaN(dt.getTime())) return "";
          return dt.toISOString().slice(0, 10);
        } catch {
          return "";
        }
      };

      setProfileData({
        fullName: p.fullName || user?.full_name || user?.username || "",
        email: p.email || user?.email || "",
        phone: p.phone || "",
        // Prefer instructor profile joinDate; fallback to /auth/me.created_at date
        joinDate: toDateInput(p.joinDate) || toDateInput(user?.created_at),
        license: p.licenseNumber || "",
        specialization: p.specialization || "",
        department: p.department || "",
        yearsOfExperience: (p.yearsOfExperience != null ? String(p.yearsOfExperience) : ""),
      });
    } catch (error: any) {
      console.error("Error loading user data:", error);
      setMessage({
        type: "error",
        text:
          error.response?.data?.detail ||
          "Failed to load profile data. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleProfileChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setProfileData((prev) => ({ ...prev, [name]: value }));
  };

  const validateProfileForm = () => {
    const errors: { [key: string]: string } = {};
    if (!profileData.fullName.trim()) {
      errors.fullName = "Full name is required.";
    }
    if (!profileData.email.trim()) {
      errors.email = "Email is required.";
    } else if (!/\S+@\S+\.\S/.test(profileData.email)) {
      errors.email = "Email address is invalid.";
    }
    if (
      profileData.yearsOfExperience !== "" &&
      (isNaN(Number(profileData.yearsOfExperience)) || Number(profileData.yearsOfExperience) < 0)
    ) {
      errors.yearsOfExperience = "Years of experience must be a non-negative number.";
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateProfileForm()) {
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    try {
      // 1) Update Instructor extended profile
      await updateInstructorProfile({
        fullName: profileData.fullName,
        email: profileData.email,
        phone: profileData.phone || null,
        specialization: profileData.specialization || null,
        department: profileData.department || null,
        licenseNumber: profileData.license || null,
        joinDate: profileData.joinDate ? new Date(profileData.joinDate).toISOString() : null,
        yearsOfExperience:
          profileData.yearsOfExperience !== "" ? Number(profileData.yearsOfExperience) : null,
      });

      // 2) Update basic user fields (email and full_name)
      await updateMe({
        email: profileData.email,
        full_name: profileData.fullName,
      });

      setMessage({ type: "success", text: "Profile updated successfully!" });
    } catch (error: any) {
      console.error("Error updating profile:", error);
      setMessage({
        type: "error",
        text:
          (typeof error.response?.data?.detail === "string"
            ? error.response.data.detail
            : "") || "Failed to update profile. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPasswordData((prev) => ({ ...prev, [name]: value }));
  };

  const validatePasswordForm = () => {
    const errors: { [key: string]: string } = {};
    if (!passwordData.currentPassword) {
      errors.currentPassword = "Current password is required.";
    }
    if (!passwordData.newPassword) {
      errors.newPassword = "New password is required.";
    } else if (passwordData.newPassword.length < 8) {
      errors.newPassword = "New password must be at least 8 characters long.";
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      errors.confirmPassword = "Passwords do not match.";
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validatePasswordForm()) {
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    try {
      await changePassword({
        current_password: passwordData.currentPassword,
        new_password: passwordData.newPassword,
      });
      setMessage({ type: "success", text: "Password changed successfully!" });
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (error: any) {
      console.error("Error changing password:", error);
      setMessage({
        type: "error",
        text:
          (typeof error.response?.data?.detail === "string"
            ? error.response.data.detail
            : "") ||
          "Failed to change password. Please check your current password.",
      });
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-200 text-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-lg font-medium text-gray-800">
            Loading settings...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-200 text-gray-900">
      <div className="relative z-10 bg-gray-200/10 backdrop-blur-md border-b border-gray-300">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate("/instructor/dashboard")}
                className="p-2 rounded-lg text-gray-800 hover:text-gray-900 transition-colors hover:bg-gray-300/70"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-r from-sky-500 to-sky-600 rounded-2xl flex items-center justify-center">
                  <GraduationCap className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-black text-gray-900">
                    Account Settings
                  </h1>
                  <p className="text-gray-800">
                    Manage your profile and security settings
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-8">
        {message && (
          <div
            className={`mb-8 p-4 rounded-2xl flex items-center gap-4 ${
              message.type === "success"
                ? "bg-emerald-100 text-emerald-800 border border-emerald-400"
                : "bg-red-100 text-red-800 border border-red-400"
            }`}
          >
            {message.type === "success" ? (
              <CheckCircle className="w-6 h-6" />
            ) : (
              <AlertCircle className="w-6 h-6" />
            )}
            <div>
              <h3 className="font-semibold">
                {message.type === "success" ? "Success!" : "Error!"}
              </h3>
              <p className="text-sm">{message.text}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Profile Information */}
          <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-8 shadow-xl">
            <h2 className="text-xl font-black text-gray-900 mb-6 flex items-center gap-3">
              <User className="w-6 h-6 text-gray-800" />
              Profile Information
            </h2>
            <form onSubmit={handleProfileSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="fullName"
                  className="block text-sm font-medium text-gray-800 mb-1"
                >
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 w-5 h-5" />
                  <input
                    type="text"
                    id="fullName"
                    name="fullName"
                    value={profileData.fullName}
                    onChange={handleProfileChange}
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 pl-10 text-gray-900 focus:outline-none focus:border-sky-500"
                    placeholder="Prof. 188"
                  />
                </div>
                {validationErrors.fullName && (
                  <p className="text-red-600 text-xs mt-1">
                    {validationErrors.fullName}
                  </p>
                )}
              </div>
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-800 mb-1"
                >
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 w-5 h-5" />
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={profileData.email}
                    onChange={handleProfileChange}
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 pl-10 text-gray-900 focus:outline-none focus:border-sky-500"
                    placeholder="kokomedhat@gmail.com"
                  />
                </div>
                {validationErrors.email && (
                  <p className="text-red-600 text-xs mt-1">
                    {validationErrors.email}
                  </p>
                )}
              </div>
              <div>
                <label
                  htmlFor="phone"
                  className="block text-sm font-medium text-gray-800 mb-1"
                >
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 w-5 h-5" />
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={profileData.phone}
                    onChange={handleProfileChange}
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 pl-10 text-gray-900 focus:outline-none focus:border-sky-500"
                    placeholder="+20 123 456 7890"
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="joinDate"
                  className="block text-sm font-medium text-gray-800 mb-1"
                >
                  Join Date
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 w-5 h-5" />
                  <input
                    type="date"
                    id="joinDate"
                    name="joinDate"
                    value={profileData.joinDate}
                    onChange={handleProfileChange}
                    readOnly
                    className="w-full bg-gray-100 border border-gray-300 rounded-lg px-4 py-2 pl-10 text-gray-900 focus:outline-none"
                  />
                  <p className="mt-1 text-xs text-gray-700">Auto-filled from account creation time.</p>
                </div>
              </div>
              <div>
                <label
                  htmlFor="license"
                  className="block text-sm font-medium text-gray-800 mb-1"
                >
                  License Number
                </label>
                <div className="relative">
                  <CreditCard className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 w-5 h-5" />
                  <input
                    type="text"
                    id="license"
                    name="license"
                    value={profileData.license}
                    onChange={handleProfileChange}
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 pl-10 text-gray-900 focus:outline-none focus:border-sky-500"
                    placeholder="Enter license number"
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="specialization"
                  className="block text-sm font-medium text-gray-800 mb-1"
                >
                  Specialization
                </label>
                <div className="relative">
                  <Stethoscope className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 w-5 h-5" />
                  <input
                    type="text"
                    id="specialization"
                    name="specialization"
                    value={profileData.specialization}
                    onChange={handleProfileChange}
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 pl-10 text-gray-900 focus:outline-none focus:border-sky-500"
                    placeholder="e.g., Computer Science, Mathematics"
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="department"
                  className="block text-sm font-medium text-gray-800 mb-1"
                >
                  Department
                </label>
                <div className="relative">
                  <GraduationCap className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 w-5 h-5" />
                  <input
                    type="text"
                    id="department"
                    name="department"
                    value={profileData.department}
                    onChange={handleProfileChange}
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 pl-10 text-gray-900 focus:outline-none focus:border-sky-500"
                    placeholder="e.g., Computer Science, Engineering"
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="yearsOfExperience"
                  className="block text-sm font-medium text-gray-800 mb-1"
                >
                  Years of Experience
                </label>
                <div className="relative">
                  <Award className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 w-5 h-5" />
                  <input
                    type="number"
                    min={0}
                    id="yearsOfExperience"
                    name="yearsOfExperience"
                    value={profileData.yearsOfExperience}
                    onChange={handleProfileChange}
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 pl-10 text-gray-900 focus:outline-none focus:border-sky-500"
                    placeholder="e.g., 5"
                  />
                </div>
                {validationErrors.yearsOfExperience && (
                  <p className="text-red-600 text-xs mt-1">
                    {validationErrors.yearsOfExperience}
                  </p>
                )}
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full flex items-center justify-center gap-3 px-6 py-3 bg-gradient-to-r from-sky-500 to-sky-600 text-white font-bold rounded-xl hover:from-sky-600 hover:to-sky-700 transition-all duration-300 shadow-lg ${
                  isSubmitting ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                <Save className="w-5 h-5" />
                {isSubmitting ? "Saving..." : "Save Profile Changes"}
              </button>
            </form>
          </div>

          {/* Change Password */}
          <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-8 shadow-xl">
            <h2 className="text-xl font-black text-gray-900 mb-6 flex items-center gap-3">
              <Key className="w-6 h-6 text-gray-800" />
              Change Password
            </h2>
            <form onSubmit={handlePasswordSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="currentPassword"
                  className="block text-sm font-medium text-gray-800 mb-1"
                >
                  Current Password
                </label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 w-5 h-5" />
                  <input
                    type={showPassword ? "text" : "password"}
                    id="currentPassword"
                    name="currentPassword"
                    value={passwordData.currentPassword}
                    onChange={handlePasswordChange}
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 pl-10 text-gray-900 focus:outline-none focus:border-sky-500"
                    placeholder="Enter current password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-600 hover:text-gray-800"
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
                {validationErrors.currentPassword && (
                  <p className="text-red-600 text-xs mt-1">
                    {validationErrors.currentPassword}
                  </p>
                )}
              </div>
              <div>
                <label
                  htmlFor="newPassword"
                  className="block text-sm font-medium text-gray-800 mb-1"
                >
                  New Password
                </label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 w-5 h-5" />
                  <input
                    type={showNewPassword ? "text" : "password"}
                    id="newPassword"
                    name="newPassword"
                    value={passwordData.newPassword}
                    onChange={handlePasswordChange}
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 pl-10 text-gray-900 focus:outline-none focus:border-sky-500"
                    placeholder="Enter new password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-600 hover:text-gray-800"
                  >
                    {showNewPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
                {validationErrors.newPassword && (
                  <p className="text-red-600 text-xs mt-1">
                    {validationErrors.newPassword}
                  </p>
                )}
              </div>
              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-medium text-gray-800 mb-1"
                >
                  Confirm New Password
                </label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 w-5 h-5" />
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    id="confirmPassword"
                    name="confirmPassword"
                    value={passwordData.confirmPassword}
                    onChange={handlePasswordChange}
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 pl-10 text-gray-900 focus:outline-none focus:border-sky-500"
                    placeholder="Confirm new password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-600 hover:text-gray-800"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
                {validationErrors.confirmPassword && (
                  <p className="text-red-600 text-xs mt-1">
                    {validationErrors.confirmPassword}
                  </p>
                )}
              </div>

              <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 text-sm">
                <p className="font-semibold mb-2">Password Requirements:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>At least 8 characters long</li>
                  <li>Must match confirmation password</li>
                </ul>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full flex items-center justify-center gap-3 px-6 py-3 bg-gradient-to-r from-sky-500 to-sky-600 text-white font-bold rounded-xl hover:from-sky-600 hover:to-sky-700 transition-all duration-300 shadow-lg ${
                  isSubmitting ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                <Key className="w-5 h-5" />
                {isSubmitting ? "Changing Password..." : "Change Password"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
