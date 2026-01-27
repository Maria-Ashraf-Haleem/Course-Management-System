import { useState, useCallback, useRef, useEffect } from "react";
import {
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  Stethoscope,
  CheckCircle,
  Shield,
  UserPlus,
  GraduationCap,
  UserCheck,
  Users,
  Sparkles,
  ArrowRight,
  Star,
  Crown,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api, signUp } from "../../lib/api";

// Types
interface FormData {
  username: string;
  password: string;
  confirmPassword: string;
  role: string;
  email: string;
  fullName: string;
}

interface FormErrors {
  username?: string;
  password?: string;
  confirmPassword?: string;
  role?: string;
  email?: string;
  fullName?: string;
  general?: string;
}

interface ApiError {
  response?: {
    data?: {
      detail?: string;
      message?: string;
    };
    status?: number;
  };
  message?: string;
}

interface RoleOption {
  value: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  gradient: string;
  bgGradient: string;
  borderColor: string;
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const roleOptions: RoleOption[] = [
  {
    value: "student",
    label: "Student",
    icon: GraduationCap,
    description: "Dental student submitting coursework",
    gradient: "from-blue-500 to-blue-600",
    bgGradient: "from-blue-500/20 to-blue-600/20",
    borderColor: "border-blue-400/30",
  },
  {
    value: "instructor",
    label: "Instructor",
    icon: Users,
    description: "Faculty member reviewing submissions",
    gradient: "from-purple-500 to-indigo-600",
    bgGradient: "from-purple-500/20 to-indigo-600/20",
    borderColor: "border-purple-400/30",
  },
];

export default function EnhancedSignUp() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<FormData>({
    username: "",
    password: "",
    confirmPassword: "",
    role: "student",
    email: "",
    fullName: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string>("");
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [passwordStrength, setPasswordStrength] = useState(0);
  const fullNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    setIsFormVisible(true);
    const t = setTimeout(() => fullNameRef.current?.focus(), 500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!successMessage) return;
    const t = setTimeout(() => setSuccessMessage(""), 5000);
    return () => clearTimeout(t);
  }, [successMessage]);

