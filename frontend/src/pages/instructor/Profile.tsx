import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Mail,
  Phone,
  Calendar,
  Award,
  FileText,
  CheckCircle,
  Edit,
  Settings,
  Star,
  Activity,
  Bell,
  GraduationCap,
  Stethoscope,
  Crown,
  Sparkles,
  LogOut,
  MapPin,
  CreditCard,
  ChevronRight,
  Users,
  Shield,
  BarChart3,
} from "lucide-react";

import { signOut, getUser } from "../../lib/auth";
import {
  getInstructorProfile,
  getInstructorStats,
  getInstructorRecentActivity,
} from "../../lib/api";

interface InstructorProfile {
  id?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  specialization?: string;
  department?: string;
  licenseNumber?: string;
  yearsOfExperience?: number;
  education?: string;
  certifications?: string[];
  address?: string;
  joinDate?: string;
  role?: string;
  status?: string;
}

interface InstructorStats {
  totalPatients?: number;
  activePatients?: number;
  completedTreatments?: number;
  pendingAppointments?: number;
  averageRating?: number;
  totalReviews?: number;
}

interface RecentActivity {
  id: number;
  type: string; // e.g., 'appointment', 'review', 'treatment', 'patient'
  description: string;
  time: string;
  icon: any;
  color: string;
}

