import { useState, useEffect, useRef, useCallback } from "react";
import {
  NavLink,
  Link,
  useNavigate,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import {
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  BookOpen,
  CheckCircle,
  Shield,
  LogIn,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { api } from "../../lib/api";
import { setToken, setUser } from "../../lib/auth";
import { getRoleFromToken } from "../../lib/auth";

// Types
interface FormData {
  username: string;
  password: string;
}

interface FormErrors {
  username?: string;
  password?: string;
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

export default function SignIn(): React.ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();

  const [formData, setFormData] = useState<FormData>({
    username: "",
    password: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [successMessage, setSuccessMessage] = useState<string>("");
  const [isFormVisible, setIsFormVisible] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);

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
    const t = setTimeout(() => usernameRef.current?.focus(), 500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!successMessage) return;
    const t = setTimeout(() => setSuccessMessage(""), 5000);
    return () => clearTimeout(t);
  }, [successMessage]);

  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {};
    if (!formData.username.trim())
      newErrors.username = "Student ID is required";
    else if (formData.username.length < 3)
      newErrors.username = "Student ID must be at least 3 characters";
    else if (!/^[a-zA-Z0-9_-]+$/.test(formData.username.trim()))
      newErrors.username = "Only letters, numbers, hyphens, underscores";
    if (!formData.password) newErrors.password = "Password is required";
    else if (formData.password.length < 6)
      newErrors.password = "Password must be at least 6 characters";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  const handleInputChange = useCallback(
    (field: keyof FormData) => (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setFormData((prev) => ({ ...prev, [field]: value }));
      if (errors[field])
        setErrors((prev) => ({
          ...prev,
          [field]: undefined,
          general: undefined,
        }));
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
      // Backend: /auth/login expects form-urlencoded
      const form = new URLSearchParams();
      form.append("username", formData.username.trim());
      form.append("password", formData.password);

      const { data } = await api.post("/auth/login", form, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      console.log("Login API response data:", data); // Added log

      if (!data?.access_token) throw new Error("No access token received");

      // Persist token
      setToken(data.access_token);

      // Optional remember flag
      try {
        localStorage.setItem("remember_me", rememberMe ? "1" : "0");
      } catch {}

      // ---- Fetch current user & cache for role-based guards ----
      const me = await api.get("/auth/me");
      console.log("Current user data from /auth/me:", me.data); // Added log
      setUser(me.data);

      // ---- Compute redirect target ----
      const next = params.get("next");
      const roleFromMe = String(me.data?.role || "").toLowerCase();
      const role = (
        roleFromMe ||
        getRoleFromToken(data.access_token) ||
        ""
      ).toLowerCase();
      console.log("Determined user role:", role); // Added log

      // Use your actual existing routes:
      const target =
        next && !["/", "/signin", "/signup"].includes(next)
          ? next
          : role === "doctor" || role === "admin" || role === "instructor"
          ? "/instructor/dashboard"
          : "/student/dashboard";
      console.log("Redirect target:", target); // Added log

      setSuccessMessage("Successfully signed in! Redirecting...");
      setTimeout(() => {
        console.log("Navigating to:", target); // Added log
        navigate(target, { replace: true });
      }, 800);
    } catch (error) {
      console.error("Login process error:", error); // Modified log
      const apiError = error as ApiError;
      let msg = "Login failed. Please try again.";
      if (apiError.response?.status === 401)
        msg = "Invalid student ID or password.";
      else if (apiError.response?.status === 403)
        msg = "Your account is disabled.";
      else if (apiError.response?.status === 429)
        msg = "Too many attempts. Try again later.";
      else if (apiError.response?.status === 500)
        msg = "Server error. Try again later.";
      else if (apiError.response?.data?.detail)
        msg = apiError.response.data.detail;
      else if (apiError.response?.data?.message)
        msg = apiError.response.data.message;
      setErrors({ general: msg });
      setTimeout(() => usernameRef.current?.focus(), 100);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-gray-100">
      {/* Animated Gradient Background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gray-100/90" />
        <div className="absolute top-0 left-0 w-full h-full">
          <div className="absolute top-20 left-20 w-72 h-72 bg-gradient-to-r from-sky-300/30 to-sky-400/30 rounded-full blur-3xl animate-pulse" />
          <div
            className="absolute top-40 right-40 w-96 h-96 bg-gradient-to-r from-gray-200/20 to-gray-300/20 rounded-full blur-3xl animate-pulse"
            style={{ animationDelay: "1000ms" }}
          />
          <div
            className="absolute bottom-20 left-1/3 w-80 h-80 bg-gradient-to-r from-sky-300/25 to-sky-400/25 rounded-full blur-3xl animate-pulse"
            style={{ animationDelay: "500ms" }}
          />
        </div>
        {/* Floating Particles */}
        <div className="absolute inset-0">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-gray-300/40 rounded-full animate-pulse"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${2 + Math.random() * 2}s`,
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
                  <BookOpen className="w-8 h-8 text-white" />
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-r from-sky-400 to-sky-600 rounded-full animate-ping" />
              </div>
              <div>
                <h1 className="text-2xl font-black bg-gradient-to-r from-gray-700 via-gray-900 to-black bg-clip-text text-transparent">
                  Course Management System
                </h1>
                <p className="text-sm text-gray-700 font-medium">
                  Advanced Learning Platform
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
                {isOnline ? "Connected" : "Offline"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex items-center justify-center px-6 py-16 min-h-screen">
        <div
          className={`w-full max-w-md transform transition-all duration-1000 ${
            isFormVisible
              ? "translate-y-0 opacity-100"
              : "translate-y-8 opacity-0"
          }`}
        >
          {/* Welcome Section */}
          <div className="text-center mb-10">
            <div className="relative group mb-8">
              <div className="w-24 h-24 bg-gradient-to-r from-sky-400 to-sky-600 rounded-3xl flex items-center justify-center mx-auto shadow-2xl transform transition-all duration-500 group-hover:scale-110 group-hover:rotate-12">
                <LogIn className="w-12 h-12 text-white" />
              </div>
              <div className="absolute -inset-4 bg-gradient-to-r from-sky-400/20 to-sky-500/20 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-yellow-300 animate-pulse" />
            </div>
            <h2 className="text-4xl font-black bg-gradient-to-r from-gray-700 via-gray-900 to-black bg-clip-text text-transparent mb-4 tracking-tight">
              Welcome Back
            </h2>
            <p className="text-gray-700 text-lg font-medium">
              Access your course dashboard
            </p>
          </div>

          {/* Form Card */}
          <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl shadow-2xl border border-gray-300 p-8 space-y-6 transform transition-all duration-500 hover:scale-[1.02]">
            {/* Navigation Tabs */}
            <div className="grid grid-cols-2 rounded-2xl overflow-hidden border border-gray-300 bg-gray-100/50 mb-6">
              <NavLink
                to="/signin"
                className={({ isActive }) =>
                  "text-center py-4 font-bold transition-all duration-300 relative overflow-hidden " +
                  (isActive
                    ? "text-white bg-gradient-to-r from-sky-600 to-sky-800 shadow-lg"
                    : "text-gray-800 hover:text-gray-900 hover:bg-gray-100/70")
                }
              >
                <span className="relative z-10">Sign In</span>
                {window.location.pathname === "/signin" && (
                  <div className="absolute inset-0 bg-gradient-to-r from-sky-400/20 to-sky-500/20 animate-pulse" />
                )}
              </NavLink>
              <NavLink
                to="/signup"
                className={({ isActive }) =>
                  "text-center py-4 font-bold transition-all duration-300 relative overflow-hidden " +
                  (isActive
                    ? "text-white bg-gradient-to-r from-sky-600 to-sky-800 shadow-lg"
                    : "text-gray-800 hover:text-gray-900 hover:bg-gray-100/70")
                }
              >
                <span className="relative z-10">Sign Up</span>
              </NavLink>
            </div>

            {/* Success Message */}
            {successMessage && (
              <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-sky-100/50 to-sky-200/50 border border-sky-300/70 rounded-2xl backdrop-blur-sm animate-pulse">
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
                    Authentication Error
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
              {/* Username Field */}
              <div className="space-y-2">
                <label className="block text-sm font-bold text-gray-900">
                  Student ID / Username <span className="text-sky-500">*</span>
                </label>
                <div className="relative group">
                  <input
                    ref={usernameRef}
                    type="text"
                    value={formData.username}
                    onChange={handleInputChange("username")}
                    className={`w-full px-6 py-4 bg-gray-100/70 backdrop-blur-sm border rounded-2xl text-black placeholder-gray-400 transition-all duration-300 focus:outline-none focus:ring-2 transform hover:scale-[1.02] focus:scale-[1.02] ${
                      errors.username
                        ? "border-red-400/50 focus:ring-red-400/50 bg-red-500/10"
                        : "border-gray-300 focus:ring-sky-500/50 hover:border-gray-400"
                    }`}
                    placeholder="Enter your student ID"
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

              {/* Password Field */}
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
                    placeholder="Enter your password"
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
                      <EyeOff className="h-5 h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-gray-300/0 via-gray-300/0 to-gray-100/0 group-hover:from-gray-300/10 group-hover:via-gray-300/10 group-hover:to-gray-100/10 transition-all duration-500 pointer-events-none" />
                </div>
                {errors.password && (
                  <p className="text-sm text-red-600 flex items-center gap-2 animate-pulse">
                    <AlertCircle className="w-4 h-4" />
                    {errors.password}
                  </p>
                )}
              </div>

              {/* Remember Me & Forgot Password */}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-3 text-sm text-gray-900 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-5 h-5 text-sky-500 bg-gray-100/50 border-gray-300 rounded-lg focus:ring-sky-500/50 focus:ring-2 transition-all duration-300 transform group-hover:scale-110"
                    disabled={isLoading}
                  />
                  <span className="select-none font-medium group-hover:text-gray-800 transition-colors duration-300">
                    Remember me
                  </span>
                </label>
                <button
                  type="button"
                  className="text-sm text-gray-600 hover:text-gray-800 font-medium underline decoration-gray-600/50 underline-offset-4 hover:decoration-gray-800 transition-all duration-300"
                >
                  Forgot password?
                </button>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={
                  isLoading ||
                  !formData.username.trim() ||
                  !formData.password ||
                  !isOnline
                }
                className="group relative w-full bg-gradient-to-r from-sky-600 via-sky-700 to-sky-800 hover:from-sky-500 hover:via-sky-600 hover:to-sky-700 disabled:from-gray-300 disabled:via-gray-400 disabled:to-gray-300 disabled:cursor-not-allowed text-white font-bold py-5 px-6 rounded-2xl transition-all duration-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:ring-offset-2 focus:ring-offset-transparent flex items-center justify-center gap-3 shadow-2xl hover:shadow-sky-500/25 transform hover:-translate-y-1 hover:scale-[1.02] active:scale-[0.98] disabled:transform-none overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-sky-400/20 via-sky-500/20 to-sky-600/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                {isLoading && <Loader2 className="h-6 w-6 animate-spin" />}
                <Shield className="h-6 w-6 transition-transform duration-300 group-hover:scale-110" />
                <span className="text-lg font-black relative z-10">
                  {isLoading ? "Signing In..." : "Access Portal"}
                </span>
                {!isLoading && (
                  <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
                )}
              </button>
            </form>

            {/* Sign Up Link */}
            <p className="text-center text-gray-900">
              Don't have an account?{" "}
              <Link
                to="/signup"
                className="font-bold text-transparent bg-gradient-to-r from-sky-600 to-sky-800 bg-clip-text hover:from-sky-500 hover:to-sky-700 transition-all duration-300 underline decoration-sky-600/50 underline-offset-4"
              >
                Sign up here
              </Link>
            </p>
          </div>

          {/* Footer */}
          <div className="mt-10 text-center">
            <p className="text-xs text-gray-700 font-medium">
              © 2025 Course Management System • Secure • Advanced • Innovative
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