  // Password strength calculator
  useEffect(() => {
    const calculateStrength = (password: string): number => {
      let strength = 0;
      if (password.length >= 8) strength += 1;
      if (/[A-Z]/.test(password)) strength += 1;
      if (/[a-z]/.test(password)) strength += 1;
      if (/[0-9]/.test(password)) strength += 1;
      if (/[^A-Za-z0-9]/.test(password)) strength += 1;
      return strength;
    };
    setPasswordStrength(calculateStrength(formData.password));
  }, [formData.password]);

  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.fullName.trim()) {
      newErrors.fullName = "Full name is required";
    } else if (formData.fullName.trim().length < 2) {
      newErrors.fullName = "Name must be at least 2 characters";
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email address is required";
    } else if (!emailRegex.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!formData.username.trim()) {
      newErrors.username = "Student/Staff ID is required";
    } else if (formData.username.length < 3) {
      newErrors.username = "ID must be at least 3 characters";
    } else if (!/^[a-zA-Z0-9_-]+$/.test(formData.username)) {
      newErrors.username =
        "ID can only contain letters, numbers, hyphens, and underscores";
    }

    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 8) {
      newErrors.password = "Password must be at least 8 characters";
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.password)) {
      newErrors.password = "Must contain uppercase, lowercase, and number";
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = "Please confirm your password";
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    if (!formData.role) {
      newErrors.role = "Please select your role";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  const handleInputChange = useCallback(
    (field: keyof FormData) => (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setFormData((prev) => ({ ...prev, [field]: value }));
      if (errors[field]) {
        setErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    },
    [errors]
  );

  const handleRoleChange = useCallback(
    (role: string) => {
      setFormData((prev) => ({ ...prev, role }));
      if (errors.role) {
        setErrors((prev) => ({ ...prev, role: undefined }));
      }
    },
    [errors]
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isOnline) {
      setErrors({ general: "No internet connection. Please try again." });
      return;
    }
    if (!validateForm()) return;

    setIsLoading(true);
    setErrors({});

    try {
      // Backend: call /auth/register
      const signUpData = {
        username: formData.username.trim(),
        password: formData.password,
        role: formData.role,
        email: formData.email.trim(),
        full_name: formData.fullName.trim(),
      };

      await signUp(signUpData);

      // After successful registration, redirect to Sign In
      setSuccessMessage(
        "Account created successfully! Redirecting to sign in..."
      );
      setTimeout(() => navigate("/signin"), 1200);
    } catch (error) {
      const apiError = error as ApiError;
      let msg = "Registration failed. Please try again.";

      if (apiError.response?.status === 409) {
        msg = "Username or email already exists";
      } else if (apiError.response?.status === 422) {
        msg = "Invalid registration data";
      } else if (apiError.response?.status === 429) {
        msg = "Too many attempts. Try later.";
      } else if (apiError.response?.data?.detail) {
        msg = apiError.response.data.detail;
      }

      setErrors({ general: msg });
    } finally {
      setIsLoading(false);
    }
  };

  const getPasswordStrengthInfo = () => {
    const colors = [
      "text-red-400",
      "text-orange-400",
      "text-yellow-400",
      "text-blue-400",
      "text-green-400",
    ];
    const labels = ["Very Weak", "Weak", "Fair", "Strong", "Very Strong"];
    return {
      color: colors[passwordStrength] || "text-gray-400",
      label: labels[passwordStrength] || "None",
    };
  };

  const strengthInfo = getPasswordStrengthInfo();

  return (
    <div className="min-h-screen relative overflow-hidden bg-gray-100">
      {/* Animated Background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gray-100/90" />
        <div className="absolute top-0 left-0 w-full h-full">
          <div className="absolute top-32 left-32 w-80 h-80 bg-gradient-to-r from-sky-300/30 to-sky-400/30 rounded-full blur-3xl animate-pulse" />
          <div
            className="absolute top-20 right-20 w-96 h-96 bg-gradient-to-r from-gray-200/20 to-gray-300/20 rounded-full blur-3xl animate-pulse"
            style={{ animationDelay: "1.5s" }}
          />
          <div
            className="absolute bottom-32 left-1/4 w-72 h-72 bg-gradient-to-r from-sky-300/30 to-sky-400/30 rounded-full blur-3xl animate-pulse"
            style={{ animationDelay: "0.7s" }}
          />
        </div>
        <div className="absolute inset-0">
          {[...Array(25)].map((_, i) => (
            <div
              key={i}
              className={`absolute rounded-full animate-pulse ${
                i % 3 === 0
                  ? "w-2 h-2 bg-gray-300/40"
                  : i % 3 === 1
                  ? "w-1 h-1 bg-sky-300/40"
                  : "w-1.5 h-1.5 bg-gray-300/35"
              }`}
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 4}s`,
                animationDuration: `${3 + Math.random() * 3}s`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Header */}
      <div className="relative z-10 bg-gray-100/10 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 group">
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-r from-sky-400 to-sky-600 rounded-2xl flex items-center justify-center shadow-2xl transform transition-all duration-300 group-hover:scale-110 group-hover:rotate-6">
                  <Stethoscope className="w-8 h-8 text-white" />
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-r from-sky-400 to-sky-600 rounded-full animate-ping" />
              </div>
              <div>
                <h1 className="text-2xl font-black bg-gradient-to-r from-gray-700 via-gray-900 to-black bg-clip-text text-transparent">
                  DentalEd Portal
                </h1>
                <p className="text-sm text-gray-700 font-medium">
                  Advanced Student Management System
                </p>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-3">
              <div
                className={`w-3 h-3 rounded-full ${
                  isOnline ? "bg-sky-400" : "bg-red-400"
                } animate-pulse`}
              />
              <span className="text-sm text-gray-700 font-medium">
                {isOnline ? "Online" : "Offline"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex items-center justify-center px-6 py-12 min-h-screen">
        <div
          className={`w-full max-w-lg transform transition-all duration-1000 ${
            isFormVisible
              ? "translate-y-0 opacity-100"
              : "translate-y-8 opacity-0"
          }`}
        >
          {/* Welcome Section */}
          <div className="text-center mb-10">
            <div className="relative group mb-8">
              <div className="w-24 h-24 bg-gradient-to-r from-sky-400 to-sky-600 rounded-3xl flex items-center justify-center mx-auto shadow-2xl transform transition-all duration-500 group-hover:scale-110 group-hover:rotate-12">
                <UserPlus className="w-12 h-12 text-white" />
              </div>
              <div className="absolute -inset-4 bg-gradient-to-r from-sky-400/20 to-sky-500/20 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-yellow-300 animate-pulse" />
              <Crown
                className="absolute -top-2 -left-2 w-6 h-6 text-amber-300 animate-pulse"
                style={{ animationDelay: "0.5s" }}
              />
            </div>
            <h2 className="text-4xl font-black bg-gradient-to-r from-gray-700 via-gray-900 to-black bg-clip-text text-transparent mb-4 tracking-tight">
              Join DentalEd
            </h2>
            <p className="text-gray-700 text-lg font-medium">
              Create your account to manage dental coursework
            </p>
          </div>

          {/* Form Card */}
          <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl shadow-2xl border border-gray-300 p-8 space-y-6 transform transition-all duration-500 hover:scale-[1.02]">
            {/* Navigation Tabs */}
            <div className="grid grid-cols-2 rounded-2xl overflow-hidden border border-gray-300 bg-gray-100/50 mb-6">
              <button
                onClick={() => navigate("/signin")}
                className="text-center py-4 font-bold transition-all duration-300 relative overflow-hidden text-gray-800 hover:text-gray-900 hover:bg-gray-100/70"
              >
                <span className="relative z-10">Sign In</span>
              </button>
              <button className="text-center py-4 font-bold transition-all duration-300 relative overflow-hidden text-white bg-gradient-to-r from-sky-600 to-sky-800 shadow-lg">
                <span className="relative z-10">Sign Up</span>
                <div className="absolute inset-0 bg-gradient-to-r from-sky-400/20 to-sky-500/20 animate-pulse" />
              </button>
            </div>

            {/* Success Message */}
            {successMessage && (
              <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-sky-100/50 to-sky-200/50 border border-sky-300/70 rounded-2xl backdrop-blur-sm animate-bounce">
                <CheckCircle className="h-6 w-6 text-sky-500" />
                <div>
                  <p className="text-sm font-bold text-sky-800">Success!</p>
                  <p className="text-sm text-sky-700">{successMessage}</p>
                </div>
              </div>
            )}

            {/* Error Message */}
            {errors.general && (
              <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-red-500/20 to-pink-500/20 border border-red-400/30 rounded-2xl backdrop-blur-sm animate-pulse">
                <AlertCircle className="h-6 w-6 text-red-400" />
                <div>
                  <p className="text-sm font-bold text-red-700">
                    Registration Error
                  </p>
                  <p className="text-sm text-red-600">{errors.general}</p>
                </div>
              </div>
            )}

            {/* Offline Warning */}
            {!isOnline && (
              <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-400/30 rounded-2xl backdrop-blur-sm animate-pulse">
                <AlertCircle className="h-6 w-6 text-amber-400" />
                <div>
                  <p className="text-sm font-bold text-amber-700">
                    Connection Issue
                  </p>
                  <p className="text-sm text-amber-600">
                    Please check your internet connection
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Full Name */}
              <div className="space-y-2">
                <label className="block text-sm font-bold text-gray-900">
                  Full Name <span className="text-sky-500">*</span>
                </label>
                <div className="relative group">
                  <input
                    ref={fullNameRef}
                    type="text"
                    value={formData.fullName}
                    onChange={handleInputChange("fullName")}
                    className={`w-full px-6 py-4 bg-gray-100/70 backdrop-blur-sm border rounded-2xl text-black placeholder-gray-400 transition-all duration-300 focus:outline-none focus:ring-2 transform hover:scale-[1.02] focus:scale-[1.02] ${
                      errors.fullName
                        ? "border-red-400/50 focus:ring-red-400/50 bg-red-500/10"
                        : "border-gray-300 focus:ring-sky-500/50 hover:border-gray-400"
                    }`}
                    placeholder="Enter your full name"
                    disabled={isLoading}
                    maxLength={100}
                  />
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-gray-300/0 via-gray-300/0 to-gray-100/0 group-hover:from-gray-300/10 group-hover:via-gray-300/10 group-hover:to-gray-100/10 transition-all duration-500 pointer-events-none" />
                </div>
                {errors.fullName && (
                  <p className="text-sm text-red-600 flex items-center gap-2 animate-pulse">
                    <AlertCircle className="w-4 h-4" />
                    {errors.fullName}
                  </p>
                )}
              </div>

              {/* Email */}
              <div className="space-y-2">
                <label className="block text-sm font-bold text-gray-900">
                  Email Address <span className="text-sky-500">*</span>
                </label>
                <div className="relative group">
                  <input
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange("email")}
                    className={`w-full px-6 py-4 bg-gray-100/70 backdrop-blur-sm border rounded-2xl text-black placeholder-gray-400 transition-all duration-300 focus:outline-none focus:ring-2 transform hover:scale-[1.02] focus:scale-[1.02] ${
                      errors.email
                        ? "border-red-400/50 focus:ring-red-400/50 bg-red-500/10"
                        : "border-gray-300 focus:ring-sky-500/50 hover:border-gray-400"
                    }`}
                    placeholder="Enter your email address"
                    disabled={isLoading}
                    maxLength={100}
                  />
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-gray-300/0 via-gray-300/0 to-gray-100/0 group-hover:from-gray-300/10 group-hover:via-gray-300/10 group-hover:to-gray-100/10 transition-all duration-500 pointer-events-none" />
                </div>
                {errors.email && (
                  <p className="text-sm text-red-600 flex items-center gap-2 animate-pulse">
                    <AlertCircle className="w-4 h-4" />
                    {errors.email}
                  </p>
                )}
              </div>

              {/* Username */}
              <div className="space-y-2">
                <label className="block text-sm font-bold text-gray-900">
                  Student/Staff ID <span className="text-sky-500">*</span>
                </label>
                <div className="relative group">
                  <input
                    type="text"
                    value={formData.username}
                    onChange={handleInputChange("username")}
                    className={`w-full px-6 py-4 bg-gray-100/70 backdrop-blur-sm border rounded-2xl text-black placeholder-gray-400 transition-all duration-300 focus:outline-none focus:ring-2 transform hover:scale-[1.02] focus:scale-[1.02] ${
                      errors.username
                        ? "border-red-400/50 focus:ring-red-400/50 bg-red-500/10"
                        : "border-gray-300 focus:ring-sky-500/50 hover:border-gray-400"
                    }`}
                    placeholder="Enter your unique ID"
                    disabled={isLoading}
                    maxLength={50}
                  />
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-gray-300/0 via-gray-300/0 to-gray-100/0 group-hover:from-gray-300/10 group-hover:via-gray-300/10 group-hover:to-gray-100/10 transition-all duration-500 pointer-events-none" />
                </div>
                {errors.username && (
                  <p className="text-sm text-red-600 flex items-center gap-2 animate-pulse">
                    <AlertCircle className="w-4 h-4" />
                    {errors.username}
                  </p>
                )}
              </div>

              {/* Role Selection */}
              <div className="space-y-3">
                <label className="block text-sm font-bold text-gray-900">
                  Account Type <span className="text-sky-500">*</span>
                </label>
                <div className="grid grid-cols-1 gap-3">
                  {roleOptions.map((option) => {
                    const IconComponent = option.icon;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleRoleChange(option.value)}
                        className={`flex items-center gap-4 p-4 border-2 rounded-2xl cursor-pointer transition-all duration-300 transform hover:scale-[1.02] group text-left w-full ${
                          formData.role === option.value
                            ? `border-sky-400/30 bg-gradient-to-r from-sky-500/20 to-sky-600/20 shadow-lg ring-2 ring-sky-100/10`
                            : "border-gray-300 bg-gray-100/50 hover:border-gray-400 hover:bg-gray-200/70"
                        }`}
                        disabled={isLoading}
                      >
                        <div
                          className={`w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-r ${
                            option.value === "student"
                              ? "from-sky-500 to-sky-600"
                              : "from-sky-700 to-sky-800"
                          } shadow-lg transform transition-all duration-300 group-hover:scale-110`}
                        >
                          <IconComponent className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold text-sky-900">
                            {option.label}
                          </h3>
                          <p className="text-sm text-gray-700 mt-0.5">
                            {option.description}
                          </p>
                        </div>
                        {formData.role === option.value && (
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-6 h-6 text-sky-500 animate-pulse" />
                            <Star className="w-4 h-4 text-yellow-300 animate-pulse" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                {errors.role && (
                  <p className="text-sm text-red-600 flex items-center gap-2 animate-pulse">
                    <AlertCircle className="w-4 h-4" />
                    {errors.role}
                  </p>
                )}
              </div>

              {/* Password Fields */}
              <div className="grid grid-cols-1 gap-6">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-gray-900">
                    Password <span className="text-sky-500">*</span>
                  </label>
                  <div className="relative group">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={handleInputChange("password")}
                      className={`w-full px-6 py-4 pr-14 bg-gray-100/70 backdrop-blur-sm border rounded-2xl text-black placeholder-gray-400 transition-all duration-300 focus:outline-none focus:ring-2 transform hover:scale-[1.02] focus:scale-[1.02] ${
                        errors.password
                          ? "border-red-400/50 focus:ring-red-400/50 bg-red-500/10"
                          : "border-gray-300 focus:ring-sky-500/50 hover:border-gray-400"
                      }`}
                      placeholder="Create strong password"
                      disabled={isLoading}
                      maxLength={100}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-all duration-300 p-2 rounded-xl hover:bg-gray-100/50 transform hover:scale-110"
                      disabled={isLoading}
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-gray-300/0 via-gray-300/0 to-gray-100/0 group-hover:from-gray-300/10 group-hover:via-gray-300/10 group-hover:to-gray-100/10 transition-all duration-500 pointer-events-none" />
                  </div>
                  {formData.password && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-700">
                          Password Strength:
                        </span>
                        <span
                          className={`text-xs font-bold ${strengthInfo.color}`}
                        >
                          {strengthInfo.label}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200/50 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ${
                            passwordStrength >= 4
                              ? "bg-gradient-to-r from-green-400 to-emerald-500"
                              : passwordStrength >= 3
                              ? "bg-gradient-to-r from-sky-400 to-sky-500"
                              : passwordStrength >= 2
                              ? "bg-gradient-to-r from-yellow-400 to-amber-500"
                              : passwordStrength >= 1
                              ? "bg-gradient-to-r from-orange-400 to-red-500"
                              : "bg-gradient-to-r from-red-500 to-red-600"
                          }`}
                          style={{ width: `${(passwordStrength / 5) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {errors.password && (
                    <p className="text-sm text-red-600 flex items-center gap-2 animate-pulse">
                      <AlertCircle className="w-4 h-4" />
                      {errors.password}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-bold text-gray-900">
                    Confirm Password <span className="text-sky-500">*</span>
                  </label>
                  <div className="relative group">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      value={formData.confirmPassword}
                      onChange={handleInputChange("confirmPassword")}
                      className={`w-full px-6 py-4 pr-14 bg-gray-100/70 backdrop-blur-sm border rounded-2xl text-black placeholder-gray-400 transition-all duration-300 focus:outline-none focus:ring-2 transform hover:scale-[1.02] focus:scale-[1.02] ${
                        errors.confirmPassword
                          ? "border-red-400/50 focus:ring-red-400/50 bg-red-500/10"
                          : "border-gray-300 focus:ring-sky-500/50 hover:border-gray-400"
                      }`}
                      placeholder="Confirm password"
                      disabled={isLoading}
                      maxLength={100}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-all duration-300 p-2 rounded-xl hover:bg-gray-100/50 transform hover:scale-110"
                      disabled={isLoading}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-gray-300/0 via-gray-300/0 to-gray-100/0 group-hover:from-gray-300/10 group-hover:via-gray-300/10 group-hover:to-gray-100/10 transition-all duration-500 pointer-events-none" />
                  </div>
                  {errors.confirmPassword && (
                    <p className="text-sm text-red-600 flex items-center gap-2 animate-pulse">
                      <AlertCircle className="w-4 h-4" />
                      {errors.confirmPassword}
                    </p>
                  )}
                </div>
              </div>

              {/* Password Requirements */}
              <div className="bg-gray-100/50 backdrop-blur-sm border border-gray-200 rounded-2xl p-4">
                <p className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Password Requirements:
                </p>
                <ul className="text-xs text-gray-700 space-y-1 ml-6">
                  <li className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        formData.password.length >= 8
                          ? "bg-green-400"
                          : "bg-gray-300"
                      }`}
                    />
                    At least 8 characters long
                  </li>
                  <li className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        /[A-Z]/.test(formData.password)
                          ? "bg-green-400"
                          : "bg-gray-300"
                      }`}
                    />
                    Contains uppercase letter
                  </li>
                  <li className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        /[a-z]/.test(formData.password)
                          ? "bg-green-400"
                          : "bg-gray-300"
                      }`}
                    />
                    Contains lowercase letter
                  </li>
                  <li className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        /[0-9]/.test(formData.password)
                          ? "bg-green-400"
                          : "bg-gray-300"
                      }`}
                    />
                    Contains at least one number
                  </li>
                </ul>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={
                  isLoading ||
                  !formData.username.trim() ||
                  !formData.password ||
                  !formData.email.trim() ||
                  !formData.fullName.trim() ||
                  !isOnline
                }
                className="group relative w-full bg-gradient-to-r from-sky-600 via-sky-700 to-sky-800 hover:from-sky-500 hover:via-sky-600 hover:to-sky-700 disabled:from-gray-300 disabled:via-gray-400 disabled:to-gray-300 disabled:cursor-not-allowed text-white font-bold py-5 px-6 rounded-2xl transition-all duration-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:ring-offset-2 focus:ring-offset-transparent flex items-center justify-center gap-3 shadow-2xl hover:shadow-sky-500/25 transform hover:-translate-y-1 hover:scale-[1.02] active:scale-[0.98] disabled:transform-none overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-sky-400/20 via-sky-500/20 to-sky-600/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                {isLoading && <Loader2 className="h-6 w-6 animate-spin" />}
                <UserPlus className="h-6 w-6 transition-transform duration-300 group-hover:scale-110" />
                <span className="text-lg font-black relative z-10">
                  {isLoading ? "Creating Account..." : "Create Account"}
                </span>
                {!isLoading && (
                  <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
                )}
              </button>
            </form>

            {/* Sign In Link */}
            <p className="text-center text-gray-900">
              Already have an account?{" "}
              <button
                onClick={() => navigate("/signin")}
                className="font-bold text-transparent bg-gradient-to-r from-sky-600 to-sky-800 bg-clip-text hover:from-sky-500 hover:to-sky-700 transition-all duration-300 underline decoration-sky-600/50 underline-offset-4 transform hover:scale-105 inline-block cursor-pointer"
              >
                Sign in here
              </button>
            </p>
          </div>

          {/* Footer */}
          <div className="mt-10 text-center">
            <p className="text-xs text-gray-700 font-medium">
              © 2025 Dental Education Portal • Secure • Advanced • Innovative
            </p>
          </div>

          {/* Demo Note (UI parity; text only) */}
          <div className="mt-6 p-4 bg-gray-100/50 backdrop-blur-sm border border-gray-200 rounded-xl">
            <p className="text-xs text-gray-700 text-center">
              <strong>Note:</strong> After creating an account you’ll be
              redirected to sign in.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
