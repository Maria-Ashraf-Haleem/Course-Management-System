import { useState, useEffect, useRef } from "react";
import {
  FileText,
  Calendar,
  Clock,
  Upload,
  CheckCircle,
  AlertCircle,
  X,
  BookOpen,
  // Home,
  // Book,
  // FileCheck,
  Bell,
  LogOut,
  User,
  // ChevronDown,
  Plus,
  // Trash2,
  // Download,
  Crown,
  Target,
  // BarChart2,
  BarChart3,
  // Check,
  XCircle,
  // FileSpreadsheet,
  Settings,
  Award,
  Sparkles,
  Trophy,
  TrendingUp,
  Activity,
  Star,
  Zap,
  ArrowRight,
  Eye,
  Pencil,
  MessageCircle
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { api, getStudentProfile, getStudentRank, fileUrl } from "../../lib/api";

interface DashboardStats {
  totalSubmissions: number;
  pendingReview: number;
  approved: number;
  rejected: number;
  averageGrade: number;
  completionRate: number;
}

interface Submission {
  id: number;
  title: string;
  course?: string;
  submittedAt: string;
  status: string;
  grade?: number;
  maxGrade?: number | null;
  feedback?: string;
  assignmentId: number;
}

interface AvailableAssignment {
  assignment_id: number;
  title: string;
  description: string;
  deadline: string;
  max_grade: number;
  max_file_size_mb: number;
  instructions: string;
  target_year: string;
  department_name: string;
  assignment_type: string;
  submission_status: "available" | "submitted";
  submission_id?: number;
  submission_status_detail?: string;
  submission_file_path?: string;
  submission_file_type?: string;
  submitted_at?: string;
  hasPdf?: boolean;
}

interface User {
  id: number;
  username: string;
  email: string;
  fullName: string;
  full_name?: string; // For backward compatibility with API responses
  role: string;
}

export default function StudentDashboard() {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    totalSubmissions: 0,
    pendingReview: 0,
    approved: 0,
    rejected: 0,
    averageGrade: 0,
    completionRate: 0,
  });
  const [recentSubmissions, setRecentSubmissions] = useState<Submission[]>([]);
  const [availableAssignments, setAvailableAssignments] = useState<
    AvailableAssignment[]
  >([]);
  const [isAnimated, setIsAnimated] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState<number>(0);
  const [error, setError] = useState<string>("");
  const [rank, setRank] = useState<number | null>(null);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  // Success modal for new submission (CWCM)
  const [showSubmitSuccess, setShowSubmitSuccess] = useState(false);
  // Edit mode target (when editing a pending submission)
  const [editTargetSubmissionId, setEditTargetSubmissionId] = useState<number | null>(null);
  const [existingFiles, setExistingFiles] = useState<Array<{ id?: number | null; name: string; path: string; is_primary?: boolean }>>([]);
  const [replacePrimary, setReplacePrimary] = useState<boolean>(false);

  const navigate = useNavigate();
  const resubmitInputRef = useRef<HTMLInputElement>(null);
  // removed unused resubmitTargetId state

  // Submission Modal state
  const [showModal, setShowModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formAssignmentId, setFormAssignmentId] = useState<string>("");
  const [formNotes, setFormNotes] = useState<string>("");
  // Support multiple files: keep a dynamic list of file inputs
  const [formFiles, setFormFiles] = useState<(File | null)[]>([null]);
  const fileInputRefs = useRef<HTMLInputElement[]>([]);
  const [formError, setFormError] = useState<string>("");

  // Helper to fully reset submission form state
  const resetSubmissionForm = (assignmentId?: number | string) => {
    setFormError("");
    setFormNotes("");
    setFormFiles([null]);
    setEditTargetSubmissionId(null);
    setExistingFiles([]);
    setReplacePrimary(false);
    try { fileInputRefs.current.forEach((r) => { if (r) r.value = ""; }); } catch {}
    fileInputRefs.current = [];
    setFormAssignmentId(
      assignmentId !== undefined && assignmentId !== null ? String(assignmentId) : ""
    );
    setShowSubmitSuccess(false);
  };

  // Load dashboard data
  useEffect(() => {
    loadDashboardData();
    loadAvailableAssignments();
  }, []);

  // Listen for profile updates from Settings page
  useEffect(() => {
    const handleProfileUpdate = async (event: Event) => {
      try {
        // Get the full name from the event detail if available
        const fullName = (event as CustomEvent)?.detail?.fullName;

        if (fullName) {
          // Update the user's full name directly from the event
          setUser((prevUser) => ({
            ...prevUser!,
            fullName: fullName,
          }));
        } else {
          // Fallback: Reload user data if full name is not in the event
          const userResponse = await api.get("/auth/me");
          setUser(userResponse.data);
        }
      } catch (error) {
        console.error("Failed to refresh user data:", error);
      }
    };

    window.addEventListener(
      "profileUpdated",
      handleProfileUpdate as EventListener
    );
    return () =>
      window.removeEventListener(
        "profileUpdated",
        handleProfileUpdate as EventListener
      );
  }, []);

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showModal) {
        closeSubmissionModal();
      }
    };

    if (showModal) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden"; // Prevent background scrolling
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [showModal]);

  const loadDashboardData = async () => {
    try {
      setIsLoading(true);
      setError("");

      // Load user info with updated data
      const userResponse = await api.get("/auth/me");
      const userData = userResponse.data;

      // Ensure we have the latest user data
      setUser((prevUser) => ({
        ...prevUser,
        ...userData,
        fullName: userData.full_name || userData.fullName || "Student", // Fallback to full_name or 'Student' if not available
      }));

      // Fetch student_id, then rank (top performers) for month
      try {
        const meProfileResp = await getStudentProfile("me");
        const sid = Number(meProfileResp.data?.student_id);
        if (Number.isFinite(sid)) {
          try {
            const r = await getStudentRank(sid, "month");
            const rv = r.data?.rank ?? null;
            setRank(typeof rv === "number" ? rv : null);
          } catch {}
        }
      } catch {}

      // Load submissions directly using the correct API (now includes grade data)
      const submissionsResponse = await api.get("/student/submissions");
      const submissions = submissionsResponse.data;

      // Calculate stats from submissions with grade data
      const totalSubmissions = submissions.length;
      const pendingReview = submissions.filter(
        (s: any) => s.status === "Pending"
      ).length;
      const approved = submissions.filter((s: any) => s.status === "Accepted").length;
      const rejected = submissions.filter(
        (s: any) => s.status === "Rejected"
      ).length;

      // Normalize average grade as mean of per-submission percentages (avoid scale bias)
      const gradedSubmissions = submissions.filter(
        (s: any) => Number(s.maxGrade ?? s.max_grade ?? 0) > 0
      );
      const percentages: number[] = gradedSubmissions.map((s: any) => {
        const maxG = Number(s.maxGrade ?? s.max_grade ?? 0);
        const g = Number(s.grade || 0);
        return maxG > 0 ? (g / maxG) * 100 : 0;
      });
      const avg = percentages.length > 0
        ? percentages.reduce((a, b) => a + b, 0) / percentages.length
        : 0;
      const averageGrade = Math.round(avg);

      setStats({
        totalSubmissions,
        pendingReview,
        approved,
        rejected,
        averageGrade,
        completionRate:
          totalSubmissions > 0
            ? Math.round((approved / totalSubmissions) * 100)
            : 0,
      });

      // Map submissions for display
      const mappedSubmissions: Submission[] = submissions.slice(0, 5).map((sub: any) => ({
        id: sub.id,
        title: sub.title || `Assignment ${sub.assignmentId}`,
        course: sub.course || "Course",
        submittedAt: sub.submittedAt,
        status: sub.status.toLowerCase(),
        grade: sub.grade || 0,
        maxGrade: sub.maxGrade ?? sub.max_grade ?? null,
        feedback: sub.feedback,
        assignmentId: sub.assignmentId,
      }));

      setRecentSubmissions(mappedSubmissions);

      // Load unread notifications count (backend returns only unread)
      try {
        const annResp = await api.get("/announcements/my", { params: { _: Date.now() } });
        const rows = Array.isArray(annResp.data) ? annResp.data : annResp.data?.data || [];
        setUnreadNotifications(rows.length || 0);
      } catch (e) {
        // keep notifications badge silent on failure
        setUnreadNotifications(0);
      }
    } catch (err: any) {
      console.error("Error loading dashboard data:", err);
      setError("Failed to load dashboard data. Please try again.");

      // If authentication fails, redirect to login
      if (err.response?.status === 401) {
        localStorage.removeItem("token");
        navigate("/signin");
        return;
      }
    } finally {
      setIsLoading(false);
      setTimeout(() => setIsAnimated(true), 100);
    }
  };

  const loadAvailableAssignments = async () => {
    try {
      // First, get the student's enrolled courses
      const enrollments = await api.get("/course-management/enrollments/me");
      
      if (!enrollments.data || enrollments.data.length === 0) {
        setError("You are not enrolled in any courses. Please enroll in a course to view assignments.");
        return;
      }
      
      // Get assignments for each course
      const courseIds = enrollments.data.map((e: any) => e.course_id);
      const assignmentsPromises = courseIds.map((courseId: number) => 
        api.get(`/course-management/courses/${courseId}/assignments`).catch(() => null)
      );
      
      const assignmentsResponses = await Promise.all(assignmentsPromises);
      
      // Flatten and deduplicate assignments
      const allAssignments: any[] = [];
      assignmentsResponses.forEach(response => {
        if (response && response.data) {
          allAssignments.push(...response.data);
        }
      });
      
      // Get all submissions to match with assignments
      const submissionsResponse = await api.get("/student/submissions");
      const submissions = Array.isArray(submissionsResponse.data) ? submissionsResponse.data : [];
      
      // Create a map of assignment_id to submission
      const submissionMap = new Map();
      submissions.forEach((sub: any) => {
        submissionMap.set(sub.assignment_id || sub.assignmentId, sub);
      });
      
      // Process assignments with submission info
      const assignmentsWithDetails = await Promise.all(allAssignments.map(async (assignment: any) => {
        const submission = submissionMap.get(assignment.id || assignment.assignment_id);
        
        // Check if assignment has a PDF
        try {
          await api.head(`/assignments/${assignment.id || assignment.assignment_id}/pdf`);
          assignment.hasPdf = true;
        } catch (error) {
          assignment.hasPdf = false;
        }
        
        // If there's a submission, add its details
        if (submission) {
          assignment.submission_status = "submitted";
          assignment.submission_id = submission.id || submission.submission_id;
          assignment.submission_file_path = submission.file_path || submission.fileUrl;
          assignment.submission_file_type = submission.file_type;
          assignment.submitted_at = submission.submittedAt || submission.submitted_at;
        } else {
          assignment.submission_status = "available";
        }
        
        return assignment;
      }));
      
      setAvailableAssignments(assignmentsWithDetails);
    } catch (err) {
      console.error("Failed to load available assignments:", err);
      setError("Failed to load available assignments. Please try again later.");
    }
  };

  const handleSignOut = () => {
    setShowSignOutConfirm(true);
  };

  const confirmSignOut = () => {
    localStorage.removeItem("token");
    navigate("/signin");
  };

  const cancelSignOut = () => {
    setShowSignOutConfirm(false);
  };

  // Modal handlers
  const openSubmissionModal = () => {
    console.log("Opening submission modal...");
    resetSubmissionForm();
    setShowModal(true);
  };

  const closeSubmissionModal = () => {
    if (uploading) return;
    console.log("Closing submission modal...");
    setShowModal(false);
    // Ensure next open is fresh
    resetSubmissionForm();
  };

  // Resubmit (replace file) for rejected/needsrevision from Recent Submissions
  const triggerResubmit = (submissionId: number) => {
    // Use a hidden input for reliability across browsers
    if (!resubmitInputRef.current) return;
    // Stash target id in a data attribute
    (resubmitInputRef.current as any).dataset.targetId = String(submissionId);
    resubmitInputRef.current.click();
  };

  const handleResubmitFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetIdStr = (e.target as any).dataset?.targetId || (resubmitInputRef.current as any)?.dataset?.targetId;
    const targetId = targetIdStr ? Number(targetIdStr) : null;
    if (!file || !targetId) return;
    try {
      const form = new FormData();
      form.append("file", file);
      await api.patch(`/student/submissions/${targetId}/file`, form);
      await loadDashboardData();
    } catch (err: any) {
      console.error("Resubmit failed", err);
      alert(err?.response?.data?.detail || err.message || "Failed to resubmit");
    } finally {
      // reset input so the same file can be reselected if needed
      e.target.value = "";
      // clear target id
      try { delete (e.target as any).dataset.targetId; } catch {}
    }
  };

  const handleSubmitNew = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    const idNum = Number(formAssignmentId);
    const selectedFiles: File[] = formFiles.filter((f): f is File => !!f);

    // Basic validations
    if (!Number.isFinite(idNum) || idNum <= 0) {
      setFormError("Assignment ID must be a positive number.");
      return;
    }
    if (selectedFiles.length === 0) {
      setFormError("Please choose at least one file to upload.");
      return;
    }
    for (const f of selectedFiles) {
      if (f.size > 10 * 1024 * 1024) {
        setFormError(`File "${f.name}" exceeds 10MB size limit.`);
        return;
      }
    }

    setUploading(true);
    try {
      if (editTargetSubmissionId) {
        // EDIT FLOW
        if (selectedFiles.length > 0) {
          if (replacePrimary) {
            // Replace primary with first file, append remaining as extras
            const first = selectedFiles[0];
            if (first) {
              const patchForm = new FormData();
              patchForm.append("file", first);
              await api.patch(`/student/submissions/${editTargetSubmissionId}/file`, patchForm);
            }
            const extras = selectedFiles.slice(1);
            if (extras.length > 0) {
              const fd = new FormData();
              extras.forEach((f) => fd.append("files", f));
              await api.post(`/student/submissions/${editTargetSubmissionId}/files`, fd);
            }
          } else {
            // Do not replace primary; append all as extras
            const fd = new FormData();
            selectedFiles.forEach((f) => fd.append("files", f));
            await api.post(`/student/submissions/${editTargetSubmissionId}/files`, fd);
          }
        }
        // If no new files selected, nothing to change; manage using delete buttons
      } else {
        // CREATE FLOW: new submission
        const form = new FormData();
        form.append("assignment_id", String(idNum));
        selectedFiles.forEach((f) => form.append("files", f));
        form.append("student_notes", formNotes || "");
        await api.post("/student/submissions", form);
      }

      // Close submission form modal
      setShowModal(false);
      setEditTargetSubmissionId(null);

      // Refresh dashboard data and available assignments
      await loadDashboardData();
      await loadAvailableAssignments();

      // Show CWCM success modal
      setShowSubmitSuccess(true);
    } catch (err: any) {
      console.error("Upload error:", err);
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        "Upload failed. Please try again.";
      setFormError(msg);
    } finally {
      setUploading(false);
    }
  };

  // Open edit modal prefilled with assignment id
  const openEditModal = (submissionId: number, assignmentId: number) => {
    setFormError("");
    setEditTargetSubmissionId(submissionId);
    setFormAssignmentId(String(assignmentId));
    setFormNotes("");
    setFormFiles([null]);
    setReplacePrimary(false);
    try { fileInputRefs.current.forEach((r) => { if (r) r.value = ""; }); } catch {}
    // Load existing files for display
    api
      .get(`/student/submissions/${submissionId}/files`)
      .then((resp) => setExistingFiles(resp.data || []))
      .catch(() => setExistingFiles([]))
      .finally(() => setShowModal(true));
  };

  const deleteAdditionalFile = async (fileId: number) => {
    if (!editTargetSubmissionId) return;
    try {
      await api.delete(`/student/submissions/${editTargetSubmissionId}/files/${fileId}`);
      setExistingFiles((prev) => prev.filter((f) => (f.id ?? 0) !== fileId));
    } catch (err) {
      console.error("Failed to delete file", err);
      alert("Failed to delete file");
    }
  };

  const deletePrimaryFile = async () => {
    if (!editTargetSubmissionId) return;
    try {
      await api.delete(`/student/submissions/${editTargetSubmissionId}/primary-file`);
      // refetch files to reflect promotion
      const resp = await api.get(`/student/submissions/${editTargetSubmissionId}/files`).catch(() => ({ data: [] } as any));
      setExistingFiles(resp.data || []);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "Failed to delete primary file (ensure at least one extra file exists).";
      alert(msg);
    }
  };

  // Utility functions
  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "accepted":
      case "approved":
        return "text-emerald-400 bg-emerald-500/20 border-emerald-400/30";
      case "pending":
        return "text-amber-400 bg-amber-500/20 border-amber-400/30";
      case "rejected":
        return "text-red-400 bg-red-500/20 border-red-400/30";
      case "needsrevision":
        return "text-orange-400 bg-orange-500/20 border-orange-400/30";
      default:
        return "text-gray-400 bg-gray-500/20 border-gray-400/30";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case "accepted":
      case "approved":
        return CheckCircle;
      case "pending":
        return Clock;
      case "rejected":
        return XCircle;
      default:
        return FileText;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-sky-500 to-sky-600 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse">
            <BookOpen className="w-8 h-8 text-white" />
          </div>
          <p className="text-gray-600 font-medium">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-red-500 to-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-white" />
          </div>
          <p className="text-gray-700 font-medium mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-gray-200">
      {/* Animated Background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gray-200/90" />
        <div className="absolute top-0 left-0 w-full h-full">
          <div className="absolute top-20 left-20 w-72 h-72 bg-gradient-to-r from-sky-300/30 to-sky-400/30 rounded-full blur-3xl animate-pulse" />
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
        {/* Floating Particles */}
        <div className="absolute inset-0">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-gray-400/40 rounded-full animate-pulse"
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

      {/* Hidden input for resubmit (Recent Submissions) */}
      <input
        ref={resubmitInputRef}
        type="file"
        onChange={handleResubmitFileChange}
        accept="*/*"
        style={{ position: 'absolute', left: '-9999px', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
      />

      {/* Header */}
      <div className="relative z-10 bg-gray-200/10 backdrop-blur-md border-b border-gray-300">
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
                <h1 className="text-2xl font-black bg-gradient-to-r from-gray-800 via-gray-900 to-black bg-clip-text text-transparent">
                  Course Management System
                </h1>
                <p className="text-sm text-gray-800 font-medium">
                  Student Dashboard
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-6">
                <button
                  onClick={() => navigate("/student/notifications")}
                  className="relative p-2 text-gray-800 hover:text-gray-900 transition-colors"
                >
                  <Bell className="w-5 h-5" />
                  {unreadNotifications > 0 && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                  )}

                </button>
                <button
                  onClick={() => navigate("/student/settings")}
                  className="p-2 text-gray-800 hover:text-gray-900 transition-colors"
                >
                  <Settings className="w-5 h-5" />
                </button>
              </div>

              <div className="flex items-center gap-3 pl-4 border-l border-gray-400">
                <div className="w-10 h-10 bg-gradient-to-r from-sky-400 to-sky-600 rounded-xl flex items-center justify-center">
                  <User className="w-5 h-5 text-white" />
                </div>
                <div className="hidden sm:block text-right">
                  <p className="text-sm font-bold text-gray-900">
                    {user?.fullName || user?.full_name || "Student"}
                  </p>
                  <p className="text-xs text-gray-700 capitalize">
                    {user?.role || "student"}
                  </p>
                </div>
                <button
                  onClick={handleSignOut}
                  className="p-2 text-gray-800 hover:text-gray-900 transition-colors group"
                  title="Sign Out"
                >
                  <LogOut className="w-5 h-5 group-hover:scale-110 transition-transform" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 py-8">
        {/* Welcome Section */}
        <div
          className={`mb-8 transform transition-all duration-1000 ${
            isAnimated ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
          }`}
        >
          <div className="flex items-center gap-4 mb-6">
            <div className="relative">
              <div className="w-16 h-16 bg-gradient-to-r from-sky-400 to-sky-600 rounded-2xl flex items-center justify-center shadow-2xl">
                <Award className="w-8 h-8 text-white" />
              </div>
              <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-yellow-300 animate-pulse" />
            </div>
            <div>
              <h2 className="text-3xl font-black bg-gradient-to-r from-gray-800 via-gray-900 to-black bg-clip-text text-transparent">
                Welcome back,{" "}
                {user?.fullName?.split(" ")[0] || user?.username || "Student"}!
              </h2>
              <p className="text-gray-800 text-lg">
                Track your academic progress and submissions
              </p>
              {rank != null && (
                <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm font-bold border border-yellow-300">
                  <Trophy className="w-4 h-4" /> Top Performer • Rank #{rank}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Quick Stats - Now using real data */}
        <div
          className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8 transform transition-all duration-1000 ${
            isAnimated ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
          }`}
          style={{ transitionDelay: "200ms" }}
        >
          <div className="bg-gray-200/70 backdrop-blur-xl rounded-3xl border border-gray-400 p-6 transform transition-all duration-500 hover:scale-105 group">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-sky-500 to-sky-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <TrendingUp className="w-5 h-5 text-sky-500" />
            </div>
            <h3 className="text-2xl font-black text-gray-900 mb-1">
              {stats.totalSubmissions}
            </h3>
            <p className="text-gray-800 text-sm font-medium">
              Total Submissions
            </p>
            <div className="mt-3 flex items-center gap-2">
              <div className="w-2 h-2 bg-sky-500 rounded-full animate-pulse" />
              <span className="text-sky-400">All time</span>
            </div>
          </div>

          <div className="bg-gray-200/70 backdrop-blur-xl rounded-3xl border border-gray-400 p-6 transform transition-all duration-500 hover:scale-105 group">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Clock className="w-6 h-6 text-white" />
              </div>
              <Activity className="w-5 h-5 text-amber-500" />
            </div>
            <h3 className="text-2xl font-black text-gray-900 mb-1">
              {stats.pendingReview}
            </h3>
            <p className="text-gray-800 text-sm font-medium">Pending Review</p>
            <div className="mt-3 flex items-center gap-2">
              <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
              <span className="text-amber-400">Awaiting feedback</span>
            </div>
          </div>

          <div className="bg-gray-200/70 backdrop-blur-xl rounded-3xl border border-gray-400 p-6 transform transition-all duration-500 hover:scale-105 group">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-sky-500 to-sky-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <CheckCircle className="w-6 h-6 text-white" />
              </div>
              <Star className="w-5 h-5 text-sky-500" />
            </div>
            <h3 className="text-2xl font-black text-gray-900 mb-1">
              {stats.approved}
            </h3>
            <p className="text-gray-800 text-sm font-medium">Accepted</p>
            <div className="mt-3 flex items-center gap-2">
              <div className="w-2 h-2 bg-sky-500 rounded-full animate-pulse" />
              <span className="text-sky-400">Great work!</span>
            </div>
          </div>

          <div className="bg-gray-200/70 backdrop-blur-xl rounded-3xl border border-gray-400 p-6 transform transition-all duration-500 hover:scale-105 group">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-red-500 to-rose-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <X className="w-6 h-6 text-white" />
              </div>
              <AlertCircle className="w-5 h-5 text-red-500" />
            </div>
            <h3 className="text-2xl font-black text-gray-900 mb-1">
              {stats.rejected}
            </h3>
            <p className="text-gray-800 text-sm font-medium">Rejected</p>
            <div className="mt-3 flex items-center gap-2">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-red-400">Needs revision</span>
            </div>
          </div>

          <div className="bg-gray-200/70 backdrop-blur-xl rounded-3xl border border-gray-400 p-6 transform transition-all duration-500 hover:scale-105 group">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-sky-500 to-sky-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <BarChart3 className="w-6 h-6 text-white" />
              </div>
              <Zap className="w-5 h-5 text-sky-500" />
            </div>
            <h3 className="text-2xl font-black text-gray-900 mb-1">
              {stats.completionRate}%
            </h3>
            <p className="text-gray-800 text-sm font-medium">Completion Rate</p>
            <div className="mt-3 flex items-center gap-2">
              <div className="w-2 h-2 bg-sky-500 rounded-full animate-pulse" />
              <span className="text-sky-400">Great progress</span>
            </div>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Recent Submissions - Now with real data */}
          <div
            className={`lg:col-span-2 transform transition-all duration-1000 ${
              isAnimated
                ? "translate-y-0 opacity-100"
                : "translate-y-8 opacity-0"
            }`}
            style={{ transitionDelay: "400ms" }}
          >
            <div className="bg-gray-200/70 backdrop-blur-xl rounded-3xl border border-gray-400 p-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-r from-sky-500 to-sky-600 rounded-xl flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-xl font-black text-gray-900">
                    Recent Submissions
                  </h3>
                </div>
                <Link
                  to="/student/submissions"
                  className="group flex items-center gap-2 text-sky-600 hover:text-sky-700 font-medium text-sm transition-colors"
                >
                  <span>View All</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>

              <div className="space-y-4">
                {recentSubmissions.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                    <p className="text-gray-700">No submissions yet</p>
                    <p className="text-gray-500 text-sm">
                      Upload your first assignment to get started
                    </p>
                  </div>
                ) : (
                  recentSubmissions.map((submission, index) => {
                    const StatusIcon = getStatusIcon(submission.status);
                    return (
                      <div
                        key={submission.id}
                        className="bg-gray-200/50 backdrop-blur-sm rounded-2xl border border-gray-400 p-6 group hover:bg-gray-300/70 transition-all duration-300 hover:scale-[1.02]"
                        style={{ animationDelay: `${index * 100}ms` }}
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <h4 className="text-lg font-bold text-gray-900 mb-1">
                              {submission.title}
                            </h4>
                            {submission.course && (
                              <p className="text-gray-700 text-sm">
                                {submission.course}
                              </p>
                            )}
                          </div>
                          <div
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold ${getStatusColor(
                              submission.status
                            )}`}
                          >
                            <StatusIcon className="w-3 h-3" />
                            <span className="capitalize">
                              {submission.status
                                .replace(/([A-Z])/g, " $1")
                                .trim()}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 text-gray-700">
                              <Calendar className="w-4 h-4" />
                              <span>
                                {new Date(
                                  submission.submittedAt
                                ).toLocaleDateString()}
                              </span>
                            </div>
                            {submission.grade != null && submission.maxGrade != null && (
                              <div className="flex items-center gap-2">
                                <Star className="w-4 h-4 text-yellow-400" />
                                <span className="text-yellow-500 font-bold">
                                  {submission.grade}/{submission.maxGrade}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() =>
                                navigate(
                                  `/student/submissions/${submission.id}`
                                )
                              }
                              className="p-2 text-gray-700 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-300/50"
                              title="View Details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {submission.status === 'pending' && (
                              <button
                                onClick={() => openEditModal(submission.id, submission.assignmentId)}
                                className="p-2 text-sky-600 hover:text-sky-700 transition-colors rounded-lg hover:bg-sky-100/50"
                                title="Edit (replace files before grading)"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                            )}
                            {(submission.status === 'rejected' || submission.status === 'needsrevision') && (
                              <button
                                onClick={() => triggerResubmit(submission.id)}
                                className="p-2 text-amber-600 hover:text-amber-700 transition-colors rounded-lg hover:bg-amber-100/50"
                                title="Resubmit (replace file)"
                              >
                                <Upload className="w-4 h-4" />
                              </button>
                            )}
                            {submission.feedback && (
                              <button
                                onClick={() =>
                                  navigate(
                                    `/student/submissions/${submission.id}#feedback`
                                  )
                                }
                                className="p-2 text-gray-700 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-300/50"
                                title="View Feedback"
                              >
                                <MessageCircle className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        {submission.feedback && (
                          <div className="mt-4 p-4 bg-gray-200/50 rounded-xl border border-gray-400">
                            <p className="text-gray-800 text-sm italic">
                              "{submission.feedback}"
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="mt-6">
                <button
                  type="button"
                  onClick={openSubmissionModal}
                  className="w-full group bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 text-white font-bold py-4 px-6 rounded-2xl transition-all duration-500 transform hover:-translate-y-1 hover:scale-[1.02] flex items-center justify-center gap-3 shadow-2xl hover:shadow-sky-500/25"
                >
                  <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  <span>New Submission</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          </div>

          {/* Sidebar - Quick Actions now connected */}
          <div className="space-y-6">
            <div
              className={`transform transition-all duration-1000 ${
                isAnimated
                  ? "translate-y-0 opacity-100"
                  : "translate-y-8 opacity-0"
              }`}
              style={{ transitionDelay: "800ms" }}
            >
              <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 bg-gradient-to-r from-sky-500 to-sky-600 rounded-lg flex items-center justify-center">
                    <Zap className="w-4 h-4 text-white" />
                  </div>
                  <h3 className="text-lg font-black text-gray-900">
                    Quick Actions
                  </h3>
                </div>

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={openSubmissionModal}
                    className="w-full group bg-gray-100/70 border border-gray-300 text-sky-800 font-medium py-3 px-4 rounded-xl hover:bg-gray-200/70 transition-all duration-300 flex items-center gap-3"
                  >
                    <Upload className="w-4 h-4 text-sky-500" />
                    <span>Submit Assignment</span>
                    <ArrowRight className="w-4 h-4 ml-auto group-hover:translate-x-1 transition-transform" />
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate("/student/submissions")}
                    className="w-full group bg-gray-100/70 border border-gray-300 text-sky-800 font-medium py-3 px-4 rounded-xl hover:bg-gray-200/70 transition-all duration-300 flex items-center gap-3"
                  >
                    <FileText className="w-4 h-4 text-sky-500" />
                    <span>View Submissions</span>
                    <ArrowRight className="w-4 h-4 ml-auto group-hover:translate-x-1 transition-transform" />
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate("/student/grades")}
                    className="w-full group bg-gray-100/70 border border-gray-300 text-sky-800 font-medium py-3 px-4 rounded-xl hover:bg-gray-200/70 transition-all duration-300 flex items-center gap-3"
                  >
                    <Trophy className="w-4 h-4 text-sky-500" />
                    <span>View Grades</span>
                    <ArrowRight className="w-4 h-4 ml-auto group-hover:translate-x-1 transition-transform" />
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate("/student/courses")}
                    className="w-full group bg-gray-100/70 border border-gray-300 text-sky-800 font-medium py-3 px-4 rounded-xl hover:bg-gray-200/70 transition-all duration-300 flex items-center gap-3"
                  >
                    <BookOpen className="w-4 h-4 text-sky-500" />
                    <span>Browse Courses</span>
                    <ArrowRight className="w-4 h-4 ml-auto group-hover:translate-x-1 transition-transform" />
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate("/student/analysis")}
                    className="w-full group bg-gray-100/70 border border-gray-300 text-sky-800 font-medium py-3 px-4 rounded-xl hover:bg-gray-200/70 transition-all duration-300 flex items-center gap-3"
                  >
                    <BarChart3 className="w-4 h-4 text-sky-500" />
                    <span>Analysis</span>
                    <ArrowRight className="w-4 h-4 ml-auto group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            </div>

            {/* Performance Overview */}
            <div
              className={`transform transition-all duration-1000 ${
                isAnimated
                  ? "translate-y-0 opacity-100"
                  : "translate-y-8 opacity-0"
              }`}
              style={{ transitionDelay: "1000ms" }}
            >
              <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 bg-gradient-to-r from-sky-500 to-sky-600 rounded-lg flex items-center justify-center">
                    <Target className="w-4 h-4 text-white" />
                  </div>
                  <h3 className="text-lg font-black text-gray-900">
                    Performance
                  </h3>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700 text-sm">Success Rate</span>
                    <span className="text-sky-500 font-bold">
                      {stats.completionRate}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200/50 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-sky-400 to-sky-500 h-2 rounded-full transition-all duration-1000"
                      style={{ width: `${stats.completionRate}%` }}
                    />
                  </div>

                  <div className="pt-4 border-t border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-gray-700 text-sm">This Month</span>
                      <Crown className="w-4 h-4 text-yellow-500" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Submitted</span>
                        <span className="text-gray-900">
                          {stats.totalSubmissions}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Approved</span>
                        <span className="text-sky-500">{stats.approved}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Pending</span>
                        <span className="text-amber-500">
                          {stats.pendingReview}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Rejected</span>
                        <span className="text-red-500">{stats.rejected}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Available Assignments Section */}
        <div
          className={`mt-6 transform transition-all duration-1000 ${
            isAnimated ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
          }`}
          style={{ transitionDelay: "600ms" }}
        >
          <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-sky-500 to-sky-600 rounded-xl flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-xl font-black text-gray-900">
                  Available Assignments
                </h3>
              </div>
            </div>

            <div className="space-y-4">
              {availableAssignments.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No assignments available</p>
                  <p className="text-gray-400 text-sm">
                    Check back later for new assignments
                  </p>
                </div>
              ) : (
                availableAssignments.map((assignment, index) => (
                  <div
                    key={assignment.assignment_id}
                    className="bg-gray-100/50 backdrop-blur-sm rounded-2xl border border-gray-300 p-6 group hover:bg-gray-200/70 transition-all duration-300 hover:scale-[1.02]"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h4 className="text-lg font-bold text-gray-900 mb-1">
                          {assignment.title}
                        </h4>
                        <p className="text-gray-700 text-sm mb-2">
                          {assignment.description}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-gray-600">
                          <span>{assignment.department_name}</span>
                          <span>•</span>
                          <span>{assignment.assignment_type}</span>
                          <span>•</span>
                          <span>Max Grade: {assignment.max_grade}</span>
                          
                        </div>
                      </div>
                      <div
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold ${
                          assignment.submission_status === "submitted"
                            ? "bg-sky-100/50 border-sky-300/70 text-sky-800"
                            : "bg-sky-100/50 border-sky-300/70 text-sky-800"
                        }`}
                      >
                        {assignment.submission_status === "submitted" ? (
                          <>
                            <CheckCircle className="w-3 h-3" />
                            <span>Submitted</span>
                          </>
                        ) : (
                          <>
                            <Clock className="w-3 h-3" />
                            <span>Available</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 text-gray-600">
                          <Calendar className="w-4 h-4" />
                          <span>
                            Due:{" "}
                            {new Date(assignment.deadline).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <Upload className="w-4 h-4" />
                          <span>Max: {assignment.max_file_size_mb}MB</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Always show Download Assignment PDF button */}
                          <button
                            onClick={async (e) => {
                              e.preventDefault();
                              try {
                                const response = await api.get(
                                  `/assignments/${assignment.assignment_id}/pdf`,
                                  { responseType: "blob" }
                                );

                                const blob = response.data;
                                const url = window.URL.createObjectURL(blob);
                                const link = document.createElement("a");
                                link.href = url;
                                link.setAttribute(
                                  "download",
                                  `assignment-${assignment.assignment_id}.pdf`
                                );
                                document.body.appendChild(link);
                                link.click();

                                setTimeout(() => {
                                  if (link.parentNode) {
                                    link.parentNode.removeChild(link);
                                  }
                                  window.URL.revokeObjectURL(url);
                                }, 100);
                              } catch (error: any) {
                                console.error("Error downloading PDF:", error);
                                const detail =
                                  error?.response?.data?.detail ||
                                  error?.message ||
                                  "Failed to download the PDF. Please try again later.";
                                alert(`Error: ${detail}`);
                              }
                            }}
                            className="px-4 py-2 bg-emerald-100/70 text-emerald-800 rounded-xl font-bold text-sm hover:bg-emerald-200/70 transition-all duration-300 flex items=center justify-center gap-2 mr-2"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                              <polyline points="7 10 12 15 17 10"/>
                              <line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                            Download Assignment PDF
                          </button>
                        
                        
                        {assignment.submission_status === "available" ? (
                          <button
                            onClick={() => {
                              resetSubmissionForm(assignment.assignment_id);
                              setShowModal(true);
                            }}
                            className="px-4 py-2 bg-gradient-to-r from-sky-500 to-sky-600 text-white rounded-xl font-bold text-sm hover:from-sky-600 hover:to-sky-700 transition-all duration-300 hover:scale-105"
                          >
                            Submit
                          </button>
                        ) : (
                          <button
                            onClick={() =>
                              navigate(
                                `/student/submissions/${assignment.submission_id}`
                              )
                            }
                            className="px-4 py-2 bg-gray-200/50 text-gray-800 rounded-xl font-bold text-sm hover:bg-gray-300/70 transition-all duration-300"
                          >
                            View Submission
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Modal for New Submission */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={closeSubmissionModal}
        >
          <div
            className="bg-white rounded-2xl border border-gray-200 shadow-md p-8 w-full max-w-2xl max-h-[85vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-sky-500 to-sky-600 rounded-xl flex items-center justify-center">
                  <Upload className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-xl font-black text-gray-900">{editTargetSubmissionId ? "Edit Submission" : "New Submission"}</h3>
              </div>
              <button
                onClick={closeSubmissionModal}
                disabled={uploading}
                className="p-2 text-gray-600 hover:text-gray-800 transition-colors rounded-lg hover:bg-gray-200/50 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitNew} className="space-y-6">
              <div>
                <label
                  htmlFor="assignmentId"
                  className="block text-gray-800 text-sm font-medium mb-2"
                >
                  Assignment ID
                </label>
                <input
                  id="assignmentId"
                  type="number"
                  value={formAssignmentId}
                  onChange={(e) => setFormAssignmentId(e.target.value)}
                  className="w-full bg-gray-100 border border-gray-300 rounded-xl px-4 py-3 text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                  placeholder="Enter assignment ID"
                  required
                  disabled={uploading || !!editTargetSubmissionId}
                />
              </div>

              {editTargetSubmissionId && (
                <div>
                  <label className="block text-gray-800 text-sm font-medium mb-2">
                    Current Files
                  </label>
                  <div className="space-y-2">
                    {existingFiles.length === 0 ? (
                      <div className="text-gray-600 text-sm">No files found.</div>
                    ) : (
                      existingFiles.map((f, idx) => (
                        <div key={(f.id ?? idx)} className="flex items-center justify-between bg-gray-100 border border-gray-300 rounded-lg px-3 py-2">
                          <a href={fileUrl(f.path)} target="_blank" rel="noreferrer" className="text-sky-600 hover:text-sky-700 text-sm truncate max-w-[70%]" title={f.name}>
                            {f.name}
                          </a>
                          <div className="flex items-center gap-2">
                            {f.is_primary ? (
                              <>
                                <span className="text-xs text-gray-600" title="Select a new first file below to replace primary">Primary</span>
                                <button
                                  type="button"
                                  onClick={deletePrimaryFile}
                                  className="px-2 py-1 text-red-600 hover:text-red-700 text-xs rounded hover:bg-red-100/60"
                                  title="Delete primary (promote next file)"
                                  disabled={existingFiles.filter(x => !x.is_primary).length === 0}
                                >
                                  Delete Primary
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => f.id && deleteAdditionalFile(f.id)}
                                className="px-2 py-1 text-red-600 hover:text-red-700 text-xs rounded hover:bg-red-100/60"
                                title="Delete file"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-gray-800 text-sm font-medium mb-2">
                  Upload Files
                </label>
                {editTargetSubmissionId && (
                  <div className="mb-2 flex items-center gap-2 text-sm text-gray-700">
                    <input
                      id="replacePrimary"
                      type="checkbox"
                      className="rounded border-gray-300"
                      checked={replacePrimary}
                      onChange={(e) => setReplacePrimary(e.target.checked)}
                      disabled={uploading}
                    />
                    <label htmlFor="replacePrimary" className="select-none">
                      Replace primary with the first selected file
                    </label>
                  </div>
                )}
                <div className="space-y-3">
                  {formFiles.map((_, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        ref={(el) => { if (el) fileInputRefs.current[idx] = el; }}
                        type="file"
                        multiple
                        onChange={(e) => {
                          const list = Array.from(e.target.files || []);
                          setFormFiles((prev) => {
                            const arr = [...prev];
                            const first = list[0] || null;
                            arr[idx] = first;
                            // append any remaining files as new slots
                            const rest = list.slice(1);
                            if (rest.length) {
                              rest.forEach((f) => arr.push(f));
                            }
                            return arr;
                          });
                        }}
                        className="flex-1 bg-gray-100 border border-gray-300 rounded-xl px-4 py-3 text-black file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-sky-500 file:text-white hover:file:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                        disabled={uploading}
                      />
                      {formFiles.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            setFormFiles((prev) => prev.filter((_, i) => i !== idx));
                            try { fileInputRefs.current.splice(idx, 1); } catch {}
                          }}
                          className="px-3 py-2 bg-red-100 text-red-700 rounded-lg border border-red-300 hover:bg-red-200 transition-colors text-sm"
                          disabled={uploading}
                          title="Remove"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                  <div>
                    <button
                      type="button"
                      onClick={() => setFormFiles((prev) => prev[prev.length - 1] ? [...prev, null] : prev)}
                      className="px-3 py-2 bg-gray-100/70 border border-gray-300 text-gray-800 rounded-lg hover:bg-gray-200/70 transition-colors text-sm"
                      disabled={uploading}
                    >
                      + Add another file
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label
                  htmlFor="notes"
                  className="block text-gray-800 text-sm font-medium mb-2"
                >
                  Notes (Optional)
                </label>
                <textarea
                  id="notes"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={3}
                  className="w-full bg-gray-100 border border-gray-300 rounded-xl px-4 py-3 text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all resize-none"
                  placeholder="Add any additional notes..."
                  disabled={uploading}
                />
              </div>

              {formError && (
                <div className="bg-red-500/20 border border-red-400/30 rounded-xl p-4">
                  <p className="text-red-600 text-sm">{formError}</p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeSubmissionModal}
                  disabled={uploading}
                  className="flex-1 bg-gray-200/50 hover:bg-gray-300/70 border border-gray-300 text-gray-800 font-medium py-3 px-4 rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading || formFiles.filter(Boolean).length === 0 || !formAssignmentId}
                  className="flex-1 bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white font-bold py-3 px-4 rounded-xl transition-all duration-300 transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
                >
                  {uploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Uploading...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>{editTargetSubmissionId ? "Save Changes" : "Submit"}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSubmitSuccess && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowSubmitSuccess(false)}
        >
          <div
            className="bg-white rounded-2xl border border-gray-200 shadow-xl p-6 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-xl font-black text-gray-900">Success</h3>
            </div>
            <p className="text-gray-700 mb-6">Assignment submitted successfully.</p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowSubmitSuccess(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {showSignOutConfirm && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={cancelSignOut}
        >
          <div
            className="bg-white rounded-2xl border border-gray-200 shadow-xl p-6 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-r from-red-500 to-rose-600 rounded-xl flex items-center justify-center">
                <LogOut className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-xl font-black text-gray-900">Sign Out</h3>
            </div>
            <p className="text-gray-700 mb-6">Are you sure you want to sign out?</p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={cancelSignOut}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmSignOut}
                className="px-4 py-2 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white rounded-xl font-bold transition-colors"
              >
                Yes, Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