export default function InstructorProfile() {
  const navigate = useNavigate();
  const [isAnimated, setIsAnimated] = useState(false);

  // State for real data
  const [instructorProfile, setInstructorProfile] =
    useState<InstructorProfile | null>(null);
  const [instructorStats, setInstructorStats] =
    useState<InstructorStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [educations, setEducations] = useState<any[]>([]);
  const [certifications, setCertifications] = useState<any[]>([]);
  const [profileData, setProfileData] = useState({
    phone: "Not provided",
    joinDate: "Not available",
    license: "Not provided",
    specialization: "General Instruction",
    department: "Education",
  });

  // Get current user info from auth
  const currentUser = getUser();

  // Load instructor profile data
  const loadInstructorData = useCallback(async () => {
    try {
      setLoading(true);

      // Load profile, stats, and recent activity in parallel
      const [profileResponse, statsResponse, activityResponse] =
        await Promise.allSettled([
          getInstructorProfile(),
          getInstructorStats(),
          getInstructorRecentActivity(),
        ]);

      // Handle profile data
      if (profileResponse.status === "fulfilled") {
        const p = profileResponse.value.data || {};
        setInstructorProfile(p);
        // Map extended fields to local state for display
        setEducations(Array.isArray(p.education) ? p.education : []);
        setCertifications(Array.isArray(p.certifications) ? p.certifications : []);
        setProfileData({
          phone: p.phone || "Not provided",
          joinDate: p.joinDate || "Not available",
          license: p.licenseNumber || "Not provided",
          specialization: p.specialization || "General Instruction",
          department: p.department || "Education",
        });
      } else {
        console.error(
          "Failed to load instructor profile:",
          profileResponse.reason
        );
      }

      // Handle stats data
      if (statsResponse.status === "fulfilled") {
        setInstructorStats(statsResponse.value.data);
      } else {
        console.error("Failed to load instructor stats:", statsResponse.reason);
      }

      // Handle activity data
      if (activityResponse.status === "fulfilled") {
        const mappedActivity: RecentActivity[] =
          activityResponse.value.data.map((item: any) => ({
            id: item.id,
            type: item.type,
            description: item.description,
            time: item.timestamp,
            icon: getActivityIcon(item.type),
            color: getActivityColor(item.type),
          }));
        setRecentActivity(mappedActivity);
      } else {
        console.error(
          "Failed to load recent activity:",
          activityResponse.reason
        );
      }
      // No localStorage usage anymore
    } catch (error) {
      console.error("Error loading instructor data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInstructorData();
    const timer = setTimeout(() => {
      setIsAnimated(true);
    }, 100);
    return () => clearTimeout(timer);
  }, [loadInstructorData]);

  // Refresh data when component becomes visible (e.g., returning from edit page)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        refreshProfileData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // No cross-tab events needed now that we use API

  // Function to refresh profile data
  const refreshProfileData = async () => {
    try {
      const res = await getInstructorProfile();
      const p = res.data || {};
      setInstructorProfile(p);
      setEducations(Array.isArray(p.education) ? p.education : []);
      setCertifications(Array.isArray(p.certifications) ? p.certifications : []);
      setProfileData({
        phone: p.phone || "Not provided",
        joinDate: p.joinDate || "Not available",
        license: p.licenseNumber || "Not provided",
        specialization: p.specialization || "General Instruction",
        department: p.department || "Education",
      });
      console.log("Profile data refreshed from server");
    } catch (e) {
      console.error("Failed to refresh profile from server", e);
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "appointment":
        return Calendar;
      case "review":
        return Star;
      case "treatment":
        return Stethoscope;
      case "patient":
        return Users;
      default:
        return Activity;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case "appointment":
        return "text-emerald-500";
      case "review":
        return "text-amber-500";
      case "treatment":
        return "text-sky-500";
      case "patient":
        return "text-indigo-500";
      default:
        return "text-gray-500";
    }
  };

  // Fallback to current user data if profile data is not available
  const displayProfile = {
    fullName:
      instructorProfile?.fullName ||
      currentUser?.full_name ||
      currentUser?.username ||
      "Instructor",
    email: instructorProfile?.email || currentUser?.email || "Not provided",
    role: instructorProfile?.role || currentUser?.role || "Instructor",
    specialization: instructorProfile?.specialization || "General Instruction",
    department: instructorProfile?.department || "Education",
    id: instructorProfile?.id || currentUser?.id || "N/A",
    phone: instructorProfile?.phone || "Not provided",
    address: instructorProfile?.address || "Not provided",
    joinDate: instructorProfile?.joinDate || "Not available",
    licenseNumber: instructorProfile?.licenseNumber || "Not provided",
    yearsOfExperience: instructorProfile?.yearsOfExperience || 0,
    education: instructorProfile?.education || "Not provided",
    certifications: instructorProfile?.certifications || [],
  };

  const displayStats = instructorStats || {
    totalPatients: 0,
    activePatients: 0,
    completedTreatments: 0,
    pendingAppointments: 0,
    averageRating: 0,
    totalReviews: 0,
  };

  if (loading) {
    return (
      <div className="min-h-screen relative overflow-hidden bg-gray-200 flex items-center justify-center">
        <div className="text-gray-900 text-center">
          <div className="w-16 h-16 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-lg font-medium">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-gray-200 text-gray-900">
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gray-200/90" />
        <div className="absolute top-0 left-0 w-full h-full">
          <div className="absolute top-20 left-20 w-72 h-72 bg-gradient-to-r from-sky-300/30 to-sky-400/30 rounded-full blur-3xl animate-pulse" />
          <div
            className="absolute top-40 right-40 w-96 h-96 bg-gradient-to-r from-gray-300/20 to-gray-400/20 rounded-full blur-3xl animate-pulse"
            style={{ animationDelay: "1000ms" }}
          />
          <div
            className="absolute bottom-20 left-1/3 w-80 h-80 bg-gradient-to-r from-sky-300/25 to-sky-400/25 rounded-full blur-3xl animate-pulse"
            style={{ animationDelay: "500ms" }}
          />
        </div>
      </div>

      {/* Header */}
      <div className="relative z-10 bg-gray-200/10 backdrop-blur-md border-b border-gray-300">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 group">
              <div className="relative">
                <button
                  onClick={() => navigate("/instructor/dashboard")}
                  className="w-14 h-14 bg-gradient-to-r from-sky-400 to-sky-600 rounded-2xl flex items-center justify-center shadow-2xl transform transition-all duration-300 group-hover:scale-110 group-hover:rotate-6 focus:outline-none"
                  title="Go to Dashboard"
                >
                  <GraduationCap className="w-8 h-8 text-white" />
                </button>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-r from-sky-400 to-sky-600 rounded-full animate-ping" />
              </div>
              <div>
                <h1 className="text-2xl font-black bg-gradient-to-r from-gray-800 via-gray-900 to-black bg-clip-text text-transparent">
                  Course Management System
                </h1>
                <p className="text-gray-800 font-medium">Instructor Profile</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate("/instructor/account-settings")}
                className="flex items-center gap-2 p-2 text-gray-800 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-300/70"
                title="Edit Basic Profile Data"
              >
                <Edit className="w-5 h-5" />
                Edit Profile
              </button>
              <button
                onClick={refreshProfileData}
                className="flex items-center gap-2 p-2 text-gray-800 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-300/70"
                title="Refresh Profile Data"
              >
                <Activity className="w-5 h-5" />
                Refresh
              </button>
              <button
                onClick={() => navigate("/instructor/dashboard")}
                className="flex items-center gap-2 p-2 text-gray-800 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-300/70"
              >
                <ArrowLeft className="w-5 h-5" />
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 py-8">
        {/* Profile Header Card */}
        <div
          className={`bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-8 mb-8 shadow-xl transform transition-all duration-1000 ${
            isAnimated ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
          }`}
          style={{ transitionDelay: "100ms" }}
        >
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <div className="w-24 h-24 bg-gradient-to-br from-sky-500 to-sky-600 rounded-full flex items-center justify-center text-white font-bold text-4xl shadow-lg flex-shrink-0">
              {displayProfile.fullName
                ? displayProfile.fullName
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()
                : "IN"}
            </div>
            <div className="flex-1 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-3 mb-2">
                <h2 className="text-3xl font-black text-gray-900">
                  {displayProfile.fullName}
                </h2>
                <span className="bg-sky-100 text-sky-800 text-sm font-medium px-3 py-1 rounded-full">
                  {displayProfile.role}
                </span>
              </div>
              <p className="text-gray-700 text-sm mb-4">
                ID: {displayProfile.id}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-gray-800 text-base mb-4">
                <div className="flex items-center gap-2">
                  <Mail className="w-5 h-5 text-gray-600" />
                  <span>{displayProfile.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Stethoscope className="w-5 h-5 text-gray-600" />
                  <span>{profileData.specialization}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-5 h-5 text-gray-600" />
                  <span>{profileData.phone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-gray-600" />
                  <span>{profileData.department}</span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-gray-800 text-base">
                <div className="flex items-center gap-2">
                  <Star className="w-5 h-5 text-yellow-500" />
                  <span>
                    {displayStats.averageRating || "0"}/5.0 (
                    {displayStats.totalReviews || "0"} reviews)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-gray-600" />
                  <span>Joined: {profileData.joinDate}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-gray-600" />
                  <span>
                    {displayProfile.yearsOfExperience} years experience
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-gray-600" />
                  <span>
                    License: {profileData.license}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Professional Information */}
          <div
            className={`lg:col-span-2 bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-8 shadow-xl transform transition-all duration-1000 ${
              isAnimated
                ? "translate-y-0 opacity-100"
                : "translate-y-8 opacity-0"
            }`}
            style={{ transitionDelay: "200ms" }}
          >
            <h3 className="text-xl font-black text-gray-900 mb-6 flex items-center gap-3">
              <Shield className="w-6 h-6 text-gray-800" />
              Professional Information
            </h3>
            <div className="space-y-6">
              {/* Education & Credentials */}
              <div className="bg-gray-50/70 rounded-xl p-4 border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                    <GraduationCap className="w-5 h-5 text-gray-700" /> Education
                    & Credentials {educations.length > 0 && `(${educations.length})`}
                  </h4>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={refreshProfileData}
                      className="flex items-center gap-1 px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                      title="Refresh Education Data"
                    >
                      <Activity className="w-4 h-4" />
                      Refresh
                    </button>
                    <button
                      onClick={() => navigate("/instructor/edit-education")}
                      className="flex items-center gap-1 px-3 py-1 text-sm bg-sky-100 text-sky-700 rounded-lg hover:bg-sky-200 transition-colors"
                    >
                      <Edit className="w-4 h-4" />
                      Edit
                    </button>
                  </div>
                </div>
                <div className="space-y-3">
                  {educations.length > 0 ? (
                    educations.map((edu, index) => (
                      <div key={index} className="bg-white/50 rounded-lg p-3 border border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="font-semibold text-gray-900">{edu.degree}</h5>
                          <span className="text-xs text-gray-500">{edu.year}</span>
                        </div>
                        <p className="text-sm text-gray-700 mb-1">{edu.institution}</p>
                        {edu.field && (
                          <p className="text-xs text-gray-600">Field: {edu.field}</p>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-gray-700 text-sm">
                          Education:{" "}
                          {displayProfile.education || "Education not provided"}
                        </p>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-gray-700 text-sm">
                          License:{" "}
                          {displayProfile.licenseNumber || "License not provided"}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Certifications */}
              <div className="bg-gray-50/70 rounded-xl p-4 border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                    <Award className="w-5 h-5 text-gray-700" /> Certifications {certifications.length > 0 && `(${certifications.length})`}
                  </h4>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={refreshProfileData}
                      className="flex items-center gap-1 px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                      title="Refresh Certifications Data"
                    >
                      <Activity className="w-4 h-4" />
                      Refresh
                    </button>
                    <button
                      onClick={() => navigate("/instructor/edit-education")}
                      className="flex items-center gap-1 px-3 py-1 text-sm bg-sky-100 text-sky-700 rounded-lg hover:bg-sky-200 transition-colors"
                    >
                      <Edit className="w-4 h-4" />
                      Edit
                    </button>
                  </div>
                </div>
                {certifications.length > 0 ? (
                  <div className="space-y-3">
                    {certifications.map((cert, index) => (
                      <div key={index} className="bg-white/50 rounded-lg p-3 border border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="font-semibold text-gray-900">{cert.name}</h5>
                          <span className="text-xs text-gray-500">{cert.year}</span>
                        </div>
                        <p className="text-sm text-gray-700 mb-1">{cert.issuer}</p>
                        {cert.credentialId && (
                          <p className="text-xs text-gray-600">ID: {cert.credentialId}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-700 text-sm">
                    No certifications listed
                  </p>
                )}
              </div>

            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-8">
            {/* Recent Activity */}
            <div
              className={`bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-8 shadow-xl transform transition-all duration-1000 ${
                isAnimated
                  ? "translate-y-0 opacity-100"
                  : "translate-y-8 opacity-0"
              }`}
              style={{ transitionDelay: "300ms" }}
            >
              <h3 className="text-xl font-black text-gray-900 mb-6 flex items-center gap-3">
                <Activity className="w-6 h-6 text-gray-800" />
                Recent Activity
              </h3>
              {recentActivity.length > 0 ? (
                <div className="space-y-4">
                  {recentActivity.map((activity) => {
                    const Icon = activity.icon;
                    return (
                      <div
                        key={activity.id}
                        className="flex items-center gap-3 p-3 bg-gray-50/70 rounded-xl border border-gray-200"
                      >
                        <Icon className={`w-5 h-5 ${activity.color}`} />
                        <div>
                          <p className="text-gray-900 text-sm">
                            {activity.description}
                          </p>
                          <p className="text-gray-600 text-xs">
                            {activity.time}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-6 text-gray-700">
                  <Activity className="w-12 h-12 mx-auto mb-3 opacity-50 text-gray-600" />
                  <p>No recent activity</p>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div
              className={`bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-8 shadow-xl transform transition-all duration-1000 ${
                isAnimated
                  ? "translate-y-0 opacity-100"
                  : "translate-y-8 opacity-0"
              }`}
              style={{ transitionDelay: "400ms" }}
            >
              <h3 className="text-xl font-black text-gray-900 mb-6 flex items-center gap-3">
                <Bell className="w-6 h-6 text-gray-800" />
                Quick Actions
              </h3>
              <div className="space-y-4">
                <button
                  onClick={() => navigate("/instructor/account-settings")}
                  className="w-full flex items-center justify-between p-4 bg-gray-50/70 rounded-xl border border-gray-200 hover:bg-gray-100/70 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <Edit className="w-5 h-5 text-sky-600 group-hover:text-sky-700" />
                    <span className="font-medium text-gray-900">
                      Edit Profile
                    </span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-600 group-hover:translate-x-1 transition-transform" />
                </button>
                <button
                  onClick={() => navigate("/instructor/schedule")}
                  className="w-full flex items-center justify-between p-4 bg-gray-50/70 rounded-xl border border-gray-200 hover:bg-gray-100/70 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-sky-600 group-hover:text-sky-700" />
                    <span className="font-medium text-gray-900">
                      View Schedule
                    </span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-600 group-hover:translate-x-1 transition-transform" />
                </button>
                <button
                  onClick={() => navigate("/instructor/pending-enrollments")}
                  className="w-full flex items-center justify-between p-4 bg-gray-50/70 rounded-xl border border-gray-200 hover:bg-gray-100/70 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <Users className="w-5 h-5 text-sky-600 group-hover:text-sky-700" />
                    <span className="font-medium text-gray-900">
                      View Pendings
                    </span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-600 group-hover:translate-x-1 transition-transform" />
                </button>
                <button
                  onClick={() => navigate("/instructor/students")}
                  className="w-full flex items-center justify-between p-4 bg-gray-50/70 rounded-xl border border-gray-200 hover:bg-gray-100/70 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <Users className="w-5 h-5 text-sky-600 group-hover:text-sky-700" />
                    <span className="font-medium text-gray-900">
                      Manage Students
                    </span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-600 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
