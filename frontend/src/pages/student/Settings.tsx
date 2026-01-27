import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  User,
  Phone,
  Globe,
  MapPin,
  Shield,
  Save,
  ArrowLeft,
  AlertCircle,
  CheckCircle,
  Loader2,
  Settings as SettingsIcon,
  CalendarDays,
} from "lucide-react";
import {
  getStudentProfile,
  updateStudentProfile,
  updateMe,
  changeMyPassword,
} from "../../lib/api";
import { signOut, isAuthed, getToken } from "../../lib/auth";

interface StudentProfile {
  student_id: number;
  student_number: string;
  full_name: string;
  email?: string;
  phone?: string;
  year_level: string;
  status: string;
  graduation_year?: number;
  notes?: string;
  created_at: string;
  user_id?: number;
  gpa?: number;
  date_of_birth?: string;
  nationality?: string;
  address?: string;
  emergency_contact_name?: string;
  emergency_contact_relationship?: string;
  emergency_contact_phone?: string;
}

export default function StudentSettings() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form data
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    date_of_birth: "",
    nationality: "",
    address: "",
    emergency_contact_name: "",
    emergency_contact_relationship: "",
    emergency_contact_phone: "",
  });

  // Password change form data
  const [passwordFormData, setPasswordFormData] = useState({
    current_password: "",
    new_password: "",
    confirm_new_password: "",
  });
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const dateInputRef = useRef<HTMLInputElement>(null);

  const handleIconClick = () => {
    dateInputRef.current?.showPicker();
  };

  // Load student profile
  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Check authentication first
      if (!isAuthed()) {
        console.log("User not authenticated, redirecting to sign in");
        setError("Please sign in to access your profile.");
        setTimeout(() => {
          window.location.href = "/signin";
        }, 2000);
        return;
      }

      console.log("Loading student profile...");
      console.log("Token:", getToken() ? "Present" : "Missing");
      const { data } = await getStudentProfile("me" as any); // Students can access their own profile
      console.log("Profile loaded:", data);
      setProfile(data);

      // Populate form with existing data
      setFormData({
        full_name: data.full_name || "",
        email: data.email || "",
        phone: data.phone || "",
        date_of_birth: data.date_of_birth
          ? new Date(data.date_of_birth).toISOString().split("T")[0]
          : "",
        nationality: data.nationality || "",
        address: data.address || "",
        emergency_contact_name: data.emergency_contact_name || "",
        emergency_contact_relationship:
          data.emergency_contact_relationship || "",
        emergency_contact_phone: data.emergency_contact_phone || "",
      });
    } catch (e: any) {
      console.error("Failed to load profile:", e);
      console.error("Error details:", e.response?.data);
      console.error("Error status:", e.response?.status);

      if (e.response?.status === 401) {
        setError("Please sign in to access your profile.");
        // Redirect to sign in
        setTimeout(() => {
          window.location.href = "/signin";
        }, 2000);
      } else if (e.response?.status === 404) {
        setError("Student profile not found. Please contact support.");
      } else {
        setError(
          `Failed to load profile: ${
            e.response?.data?.detail || e.message || "Please try again."
          }`
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (error) setError(null);
    if (success) setSuccess(null);
  };

  const handlePasswordInputChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value } = e.target;
    setPasswordFormData((prev) => ({ ...prev, [name]: value }));
    if (passwordError) setPasswordError(null);
    if (passwordSuccess) setPasswordSuccess(null);
  };

  const handleChangePassword = async () => {
    if (!profile) return;

    // Basic validation
    if (
      !passwordFormData.current_password ||
      !passwordFormData.new_password ||
      !passwordFormData.confirm_new_password
    ) {
      setPasswordError("All password fields are required.");
      return;
    }
    if (passwordFormData.new_password.length < 6) {
      setPasswordError("New password must be at least 6 characters long.");
      return;
    }
    if (
      passwordFormData.new_password !== passwordFormData.confirm_new_password
    ) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }

    try {
      setChangingPassword(true);
      setPasswordError(null);
      setPasswordSuccess(null);

      await changeMyPassword({
        current_password: passwordFormData.current_password,
        new_password: passwordFormData.new_password,
      });

      setPasswordSuccess("Password changed successfully!");
      // Clear password fields after successful change
      setPasswordFormData({
        current_password: "",
        new_password: "",
        confirm_new_password: "",
      });
    } catch (e: any) {
      console.error("Failed to change password:", e);
      setPasswordError(
        e.response?.data?.detail ||
          "Failed to change password. Please try again."
      );
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSave = async () => {
    if (!profile) return;

    try {
      setSaving(true);
      setError(null);

      // Prepare payloads
      const updateData: any = {
        full_name: formData.full_name,
        phone: formData.phone,
        date_of_birth: formData.date_of_birth
          ? new Date(formData.date_of_birth).toISOString()
          : null,
        nationality: formData.nationality,
        address: formData.address,
        emergency_contact_name: formData.emergency_contact_name,
        emergency_contact_relationship: formData.emergency_contact_relationship,
        emergency_contact_phone: formData.emergency_contact_phone,
      };

      // First update the student profile with all fields
      await updateStudentProfile("me" as any, updateData);

      // Then update the user account with email (if changed)
      if (formData.email && formData.email !== (profile.email || "")) {
        await updateMe({
          email: formData.email,
          // Note: username is not being updated here as it's not part of the form
          // and we want to keep the username consistent
        });
      }

      setSuccess("Profile updated successfully!");

      // Reload profile to get updated data
      await loadProfile();

      // Dispatch event to notify other components (like Dashboard) of the update
      // Also include the updated data in the event
      window.dispatchEvent(
        new CustomEvent("profileUpdated", {
          detail: { fullName: formData.full_name },
        })
      );

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      console.error("Failed to update profile:", e);
      setError("Failed to update profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleGoBack = () => navigate(-1);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-200 flex items-center justify-center">
        <div className="text-gray-900 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p>Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-gray-200">
      {/* Background effects */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gray-200/90" />
        <div className="absolute top-0 left-0 w-full h-full">
          <div className="absolute top-20 left-20 w-72 h-72 bg-gradient-to-r from-sky-300/30 to-sky-400/30 rounded-full blur-3xl animate-pulse" />
          <div
            className="absolute top-40 right-40 w-96 h-96 bg-gradient-to-r from-gray-300/20 to-gray-400/20 rounded-full blur-3xl animate-pulse"
            style={{ animationDelay: "1000ms" }}
          />
        </div>
      </div>

      {/* Header */}
      <div className="relative z-10 bg-gray-200/10 backdrop-blur-md border-b border-gray-300">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={handleGoBack}
                className="group flex items-center gap-2 px-4 py-2 bg-gray-100/70 border border-gray-300 rounded-xl text-gray-800 hover:bg-gray-200/70 transition-all duration-300"
              >
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                <span>Back</span>
              </button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-sky-500 to-sky-600 rounded-xl flex items-center justify-center">
                  <SettingsIcon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-black text-gray-900">Settings</h1>
                  <p className="text-sm text-gray-800">
                    Update your personal information
                  </p>
                </div>
              </div>
            </div>
            <button
              onClick={() => signOut("/signin")}
              className="p-2 text-gray-800 hover:text-gray-900 transition-colors"
              title="Sign Out"
            >
              <User className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 max-w-4xl mx-auto px-6 py-8">
        <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-8">
          {/* Success/Error Messages */}
          {success && (
            <div className="flex items-center gap-3 p-4 bg-emerald-500/20 border border-emerald-400/30 rounded-2xl mb-6">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
              <p className="text-emerald-600 font-medium">{success}</p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-500/20 border border-red-400/30 rounded-2xl mb-6">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <p className="text-red-600 font-medium">{error}</p>
            </div>
          )}

          {/* Student Info Header */}
          {profile && (
            <div className="mb-8 p-6 bg-gray-100/50 rounded-2xl border border-gray-300">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 bg-gradient-to-r from-sky-500 to-sky-600 rounded-2xl flex items-center justify-center text-white text-xl font-bold">
                  {profile.full_name?.slice(0, 2).toUpperCase() || "ST"}
                </div>
                <div>
                  <h2 className="text-2xl font-black text-gray-900">
                    {formData.full_name || profile.full_name}
                  </h2>
                  <p className="text-gray-700">
                    Student ID: {profile.student_number}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Personal Information Form */}
          <div className="space-y-8">
            <div>
              <h3 className="text-xl font-black text-gray-900 mb-6 flex items-center gap-3">
                <User className="w-6 h-6 text-sky-500" />
                Personal Information
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-gray-800">
                    Full Name
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={formData.full_name}
                      onChange={(e) =>
                        handleInputChange("full_name", e.target.value)
                      }
                      placeholder="Enter your full name"
                      className="w-full px-4 py-3 bg-gray-100/70 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-bold text-gray-800">
                    Email
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) =>
                        handleInputChange("email", e.target.value)
                      }
                      placeholder="Enter your email"
                      className="w-full px-4 py-3 bg-gray-100/70 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-gray-800">
                    Date of Birth
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      ref={dateInputRef}
                      value={formData.date_of_birth}
                      onChange={(e) =>
                        handleInputChange("date_of_birth", e.target.value)
                      }
                      className="w-full px-4 py-3 bg-gray-100/70 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent pr-10"
                      style={{
                        WebkitAppearance: "none",
                        MozAppearance: "none",
                        MsAppearance: "none",
                        appearance: "none",
                        // Hide native calendar picker indicator in Webkit browsers
                        WebkitCalendarPickerIndicator: { display: "none" },
                        // Hide native calendar picker indicator in Firefox
                        MozAppearance: "textfield", // Ensure it's treated as a text field for Firefox
                        MozCalendarPickerIndicator: { display: "none" },
                      }}
                    />
                    <CalendarDays
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 cursor-pointer z-10 pointer-events-auto"
                      onClick={handleIconClick}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-bold text-gray-800">
                    Nationality
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={formData.nationality}
                      onChange={(e) =>
                        handleInputChange("nationality", e.target.value)
                      }
                      placeholder="Enter your nationality"
                      className="w-full px-4 py-3 bg-gray-100/70 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                    />
                    <Globe className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                  </div>
                </div>

                <div className="md:col-span-2 space-y-2">
                  <label className="block text-sm font-bold text-gray-800">
                    Address
                  </label>
                  <div className="relative">
                    <textarea
                      value={formData.address}
                      onChange={(e) =>
                        handleInputChange("address", e.target.value)
                      }
                      placeholder="Enter your full address"
                      rows={3}
                      className="w-full px-4 py-3 bg-gray-100/70 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent resize-none"
                    />
                    <MapPin className="absolute right-3 top-3 w-4 h-4 text-gray-600" />
                  </div>
                </div>
              </div>
            </div>

            {/* Password Change Section */}
            <div>
              <h3 className="text-xl font-black text-gray-900 mb-6 flex items-center gap-3">
                <Shield className="w-6 h-6 text-sky-500" />
                Change Password
              </h3>

              {passwordSuccess && (
                <div className="flex items-center gap-3 p-4 bg-emerald-500/20 border border-emerald-400/30 rounded-2xl mb-6">
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                  <p className="text-emerald-600 font-medium">
                    {passwordSuccess}
                  </p>
                </div>
              )}

              {passwordError && (
                <div className="flex items-center gap-3 p-4 bg-red-500/20 border border-red-400/30 rounded-2xl mb-6">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  <p className="text-red-600 font-medium">{passwordError}</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-gray-800">
                    Current Password
                  </label>
                  <input
                    type="password"
                    name="current_password"
                    value={passwordFormData.current_password}
                    onChange={handlePasswordInputChange}
                    className="w-full px-4 py-3 bg-gray-100/70 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                    placeholder="Enter current password"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-gray-800">
                    New Password
                  </label>
                  <input
                    type="password"
                    name="new_password"
                    value={passwordFormData.new_password}
                    onChange={handlePasswordInputChange}
                    className="w-full px-4 py-3 bg-gray-100/70 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                    placeholder="Enter new password"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="block text-sm font-bold text-gray-800">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    name="confirm_new_password"
                    value={passwordFormData.confirm_new_password}
                    onChange={handlePasswordInputChange}
                    className="w-full px-4 py-3 bg-gray-100/70 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                    placeholder="Confirm new password"
                  />
                </div>
              </div>
              <div className="flex justify-end pt-6">
                <button
                  onClick={handleChangePassword}
                  disabled={changingPassword}
                  className="group bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold py-3 px-8 rounded-2xl transition-all duration-500 transform hover:scale-105 disabled:transform-none flex items-center gap-3 shadow-lg shadow-sky-500/20"
                >
                  {changingPassword ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Save className="w-5 h-5" />
                  )}
                  <span>
                    {changingPassword ? "Changing..." : "Change Password"}
                  </span>
                </button>
              </div>
            </div>

            {/* Emergency Contact */}
            <div>
              <h3 className="text-xl font-black text-gray-900 mb-6 flex items-center gap-3">
                <Shield className="w-6 h-6 text-sky-500" />
                Emergency Contact
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-gray-800">
                    Contact Name
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={formData.emergency_contact_name}
                      onChange={(e) =>
                        handleInputChange(
                          "emergency_contact_name",
                          e.target.value
                        )
                      }
                      placeholder="Full name of emergency contact"
                      className="w-full px-4 py-3 bg-gray-100/70 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                    />
                    <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-bold text-gray-800">
                    Relationship
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={formData.emergency_contact_relationship}
                      onChange={(e) =>
                        handleInputChange(
                          "emergency_contact_relationship",
                          e.target.value
                        )
                      }
                      placeholder="e.g., Parent, Sibling, Spouse"
                      className="w-full px-4 py-3 bg-gray-100/70 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                    />
                    <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                  </div>
                </div>

                <div className="md:col-span-2 space-y-2">
                  <label className="block text-sm font-bold text-gray-800">
                    Phone Number
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      value={formData.emergency_contact_phone}
                      onChange={(e) =>
                        handleInputChange(
                          "emergency_contact_phone",
                          e.target.value
                        )
                      }
                      placeholder="Emergency contact phone number"
                      className="w-full px-4 py-3 bg-gray-100/70 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                    />
                    <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                  </div>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-6 border-t border-gray-300">
              <button
                onClick={handleSave}
                disabled={saving}
                className="group bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold py-3 px-8 rounded-2xl transition-all duration-500 transform hover:scale-105 disabled:transform-none flex items-center gap-3 shadow-lg shadow-sky-500/20"
              >
                {saving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Save className="w-5 h-5" />
                )}
                <span>{saving ? "Saving..." : "Save Changes"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
