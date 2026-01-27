import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  BookMarked,
  Calendar,
  CheckCircle,
  ChartLine,
  ClipboardList,
  Clock,
  Crown,
  Download,
  Eye,
  FileText,
  FileSpreadsheet,
  Filter,
  GraduationCap,
  Mail,
  Plus,
  Search,
  Sparkles,
  Star,
  Stethoscope,
  UserPlus,
  Users,
  Zap,
  ChevronDown,
} from "lucide-react";
// ...existing imports...
import {
  getDashboardSummary,
  getDashboardRecentSubmissions,
  reviewInstructorSubmission,
  downloadSubmissionFile,
  getStudents,
  getAssignments,
  getMe,
  getAnnouncements,
  exportStudentsData,
  getInstructorProfile,
} from "../../lib/api";
import SubmissionModal from "./SubmissionModal";
import ProfileDropdown from "../../components/ProfileDropdown";
import SubmissionReviewModal from "../../components/SubmissionReviewModal";

export default function InstructorDashboard() {
  const navigate = useNavigate();

  const handleLogoClick = () => {
    navigate("/instructor/dashboard");
  };

  const [isLoading, setIsLoading] = useState(true);
  const [instructor, setInstructor] = useState({
    fullName: "",
    email: "",
    specialization: "",
  });

  // Helpers to aggregate per-course submission stats
  const normalize = (v: any) => String(v || "").trim().toLowerCase();
  const strip = (s: string) => s.replace(/[^a-z0-9]/g, "");
  const submissionMatchesCourse = (s: any, course: any) => {
    // ID match first
    const subCid = Number(s?.courseId ?? s?.course_id ?? s?.courseID ?? s?.course_id_fk);
    const courseId = Number(course?.course_id ?? course?.id);
    if (Number.isFinite(subCid) && Number.isFinite(courseId) && subCid === courseId) return true;

    const courseTitle = normalize(course?.title || course?.name || course?.course_title);
    const courseCode = normalize(course?.code || course?.course_code);

    const labelCandidates: string[] = [
      s?.course,
      s?.courseTitle ?? s?.course_title ?? s?.course_name,
      s?.courseCode ?? s?.course_code,
      [s?.courseTitle ?? s?.course_title ?? s?.course_name, s?.courseCode ?? s?.course_code].filter(Boolean).join(" "),
      // nested course object fallbacks if API sent structured data
      s?.course?.title ?? s?.course?.name,
      s?.course?.code,
      [s?.course?.title ?? s?.course?.name, s?.course?.code].filter(Boolean).join(" ")
    ]
      .map((x) => normalize(x))
      .filter(Boolean);

    const labelStripped = labelCandidates.map(strip);
    const tS = strip(courseTitle);
    const cS = strip(courseCode);

    // any candidate includes title/code or reverse
    for (let i = 0; i < labelCandidates.length; i++) {
      const lab = labelCandidates[i];
      const labS = labelStripped[i];
      if (!lab) continue;
      if ((courseCode && lab.includes(courseCode)) || (courseTitle && lab.includes(courseTitle))) return true;
      if ((cS && labS.includes(cS)) || (tS && labS.includes(tS))) return true;
      if ((courseTitle && courseTitle.includes(lab)) || (tS && tS.includes(labS))) return true;
    }
    return false;
  };
  const getCourseSubmissionStats = (course: any) => {
    // Prefer allSubmissions for breadth; if empty, fallback to recentSubmissions
    const source = (allSubmissions && allSubmissions.length > 0) ? allSubmissions : recentSubmissions;
    let subs = (source || []).filter((s) => submissionMatchesCourse(s, course));
    // Fallback 2: if none matched by course label/ID, try assignment-ID membership using preloaded courseAssignments
    if ((!subs || subs.length === 0) && course && courseAssignments && course.course_id != null) {
      const cid = Number(course.course_id);
      const items = Array.isArray(courseAssignments[cid]) ? courseAssignments[cid] : [];
      if (items.length > 0) {
        const assignmentIds = new Set(items.map((a: any) => Number(a.assignment_id ?? a.id))
          .filter((n: any) => Number.isFinite(n)));
        if (assignmentIds.size > 0) {
          subs = (source || []).filter((s: any) => assignmentIds.has(Number(s.assignmentId ?? s.assignment_id)));
        }
      }
    }
    const total = subs.length;
    const by = { pending: 0, accepted: 0, reviewed: 0, needs_revision: 0 } as Record<string, number>;
    for (const s of subs) {
      let st = String(s.status || "").toLowerCase();
      // Treat rejected the same as needs_revision for display purposes
      if (st === "rejected") st = "needs_revision";
      if (st in by) by[st] += 1; else by[st] = (by[st] || 0) + 1;
    }
    return { total, by };
  };
  const [stats, setStats] = useState({
    totalStudents: 0,
    teachingAssistants: 0,
    activeTasks: 0,
    pendingReviews: 0,
    acceptedSubmissions: 0,
    rejectedSubmissions: 0,
    averageGrade: 0,
    completionRate: 0,
    totalAssignments: 0,
    // New instructor-specific stats
    totalCourses: 0,
    totalEnrolledStudents: 0,
  });
  const [recentSubmissions, setRecentSubmissions] = useState<any[]>([]);
  const [allSubmissions, setAllSubmissions] = useState<any[]>([]);
  const [isAnimated, setIsAnimated] = useState(false);
  const [modalSubmissionId, setModalSubmissionId] = useState<number | null>(
    null
  );
  const [selectedFilter, setSelectedFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [instructorCourses, setInstructorCourses] = useState<any[]>([]); // New state for instructor's courses

  // messagesSent state inside the component
  const [messagesSent, setMessagesSent] = useState(0);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showAllSubmissions, setShowAllSubmissions] = useState(false);
  // Removed inline pending enrollments preview; manage from dedicated page
  // Track which courses are expanded in the Recent Submissions section
  const [expandedCourses, setExpandedCourses] = useState<Record<string, boolean>>({});
  // Cache assignments per course and loading flags
  const [courseAssignments, setCourseAssignments] = useState<Record<number, any[]>>({});
  const [loadingCourses, setLoadingCourses] = useState<Record<number, boolean>>({});


  // Submission review modal state
  const [reviewingSubmissionId, setReviewingSubmissionId] = useState<
    number | null
  >(null);

  // Handle submission review modal save
  const handleReviewSaved = (updatedSubmission: any) => {
    setRecentSubmissions((prev) =>
      prev.map((s) =>
        s.id === updatedSubmission.id
          ? {
              ...s,
              status: updatedSubmission.status,
              grade: updatedSubmission.grade?.toString() || null,
            }
          : s
      )
    );
    setAllSubmissions((prev) =>
      prev.map((s) =>
        s.id === updatedSubmission.id
          ? {
              ...s,
              status: updatedSubmission.status,
              grade: updatedSubmission.grade?.toString() || null,
            }
          : s
      )
    );
    // Update stats directly instead of reloading all data to avoid infinite loop
    setStats((prevStats) => ({
      ...prevStats,
      pendingReviews: Math.max(0, (prevStats.pendingReviews || 0) - 1),
      acceptedSubmissions: updatedSubmission.status === "accepted" 
        ? (prevStats.acceptedSubmissions || 0) + 1 
        : prevStats.acceptedSubmissions,
    }));
  };

  // Debug logging to see what data we have
  console.log("All submissions for counting:", allSubmissions);
  console.log(
    "Submissions with grades:",
    allSubmissions.filter(
      (s) =>
        (s.grade != null && s.grade !== "") ||
        (s.grade100 != null && s.grade100 !== "") ||
        (s.feedback_grade != null && s.feedback_grade !== "")
    )
  );
  console.log(
    "Submissions with feedback:",
    allSubmissions.filter(
      (s) =>
        (s.feedback && String(s.feedback).trim().length > 0) ||
        (s.feedback_text && String(s.feedback_text).trim().length > 0)
    )
  );

  const loadDashboardData = async () => {
    try {
      // restore persisted messages count (so it survives navigation/refresh)
      try {
        // Prefer the locally persisted counter so increments survive navigation.
        const raw = localStorage.getItem("messagesSent");
        if (raw != null) {
          const savedMessages = parseInt(raw || "0", 10);
          if (!Number.isNaN(savedMessages)) setMessagesSent(savedMessages);
        } else {
          // localStorage empty -> try a lightweight server fallback (count recent announcements)
          try {
            const anns = await getAnnouncements({ limit: 100 }).catch(
              () => ({ data: null } as any)
            );
            if (anns && Array.isArray(anns.data)) {
              // use total announcements as a reasonable default for the counter
              setMessagesSent(anns.data.length || 0);
              try {
                localStorage.setItem(
                  "messagesSent",
                  String(anns.data.length || 0)
                );
              } catch (_) {}
            }
          } catch (_) {
            // swallow server fallback errors
          }
        }
      } catch {
        // ignore localStorage errors
      }
      // Fetch instructor profile (preferred display name) + fallback to /auth/me
      try {
        const [profileResp, meResp] = await Promise.all([
          getInstructorProfile().catch(() => null),
          getMe().catch(() => null),
        ]);

        const profile = profileResp?.data as any;
        const user = meResp?.data as any;

        // Per-user cache isolation: if user id changed, purge instructor caches
        try {
          const prevUserId = localStorage.getItem("currentUserId");
          const nextUserId = user?.id != null ? String(user.id) : undefined;
          if (nextUserId && prevUserId !== nextUserId) {
            // purge previous user's instructor caches
            localStorage.removeItem("messagesSent");
            localStorage.removeItem("instructorNotifications");
            localStorage.removeItem("lastDashboardLoad");
            // set new namespace anchor
            localStorage.setItem("currentUserId", nextUserId);
          }
        } catch {}

        const nameFromProfile = profile?.fullName;
        const nameFromUser =
          user?.instructor_name || user?.full_name || user?.name || user?.username;
        const finalName = nameFromProfile || nameFromUser || `Prof. ${user?.username || "Instructor"}`;

        setInstructor((d) => ({
          ...d,
          fullName: finalName,
          email: (profile?.email || user?.email || d.email) ?? d.email,
          specialization: profile?.specialization || d.specialization,
        }));
      } catch (err) {
        console.error("Failed to load instructor identity", err);
      }

      // load dashboard summary (role-aware)
      const { data: summary } = await getDashboardSummary().catch(
        () => ({ data: null } as any)
      );
      if (summary && summary.role === "instructor") {
        const cards = summary.cards || {};
        const submissionStats = cards.my_submissions_summary || {}; // Renamed from my_submissions
        const grades = cards.grades || {};
        const courseSummary = cards.my_courses_summary || {}; // New data
        setStats((s) => ({
          ...s,
          pendingReviews: Number(submissionStats.pending || 0),
          acceptedSubmissions: Number(
            (submissionStats.by_status &&
              submissionStats.by_status["Accepted"]) ||
              0
          ),
          averageGrade: (() => {
            const g = typeof grades.average === "number" ? grades.average : 0;
            // If backend still returns 0..10 average, convert to percent
            const percent = g <= 10 ? g * 10 : g;
            return Number(percent.toFixed(1));
          })(),
          totalCourses: Number(courseSummary.total_courses || 0),
          totalEnrolledStudents: Number(
            courseSummary.total_enrolled_students || 0
          ),
        }));
        if (Array.isArray(courseSummary.courses_details)) {
          setInstructorCourses(courseSummary.courses_details);
          
          // Preload assignment counts for all courses
          const loadAssignmentCounts = async () => {
            const assignmentPromises = courseSummary.courses_details.map(async (course: any) => {
              try {
                const data = await getAssignments({ course_id: course.course_id, limit: 100 }).catch(() => [] as any[]);
                const items = Array.isArray(data) ? data : (data?.data ?? []);
                return { courseId: course.course_id, assignments: items };
              } catch (error) {
                console.error(`Failed to load assignments for course ${course.course_id}:`, error);
                return { courseId: course.course_id, assignments: [] };
              }
            });

            const results = await Promise.all(assignmentPromises);
            const assignmentMap: Record<number, any[]> = {};
            results.forEach(({ courseId, assignments }) => {
              assignmentMap[courseId] = assignments;
            });
            setCourseAssignments(assignmentMap);
          };

          loadAssignmentCounts();
        }
      }

      // Load recent submissions for display (limit 10)
      const { data: recent } = await getDashboardRecentSubmissions({
        mine_only: true,
        limit: 10,
      }).catch(() => ({ data: null } as any));
      if (recent && Array.isArray(recent.items)) {
        const mapped = recent.items.map((r: any) => {
          const numericId = r.id != null ? Number(r.id) : null;
          if (numericId == null)
            console.warn("Recent submission missing id", r);
          const courseLabel = r.course || [
            (r.courseTitle ?? r.course_title ?? "").toString().trim(),
            (r.courseCode ?? r.course_code ?? "").toString().trim() ? `(${r.courseCode ?? r.course_code})` : "",
          ]
            .filter(Boolean)
            .join(" ")
            .trim();
          return {
            id: numericId,
            title: r.title || "Assignment",
            student:
              r.studentFullName || r.studentUsername || `#${r.studentId}`,
            studentId: r.studentNumber || r.studentId,
            course: courseLabel,
            courseId: r.courseId ?? r.course_id ?? r.courseID ?? r.course_id_fk ?? null,
            assignmentId: r.assignmentId ?? r.assignment_id ?? r.assignmentID ?? r.assignment_id_fk ?? null,
            submittedAt: r.submittedAt,
            status: String(r.status || "Pending")
              .toLowerCase()
              .replace("needsrevision", "needs_revision"),
            grade: r.grade ?? null,
            // Compute percentage using assignment max when available (fallback to 100)
            grade100: (() => {
              const isAccepted = String(r.status || "").toLowerCase() === "accepted";
              if (!isAccepted || r.grade == null) return null;
              const gradeNum = Number(r.grade);
              const maxG = Number(r.maxGrade ?? r.max_grade ?? 100);
              if (!Number.isFinite(gradeNum) || !Number.isFinite(maxG) || maxG <= 0) return null;
              return Math.round((gradeNum / maxG) * 100);
            })(),
            feedback:
              r.feedback || r.review_feedback || r.feedback_text || null,
            priority: "medium",
            fileType: r.fileType || "",
          };
        });
        setRecentSubmissions(mapped);
      }

      // Load ALL submissions for counting
      const { data: allData } = await getDashboardRecentSubmissions({
        mine_only: true,
        limit: 1000,
      }).catch(() => ({ data: null } as any));
      if (allData && Array.isArray(allData.items)) {
    const mapped = allData.items.map((r: any) => {
      const numericId = r.id != null ? Number(r.id) : null;
      if (numericId == null) console.warn("Submission missing id", r);
      const courseLabel = r.course || [
        (r.courseTitle ?? r.course_title ?? "").toString().trim(),
        (r.courseCode ?? r.course_code ?? "").toString().trim() ? `(${r.courseCode ?? r.course_code})` : "",
      ]
        .filter(Boolean)
        .join(" ")
        .trim();
      return {
        id: numericId,
        title: r.title || "Assignment",
        student:
          r.studentFullName || r.studentUsername || `#${r.studentId}`,
        studentId: r.studentNumber || r.studentId,
        course: courseLabel,
        courseId: r.courseId ?? r.course_id ?? r.courseID ?? r.course_id_fk ?? null,
        assignmentId: r.assignmentId ?? r.assignment_id ?? r.assignmentID ?? r.assignment_id_fk ?? null,
        submittedAt: r.submittedAt,
        status: String(r.status || "Pending")
          .toLowerCase()
          .replace("needsrevision", "needs_revision"),
        grade: r.grade ?? null,
        // Compute percentage using assignment max when available (fallback to 100)
        grade100: (() => {
          const isAccepted = String(r.status || "").toLowerCase() === "accepted";
          if (!isAccepted || r.grade == null) return null;
          const gradeNum = Number(r.grade);
          const maxG = Number(r.maxGrade ?? r.max_grade ?? 100);
          if (!Number.isFinite(gradeNum) || !Number.isFinite(maxG) || maxG <= 0) return null;
          return Math.round((gradeNum / maxG) * 100);
        })(),
        feedback:
          r.feedback || r.review_feedback || r.feedback_text || null,
        priority: "medium",
        fileType: r.fileType || "",
      };
    });
    setAllSubmissions(mapped);
  }
      try {
        const studentsData = await getStudents();
        setStats((s) => ({ ...s, totalStudents: studentsData.length }));
      } catch (error) {
        console.error("Error loading students:", error);
      }

      try {
        const assignmentsData = await getAssignments();
        setStats((s) => ({ ...s, totalAssignments: assignmentsData.length }));
      } catch (error) {
        console.error("Error loading assignments:", error);
      }
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    }
  };

  const loadNotifications = async () => {
    try {
      // Load existing notifications from localStorage
      const stored = localStorage.getItem("instructorNotifications");
      let existingNotifications = stored ? JSON.parse(stored) : [];

      // Check for new submissions and create notifications
      const newSubmissionNotifications = allSubmissions
        .filter((sub) => {
          const submittedAt = new Date(sub.submittedAt);
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
          const notificationExists = existingNotifications.some(
            (n: any) => n.id === `sub_${sub.id}`
          );
          return submittedAt > oneHourAgo && !notificationExists;
        })
        .map((sub) => ({
          id: `sub_${sub.id}`,
          title: "New Submission",
          message: `${sub.student} submitted ${sub.title}`,
          type: "submission",
          read: false,
          date: new Date(sub.submittedAt).toISOString().split("T")[0],
          createdAt: sub.submittedAt,
        }));

      // Add new notifications to existing ones
      if (newSubmissionNotifications.length > 0) {
        const updatedNotifications = [
          ...existingNotifications,
          ...newSubmissionNotifications,
        ];
        localStorage.setItem(
          "instructorNotifications",
          JSON.stringify(updatedNotifications)
        );
        setNotifications(updatedNotifications);
      } else {
        // Only update if notifications actually changed to avoid unnecessary re-renders
        if (JSON.stringify(notifications) !== JSON.stringify(existingNotifications)) {
          setNotifications(existingNotifications);
        }
      }

      // Count unread notifications
      const currentNotifications =
        newSubmissionNotifications.length > 0
          ? [...existingNotifications, ...newSubmissionNotifications]
          : existingNotifications;
      const newUnreadCount = currentNotifications.filter((n: any) => !n.read).length;
      
      // Only update if count actually changed
      if (unreadCount !== newUnreadCount) {
        setUnreadCount(newUnreadCount);
      }
    } catch (error) {
      console.error("Error loading notifications:", error);
    }
  };

  useEffect(() => {
    loadDashboardData();
    // Trigger animation after a short delay
    const timer = setTimeout(() => {
      setIsLoading(false);
      setIsAnimated(true);
    }, 100);
    return () => clearTimeout(timer);
  }, []); // Empty dependency array means this runs once on mount


  // Refresh dashboard counts immediately when an enrollment is approved elsewhere
  useEffect(() => {
    const onEnrollmentApproved = () => {
      // Reload dashboard summary and course counts immediately
      loadDashboardData();
    };
    const onPendingChanged = () => {
      // Reload to update pending list/counters and course counts
      loadDashboardData();
    };
    window.addEventListener("enrollmentApproved", onEnrollmentApproved as EventListener);
    window.addEventListener("pendingEnrollmentsChanged", onPendingChanged as EventListener);
    return () => {
      window.removeEventListener("enrollmentApproved", onEnrollmentApproved as EventListener);
      window.removeEventListener("pendingEnrollmentsChanged", onPendingChanged as EventListener);
    };
  }, []);

  // Listen for profile updates from AccountSettings page
  useEffect(() => {
    const handleProfileUpdate = () => {
      loadDashboardData();
    };

    window.addEventListener("profileUpdated", handleProfileUpdate);
    return () =>
      window.removeEventListener("profileUpdated", handleProfileUpdate);
  }, []);

  // Load notifications when submissions change (but only once after initial load)
  useEffect(() => {
    if (allSubmissions.length > 0) {
      loadNotifications();
    }
  }, [allSubmissions.length]); // Only depend on length, not the entire array

  // Debugging: Log stats whenever it changes
  // useEffect(() => {
  //   console.log("Current Dashboard Stats:", stats);
  // }, [stats]);

  // Poll for new notifications every 30 seconds (removed allSubmissions dependency)
  useEffect(() => {
    const interval = setInterval(() => {
      loadNotifications();
    }, 30000);
    return () => clearInterval(interval);
  }, []); // Empty dependency array - only run once on mount

  // Add focus event listener to refresh data when returning to dashboard
  useEffect(() => {
    const handleFocus = () => {
      // Only reload if we haven't loaded data recently (avoid excessive reloading)
      const lastLoad = localStorage.getItem('lastDashboardLoad');
      const now = Date.now();
      if (!lastLoad || (now - parseInt(lastLoad)) > 30000) { // 30 seconds
        loadDashboardData();
        localStorage.setItem('lastDashboardLoad', now.toString());
      }
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  const handleSignOut = () => {
    // Clear token and redirect
    localStorage.removeItem("token");
    window.location.href = "/signin";
  };

  // Navigation handlers

  const handleManageAll = () => {
    navigate("/instructor/tasks");
  };

  const handleCreateAssignment = () => {
    navigate("/instructor/create-assignment");
  };

  const handleViewAnalytics = () => {
    navigate("/instructor/analytics");
  };

  const handleViewAllStudents = () => {
    navigate("/instructor/students");
  };

  const handleAddStudent = () => {
    navigate("/instructor/students/new");
  };

  const handleCreateCourse = () => {
    navigate("/instructor/courses/create");
  };

  // increment messagesSent then navigate (persist to localStorage so it survives navigation)
  const handleSendAnnouncement = () => {
    // update persistence synchronously using current state, then update UI state and navigate.
    try {
      const next = (messagesSent || 0) + 1;
      localStorage.setItem("messagesSent", String(next));
      setMessagesSent(next);
    } catch (err) {
      // if localStorage is unavailable, still update UI optimistically
      setMessagesSent((prev) => (prev || 0) + 1);
    }
    // navigate after persisting so the new value survives the route change
    navigate("/instructor/announcements");
  };

  // Export handlers
  const handleExportStudents = async (format: "csv" | "excel" = "excel") => {
    try {
      console.log("Starting export with format:", format);
      const response = await exportStudentsData({
        format,
        include_grades: true,
        include_assignments: true,
      });

      console.log("Export response:", response);

      // Create blob and download
      const blob = new Blob([response.data], {
        type: format === "excel" 
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "text/csv",
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `students_report_${new Date().toISOString().split('T')[0]}.${format === "excel" ? "xlsx" : "csv"}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error("Export failed:", error);
      console.error("Error details:", error.response?.data);
      alert(`Failed to export students data: ${error.response?.data?.detail || error.message}`);
    }
  };


  const handleNotifications = () => {
    // Mark all notifications as read when opening notifications page
    const updatedNotifications = notifications.map((n) => ({
      ...n,
      read: true,
    }));
    setNotifications(updatedNotifications);
    setUnreadCount(0);
    localStorage.setItem(
      "instructorNotifications",
      JSON.stringify(updatedNotifications)
    );
    navigate("/instructor/notifications");
  };

  const handleSettings = () => {
    navigate("/instructor/settings");
  };

  const downloadSubmission = async (id: number) => {
    if (!id || isNaN(id)) {
      console.error("Invalid submission ID:", id);
      alert("Invalid submission ID. Cannot download file.");
      return;
    }

    try {
      console.log("Downloading submission with ID:", id);
      const res = await downloadSubmissionFile(id);

      console.log("Download response:", res);

      if (!res.data) {
        throw new Error("No file data received");
      }

      // Create blob with proper content type
      const blob = new Blob([res.data], {
        type: res.headers["content-type"] || "application/octet-stream",
      });

      // Get filename from Content-Disposition header if available
      let filename = `submission-${id}`;
      const contentDisposition = res.headers["content-disposition"];
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(
          /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/
        );
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, "");
        }
      }

      // Force download by creating a temporary link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();

      // Clean up
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 100);

      console.log("Download initiated successfully with filename:", filename);
    } catch (error) {
      console.error("Download failed:", error);
      // Silently handle the error - user will see that download didn't start
    }
  };

  const viewSubmission = async (id: number) => {
    // Always open the review modal
    setReviewingSubmissionId(id);
  };

  const getStatusColor = (
    status: "accepted" | "pending" | "reviewed" | "needs_revision" | "rejected"
  ) => {
    // ... (rest of the code remains the same)
    switch (status) {
      case "accepted":
        return "text-emerald-400 bg-emerald-500/20 border-emerald-400/30";
      case "pending":
        return "text-amber-400 bg-amber-500/20 border-amber-400/30";
      case "reviewed":
        return "text-sky-400 bg-sky-500/20 border-sky-400/30"; // Changed to sky
      case "needs_revision":
      case "rejected": // Add rejected here
        return "text-red-400 bg-red-500/20 border-red-400/30";
      default:
        return "text-gray-400 bg-gray-500/20 border-gray-400/30";
    }
  };

  const getStatusIcon = (
    status: "accepted" | "pending" | "reviewed" | "needs_revision" | "rejected"
  ) => {
    switch (status) {
      case "accepted":
        return CheckCircle;
      case "pending":
        return Clock;
      case "reviewed":
        return Eye;
      case "needs_revision":
      case "rejected": // Add rejected here
        return AlertTriangle;
      default:
        return FileText;
    }
  };

  const getPriorityColor = (priority: "high" | "medium" | "low") => {
    switch (priority) {
      case "high":
        return "border-l-red-400 bg-red-500/10";
      case "medium":
        return "border-l-amber-400 bg-amber-500/10";
      case "low":
        return "border-l-sky-400 bg-sky-500/10"; // Changed to sky
      default:
        return "border-l-gray-400 bg-gray-500/10";
    }
  };

  const filteredSubmissions = recentSubmissions.filter((submission) => {
    const matchesSearch =
      (submission.title || "")
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      (submission.student || "")
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
    const matchesFilter =
      selectedFilter === "all" || submission.status === selectedFilter;
    return matchesSearch && matchesFilter;
  });
  
  // Courses to list under the section (we use instructorCourses as the source of truth)
  const displayedCourseList = showAllSubmissions
    ? instructorCourses
    : instructorCourses.slice(0, 3);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-200 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-sky-400 to-sky-600 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Stethoscope className="w-8 h-8 text-white" />
          </div>
          <p className="text-gray-800 font-medium">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  const displayName = instructor.fullName || "Instructor";

  return (
    <div className="min-h-screen relative overflow-hidden bg-gray-200">
      {/* Animated Background */}
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

      {/* Header */}
      <div className="relative z-10 bg-gray-200/10 backdrop-blur-md border-b border-gray-300">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 group">
              <div className="relative">
                <button
                  onClick={handleLogoClick}
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
                <p className="text-gray-800 font-medium">
                  Instructor Dashboard
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-6">
                <button
                  onClick={handleNotifications}
                  className="relative p-2 text-gray-800 hover:text-gray-900 transition-colors"
                >
                  <Bell
                    className={`w-5 h-5 ${
                      unreadCount > 0 ? "text-red-500" : ""
                    }`}
                  />
                  {unreadCount > 0 && (
                    <>
                      <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full animate-pulse flex items-center justify-center">
                        <span className="text-white text-xs font-bold">
                          {unreadCount > 9 ? "9+" : unreadCount}
                        </span>
                      </div>
                    </>
                  )}
                </button>
              </div>

              <div className="pl-4 border-l border-gray-400">
                <ProfileDropdown
                  userInfo={{
                    fullName: displayName,
                    email: instructor.email || "",
                    role: "Instructor",
                    specialization: instructor.specialization || "",
                    department: "",
                    phone: "",
                  }}
                />
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
                <Crown className="w-8 h-8 text-white" />
              </div>
              <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-yellow-400 animate-pulse" />
            </div>
            <div>
              <h2 className="text-3xl font-black bg-gradient-to-r from-gray-800 via-gray-900 to-black bg-clip-text text-transparent">
                Welcome back, {displayName}!
              </h2>
              <p className="text-gray-800 text-lg">
                Monitor student progress and manage submissions
              </p>
            </div>
          </div>
        </div>

        {/* Enhanced Stats Grid */}
        <div
          className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 transform transition-all duration-1000 ${
            isAnimated ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
          }`}
          style={{ transitionDelay: "200ms" }}
        >
          <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-6 transform transition-all duration-500 hover:scale-105 group">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-sky-500 to-sky-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Users className="w-6 h-6 text-white" />
              </div>
            </div>
            <h3 className="text-2xl font-black text-gray-900 mb-1">
              {stats.totalStudents}
            </h3>
            <p className="text-gray-800 text-sm font-medium">Total Students</p>
            <div className="mt-3 flex items-center gap-2">
              <div className="w-2 h-2 bg-sky-500 rounded-full animate-pulse" />
              <span className="text-xs text-sky-400">Active this semester</span>
            </div>
          </div>

          <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-6 transform transition-all duration-500 hover:scale-105 group">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Clock className="w-6 h-6 text-white" />
              </div>
            </div>
            <h3 className="text-2xl font-black text-gray-900 mb-1">
              {stats.pendingReviews}
            </h3>
            <p className="text-gray-800 text-sm font-medium">Pending Reviews</p>
            <div className="mt-3 flex items-center gap-2">
              <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
              <span className="text-xs text-amber-400">Requires attention</span>
            </div>
          </div>

          <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-6 transform transition-all duration-500 hover:scale-105 group">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-emerald-500 to-green-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <CheckCircle className="w-6 h-6 text-white" />
              </div>
            </div>
            <h3 className="text-2xl font-black text-gray-900 mb-1">
              {stats.acceptedSubmissions}
            </h3>
            <p className="text-gray-800 text-sm font-medium">Accepted</p>
            <div className="mt-3 flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-xs text-emerald-400">This month</span>
            </div>
          </div>

          <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-6 transform transition-all duration-500 hover:scale-105 group">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-sky-500 to-sky-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <BookMarked className="w-6 h-6 text-white" />
              </div>
            </div>
            <h3 className="text-2xl font-black text-gray-900 mb-1">
              {stats.totalCourses}
            </h3>
            <p className="text-gray-800 text-sm font-medium">Total Courses</p>
            <div className="mt-3 flex items-center gap-2">
              <div className="w-2 h-2 bg-sky-500 rounded-full animate-pulse" />
              <span className="text-xs text-sky-400">Managed by you</span>
            </div>
          </div>

          <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-6 transform transition-all duration-500 hover:scale-105 group">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-sky-500 to-sky-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Star className="w-6 h-6 text-white" />
              </div>
            </div>
            <h3 className="text-2xl font-black text-gray-900 mb-1">
              {stats.averageGrade}%
            </h3>
            <p className="text-gray-800 text-sm font-medium">Average Grade</p>
            <div className="mt-3 flex items-center gap-2">
              <div className="w-2 h-2 bg-sky-500 rounded-full animate-pulse" />
              <span className="text-xs text-sky-400">Class performance</span>
            </div>
          </div>
        </div>

        {/* NEW: My Courses Section (retained as it's a list) */}
        <div
          className={`mb-8 transform transition-all duration-1000 ${
            isAnimated ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
          }`}
          style={{ transitionDelay: "600ms" }}
        >
          <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-gradient-to-r from-sky-500 to-sky-600 rounded-xl flex items-center justify-center">
                <BookMarked className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-xl font-black text-gray-900">My Courses</h3>
            </div>

            {instructorCourses.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {instructorCourses.map((course) => (
                  <div
                    key={course.course_id}
                    className="bg-gray-100/50 border border-gray-300 rounded-xl p-4 flex justify-between items-center group hover:bg-gray-200/70 transition-all duration-300"
                  >
                    <div>
                      <h4 className="text-lg font-bold text-gray-900">
                        {course.title} ({course.code})
                      </h4>
                      <p className="text-gray-800 text-sm">
                        {course.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-gray-800">
                      <Users className="w-4 h-4" />
                      <span className="font-medium">
                        {course.student_count} Students
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-700 text-center">
                No courses created yet.
              </p>
            )}
            {/* Optional: Add a "View All Courses" button if there are many */}
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Recent Submissions - Enhanced */}
          <div
            className={`lg:col-span-2 transform transition-all duration-1000 ${
              isAnimated
                ? "translate-y-0 opacity-100"
                : "translate-y-8 opacity-0"
            }`}
            style={{ transitionDelay: "400ms" }}
          >
            <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-r from-sky-500 to-sky-600 rounded-xl flex items-center justify-center">
                    <ClipboardList className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-xl font-black text-gray-900">
                    Recent Submissions
                  </h3>
                </div>
                <button
                  onClick={handleManageAll}
                  className="group flex items-center gap-2 text-sky-600 hover:text-sky-700 font-medium text-sm transition-colors"
                >
                  <span>Manage All</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>

              {/* Search and Filter */}
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search assignments..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-gray-100/70 border border-gray-300 rounded-2xl py-2 pl-10 pr-4 text-gray-900 placeholder-gray-500 focus:outline-none focus:border-sky-500 focus:bg-gray-200/70 transition-all"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Filter className="text-gray-600 w-4 h-4" />
                  <select
                    value={selectedFilter}
                    onChange={(e) => setSelectedFilter(e.target.value)}
                    className="bg-gray-100/70 border border-gray-300 rounded-2xl px-3 py-2 text-gray-900 focus:outline-none focus:border-sky-500 focus:bg-gray-200/70 transition-all backdrop-blur-xl"
                  >
                    <option
                      value="all"
                      style={{
                        backgroundColor: "rgb(243 244 246)", // gray-100
                        color: "rgb(17 24 39)", // gray-900
                      }}
                    >
                      All Status
                    </option>
                    <option
                      value="pending"
                      style={{
                        backgroundColor: "rgb(243 244 246)",
                        color: "rgb(17 24 39)",
                      }}
                    >
                      Pending
                    </option>
                    
                    <option
                      value="accepted"
                      style={{
                        backgroundColor: "rgb(243 244 246)",
                        color: "rgb(17 24 39)",
                      }}
                    >
                      Accepted
                    </option>
                    <option
                      value="needs_revision"
                      style={{
                        backgroundColor: "rgb(243 244 246)",
                        color: "rgb(17 24 39)",
                      }}
                    >
                      Needs Revision
                    </option>
                  </select>
                </div>
              </div>

              <div className="space-y-4">
                {displayedCourseList.map((course: any) => {
                  const cid = Number(course.course_id);
                  const stats = getCourseSubmissionStats(course);
                  const total = stats.total || 0;
                  const accepted = stats.by.accepted || 0;
                  const pending = stats.by.pending || 0;
                  const needsRev = stats.by.needs_revision || 0;
                  const reviewed = stats.by.reviewed || 0;
                  const assignmentsArr = Array.isArray(courseAssignments[cid]) ? courseAssignments[cid] : [];
                  const assignmentsCount = assignmentsArr.length;
                  // Fallback total from assignment submission counts (if API provides)
                  const fallbackTotal = assignmentsArr.reduce((sum: number, a: any) => {
                    const n = Number((a?.submissions_count ?? a?.submissionsCount ?? 0));
                    return sum + (Number.isFinite(n) ? n : 0);
                  }, 0);
                  const displayTotal = total > 0 ? total : fallbackTotal;
                  const pct = displayTotal > 0 ? Math.round((accepted / displayTotal) * 100) : 0;
                  try {
                    // Debug: log course and computed stats
                    console.debug('[RecentSubmissions] Course stats', {
                      course_id: course.course_id ?? course.id,
                      code: course.code ?? course.course_code,
                      title: course.title ?? course.name ?? course.course_title,
                      total,
                      accepted,
                      pending,
                      needsRev,
                      reviewed,
                      assignmentsCount,
                      fallbackTotal,
                    });
                  } catch {}
                  return (
                    <div key={cid} className="bg-white rounded-2xl border border-gray-200 shadow-sm">
                      {/* Course Header - clickable */}
                      <button
                        onClick={async () => {
                          setExpandedCourses((prev) => ({ ...prev, [cid]: !prev[cid] }));
                          const willExpand = !expandedCourses[cid];
                          if (willExpand && !courseAssignments[cid] && !loadingCourses[cid]) {
                            try {
                              setLoadingCourses((p) => ({ ...p, [cid]: true }));
                              const data = await getAssignments({ course_id: cid, limit: 100 }).catch(() => [] as any[]);
                              const items = Array.isArray(data) ? data : (data?.data ?? []);
                              setCourseAssignments((p) => ({ ...p, [cid]: items }));
                            } finally {
                              setLoadingCourses((p) => ({ ...p, [cid]: false }));
                            }
                          }
                        }}
                        className="w-full text-left px-6 py-5 hover:bg-gray-50 rounded-2xl"
                      >
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-2 h-8 rounded bg-sky-500" />
                              <h4 className="text-lg font-extrabold text-gray-900">{course.title || course.name || course.course_title} ({course.code || course.course_code})</h4>
                              <span className="text-xs font-bold px-2 py-1 rounded-full bg-sky-500/10 text-sky-700 border border-sky-400/30">
                                {assignmentsCount} assignments
                              </span>
                            </div>
                            <ChevronDown className={`w-5 h-5 text-gray-700 transition-transform ${expandedCourses[cid] ? "rotate-180" : ""}`} />
                          </div>
                          {/* Stats row */}
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-400/30">Accepted: {accepted}</span>
                            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-500/10 text-amber-700 border border-amber-400/30">Pending: {pending}</span>
                            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-red-500/10 text-red-700 border border-red-400/30">Needs Revision: {needsRev}</span>
                            
                            <span className="ml-auto text-xs text-gray-700 font-medium flex items-center gap-1">Total: {displayTotal}{(displayTotal > 0 && total === 0) ? <span className="text-[10px] text-gray-500">(from assignments)</span> : null}</span>
                          </div>
                          {/* Progress */}
                          <div className="w-full h-2 rounded-full bg-gray-200 overflow-hidden">
                            <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </button>

                      {/* Assignments under Course */}
                      {expandedCourses[cid] && (
                        <div className="px-6 pb-6 space-y-4">
                          {loadingCourses[cid] && (
                            <div className="text-sm text-gray-700">Loading assignments...</div>
                          )}
                          {!loadingCourses[cid] && Array.isArray(courseAssignments[cid]) && courseAssignments[cid].length === 0 && (
                            <div className="text-sm text-gray-700">No assignments for this course.</div>
                          )}
                          {!loadingCourses[cid] && Array.isArray(courseAssignments[cid]) && courseAssignments[cid].length > 0 && (
                            <div className="space-y-3">
                              {courseAssignments[cid]
                                .filter((a: any) => String(a.title || "").toLowerCase().includes(searchTerm.toLowerCase()))
                                .map((a: any) => (
                                  <div key={a.assignment_id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <h5 className="text-base font-bold text-gray-900">{a.title}</h5>
                                        {typeof a.submissions_count === "number" && (
                                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-400/30">
                                            {a.submissions_count} submissions
                                          </span>
                                        )}
                                      </div>
                                      {a.deadline && (
                                        <div className="mt-1 flex items-center gap-2 text-xs text-gray-700">
                                          <Calendar className="w-3 h-3" />
                                          <span>{new Date(a.deadline).toLocaleDateString()}</span>
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => navigate(`/instructor/tasks?course_id=${cid}&assignment_id=${a.assignment_id}`)}
                                        className="px-3 py-2 text-sm font-medium rounded-lg bg-sky-500/10 border border-sky-400/30 text-sky-700 hover:bg-sky-500/20"
                                      >
                                        View Submissions
                                      </button>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Load All Button (operates on courses) */}
              {instructorCourses.length > 3 && (
                <div className="mt-6 text-center">
                  <button
                    onClick={() => setShowAllSubmissions(!showAllSubmissions)}
                    className="group bg-gray-200/50 border border-gray-300 hover:bg-gray-300/70 text-gray-800 font-bold py-3 px-6 rounded-2xl transition-all duration-500 transform hover:-translate-y-1 hover:scale-[1.02] flex items-center justify-center gap-3 shadow-lg mx-auto"
                  >
                    <ArrowRight
                      className={`w-5 h-5 group-hover:scale-110 transition-transform ${
                        showAllSubmissions ? "rotate-90" : ""
                      }`}
                    />
                    <span>
                      {showAllSubmissions
                        ? "Show Less"
                        : `Load All (${instructorCourses.length - 3} more)`}
                    </span>
                  </button>
                </div>
              )}

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={handleCreateAssignment}
                  className="group bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white font-bold py-3 px-6 rounded-2xl transition-all duration-500 transform hover:-translate-y-1 hover:scale-[1.02] flex items-center justify-center gap-3 shadow-2xl shadow-sky-500/20"
                >
                  <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  <span>Create Assignment</span>
                </button>
                <button
                  onClick={handleViewAnalytics}
                  className="group bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white font-bold py-3 px-6 rounded-2xl transition-all duration-500 transform hover:-translate-y-1 hover:scale-[1.02] flex items-center justify-center gap-3 shadow-2xl shadow-sky-500/20"
                >
                  <BarChart3 className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  <span>Analytics</span>
                </button>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-8">
            {/* Students Section */}
            <div
              className={`transform transition-all duration-1000 ${
                isAnimated
                  ? "translate-y-0 opacity-100"
                  : "translate-y-8 opacity-0"
              }`}
              style={{ transitionDelay: "700ms" }}
            >
              <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 bg-gradient-to-r from-sky-500 to-sky-600 rounded-lg flex items-center justify-center">
                    <Users className="w-4 h-4 text-white" />
                  </div>
                  <h3 className="text-lg font-black text-gray-900">Students</h3>
                </div>
                {/* Only show the button, no student list */}
                <button
                  onClick={handleViewAllStudents}
                  className="w-full mt-4 group bg-gray-100/70 border border-gray-300 text-sky-800 font-medium py-3 px-4 rounded-xl hover:bg-gray-200/70 transition-all duration-300 flex items-center justify-center gap-2"
                >
                  <Eye className="w-4 h-4 text-sky-500" />
                  <span>View All Students</span>
                  <ArrowRight className="w-4 h-4 ml-auto group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>

            {/* Quick Actions */}
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
                    onClick={handleAddStudent}
                    className="w-full group bg-gray-100/70 border border-gray-300 text-sky-800 font-medium py-3 px-4 rounded-xl hover:bg-gray-200/70 transition-all duration-300 flex items-center gap-3"
                  >
                    <UserPlus className="w-4 h-4 text-sky-500" />
                    <span>Add Student</span>
                    <ArrowRight className="w-4 h-4 ml-auto group-hover:translate-x-1 transition-transform" />
                  </button>

                  <button
                    onClick={handleCreateCourse}
                    className="w-full group bg-gray-100/70 border border-gray-300 text-sky-800 font-medium py-3 px-4 rounded-xl hover:bg-gray-200/70 transition-all duration-300 flex items-center gap-3"
                  >
                    <BookMarked className="w-4 h-4 text-sky-500" />
                    <span>Create Course</span>
                    <ArrowRight className="w-4 h-4 ml-auto group-hover:translate-x-1 transition-transform" />
                  </button>

                  <button
                    onClick={() => navigate("/instructor/courses")}
                    className="w-full group bg-gray-100/70 border border-gray-300 text-sky-800 font-medium py-3 px-4 rounded-xl hover:bg-gray-200/70 transition-all duration-300 flex items-center gap-3"
                  >
                    <BookMarked className="w-4 h-4 text-sky-500" />
                    <span>View Courses</span>
                    <ArrowRight className="w-4 h-4 ml-auto group-hover:translate-x-1 transition-transform" />
                  </button>

                  <button
                    onClick={() => navigate("/instructor/pending-enrollments")}
                    className="w-full group bg-gray-100/70 border border-gray-300 text-sky-800 font-medium py-3 px-4 rounded-xl hover:bg-gray-200/70 transition-all duration-300 flex items-center gap-3"
                  >
                    <Users className="w-4 h-4 text-sky-500" />
                    <span>View Pendings</span>
                    <ArrowRight className="w-4 h-4 ml-auto group-hover:translate-x-1 transition-transform" />
                  </button>

                  <button
                    onClick={handleSendAnnouncement}
                    className="w-full group bg-gray-100/70 border border-gray-300 text-sky-800 font-medium py-3 px-4 rounded-xl hover:bg-gray-200/70 transition-all duration-300 flex items-center gap-3"
                  >
                    <Mail className="w-4 h-4 text-sky-500" />
                    <span>Send Announcement</span>
                    <ArrowRight className="w-4 h-4 ml-auto group-hover:translate-x-1 transition-transform" />
                  </button>

                  {/* Export Button */}
                  <div className="pt-3 border-t border-gray-300">
                    <button
                      onClick={() => handleExportStudents("csv")}
                      className="w-full group bg-emerald-100/70 border border-emerald-300 text-emerald-800 font-medium py-3 px-4 rounded-xl hover:bg-emerald-200/70 transition-all duration-300 flex items-center gap-3"
                    >
                      <Download className="w-4 h-4 text-emerald-500" />
                      <span>Export Students Data</span>
                      <ArrowRight className="w-4 h-4 ml-auto group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
                </div>

                {/* Pending Enrollment Requests section removed - manage from dedicated view */}
              </div>
            </div>
          </div>
        </div>
      </div>
      {modalSubmissionId != null && (
        <SubmissionModal
          id={modalSubmissionId}
          onClose={() => setModalSubmissionId(null)}
          onReviewed={(updated) => {
            // update recentSubmissions and quick stats
            setRecentSubmissions((prev) =>
              prev.map((s) =>
                s.id === updated.id
                  ? {
                      ...s,
                      ...updated,
                      grade100:
                        updated.grade != null
                          ? Math.round(Number(updated.grade) * 10)
                          : updated.grade100 ?? s.grade100,
                      feedback:
                        updated.feedback ?? updated.feedback_text ?? s.feedback,
                    }
                  : s
              )
            );
            // recompute pendingReviews/approvedSubmissions
            setStats((st) => ({
              ...st,
              pendingReviews: Math.max(0, (st.pendingReviews || 0) - 1),
              acceptedSubmissions:
                (st.acceptedSubmissions || 0) +
                (updated.status === "accepted" ? 1 : 0),
            }));
          }}
        />
      )}

      {/* Submission Review Modal */}
      {reviewingSubmissionId && (
        <SubmissionReviewModal
          submissionId={reviewingSubmissionId}
          onClose={() => setReviewingSubmissionId(null)}
          onSaved={handleReviewSaved}
        />
      )}
    </div>
  );
}
