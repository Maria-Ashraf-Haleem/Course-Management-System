import { useEffect, useMemo, useState, useCallback } from "react";
import toast from "react-hot-toast";
import { useNavigate, useSearchParams } from "react-router-dom";
import { jsPDF } from "jspdf";
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  Calendar,
  BookOpen,
  Award,
  TrendingUp,
  FileText,
  Clock,
  CheckCircle,
  AlertTriangle,
  Eye,
  Download,
  Edit,
  MessageSquare,
  Star,
  Target,
  Activity,
  BarChart3,
  PieChart,
  Upload,
  ThumbsUp,
  ThumbsDown,
  Send,
  Plus,
  Filter,
  Search,
  ChevronDown,
  GraduationCap,
  Stethoscope,
  Crown,
  Sparkles,
  Bell,
  Settings,
  Users,
  UserCheck,
  ClipboardList,
  XCircle,
  Zap,
  Shield,
  LogOut,
  MoreVertical,
  Trash2,
  RefreshCw,
  SortAsc,
  SortDesc,
  MapPin,
  Globe,
  CreditCard,
  Bookmark,
  ChevronRight,
  TrendingDown,
} from "lucide-react";

import {
  listInstructorSubmissions,
  getInstructorSubmission,
  reviewInstructorSubmission,
  fileUrl,
  getStudentProfile,
  getStudentAcademicInfo,
  updateStudentGpa,
  updateStudentProfile,
  getStudentEnrollments,
  getStudentAttendance,
  getCourses,
  adminEnrollStudent,
  getInstructorProfile,
  getAnalytics,
} from "../../lib/api";
import { signOut } from "../../lib/auth";
import { createAnnouncement } from "../../lib/api";

/** ---------- types (UI-friendly) ---------- */
type UiStatus = "approved" | "pending" | "reviewed" | "needs_revision";

interface UiSubmission {
  id: number;
  title: string;
  course?: string | null;
  submittedDate?: string | null; // ISO string
  dueDate?: string | null; // not available (keep null so UI still works)
  status: UiStatus;
  grade?: number | null;
  feedback?: string | null;
  fileType?: string | null;
  filePath?: string | null; // to download
  priority?: "high" | "medium" | "low"; // purely visual; optional
}

/** Map API status to UI status chips */
function mapStatus(apiStatus?: string | null): UiStatus {
  switch ((apiStatus || "").toLowerCase()) {
    case "accepted":
      return "approved";
    case "needsrevision":
      return "needs_revision";
    case "rejected":
      return "needs_revision"; // display as red chip
    case "pending":
    default:
      return "pending";
  }
}

/** ----- UI helpers (kept exactly like your styling expects) ----- */
const getStatusColor = (status: UiStatus) => {
  switch (status) {
    case "approved":
      return "text-emerald-400 bg-emerald-500/20 border-emerald-400/30";
    case "pending":
      return "text-amber-400 bg-amber-500/20 border-amber-400/30";
    case "reviewed":
      return "text-blue-400 bg-blue-500/20 border-blue-400/30";
    case "needs_revision":
      return "text-red-400 bg-red-500/20 border-red-400/30";
    default:
      return "text-gray-400 bg-gray-500/20 border-gray-400/30";
  }
};

const getStatusIcon = (status: UiStatus) => {
  switch (status) {
    case "approved":
      return CheckCircle;
    case "pending":
      return Clock;
    case "reviewed":
      return Eye;
    case "needs_revision":
      return AlertTriangle;
    default:
      return FileText;
  }
};

const getGradeColor = (grade: number) => {
  if (grade >= 9) return "text-emerald-400";
  if (grade >= 8) return "text-blue-400";
  if (grade >= 7) return "text-amber-400";
  return "text-red-400";
};

const getCourseStatusColor = (s: string) => {
  switch (s) {
    case "excellent":
      return "text-emerald-400 bg-emerald-500/20";
    case "good":
      return "text-blue-400 bg-blue-500/20";
    case "satisfactory":
      return "text-amber-400 bg-amber-500/20";
    case "needs_improvement":
      return "text-red-400 bg-red-500/20";
    default:
      return "text-gray-400 bg-gray-500/20";
  }
};

/** ---------- component ---------- */
export default function InstructorStudentProfile() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  // You control what student we're looking at via URL:
  //   /doctor/student?id=123&name=Ahmed%20Hassan&year=Year%204&dept=Orthodontics
  const studentId = params.get("id") || params.get("student_id") || "";
  const displayName = params.get("name") || "Student";
  const displayYear = params.get("year") || "";
  const displayDept = params.get("dept") || "";

  // STATE (no mock data)
  const [activeTab, setActiveTab] = useState<
    "overview" | "submissions" | "courses" | "attendance" | "feedback"
  >("overview");
  const [isAnimated, setIsAnimated] = useState(false);

  const [submissions, setSubmissions] = useState<UiSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Student profile state
  const [studentProfile, setStudentProfile] = useState<any>(null);
  const [academicInfo, setAcademicInfo] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Course selection state
  const [availableCourses, setAvailableCourses] = useState<any[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string | number>("");
  const [initialCourse, setInitialCourse] = useState<string | number>(""); // To store the course initially loaded

  // GPA editing state
  const [editingGpa, setEditingGpa] = useState(false);
  const [newGpa, setNewGpa] = useState<string>("");
  const [updatingGpa, setUpdatingGpa] = useState(false);

  // Courses and attendance state
  const [studentCourses, setStudentCourses] = useState<any[]>([]);
  const [attendanceData, setAttendanceData] = useState<any>(null);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  // Instructor profile (for header name/department)
  const [instructorInfo, setInstructorInfo] = useState<any>(null);
  // Student rank (from analytics top_students)
  const [studentRank, setStudentRank] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await getInstructorProfile(); // /instructor/profile/me
        setInstructorInfo(data);
      } catch (e) {
        // non-fatal; keep defaults
        console.warn("Failed to load instructor profile", e);
      }
    })();
  }, []);

  // Load analytics and compute this student's rank (top 5)
  useEffect(() => {
    (async () => {
      try {
        const analytics = await getAnalytics("month");
        const top = (analytics?.data?.top_students ?? analytics?.top_students ?? []) as any[];
        const sid = Number(studentId);
        let rank: number | null = null;
        for (const s of top) {
          if ((s.student_id != null && Number(s.student_id) === sid) || (s.name && s.name === displayName)) {
            rank = s.rank ?? null;
            break;
          }
        }
        setStudentRank(rank);
      } catch (e) {
        // ignore
      }
    })();
  }, [studentId, displayName]);

  // Send Message modal state
  const [msgOpen, setMsgOpen] = useState(false);
  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [msgPriority, setMsgPriority] = useState("normal");
  const [sendingMsg, setSendingMsg] = useState(false);

  const openMessageModal = () => {
    setMsgTitle("");
    setMsgBody("");
    setMsgPriority("normal");
    setMsgOpen(true);
  };

  // Export a modern HTML report (alternative to PDF) with perfect layout
  const exportStudentReportHtml = async () => {
    try {
      const name =
        studentProfile?.full_name ||
        studentProfile?.fullName ||
        displayName ||
        "Student";
      const email = studentProfile?.email || "-";
      const phone = studentProfile?.phone || "-";
      const courses = academicInfo?.current_courses || [];
      // Enrich recent submissions with actual grades (and optional max)
      const recentForReport = submissions.slice(0, 20);
      const coerceNum = (v: any): number | null => {
        if (v == null) return null;
        const n = typeof v === "string" ? Number(v) : Number(v);
        return Number.isFinite(n) ? n : null;
      };
      const enrichedSubs = await Promise.all(
        recentForReport.map(async (s) => {
          try {
            const { data } = await getInstructorSubmission(s.id);
            const fb = data?.feedback;
            const grade =
              typeof fb?.grade === "number"
                ? fb.grade
                : (typeof data?.grade === "number" ? data.grade : null);
            // Try to resolve max grade from detail payload
            const maxCandidates = [
              data?.max_grade,
              data?.max_points,
              data?.points_max,
              data?.total_points,
              data?.out_of,
              data?.assignment?.max_grade,
              data?.assignment?.max_points,
              data?.assignment?.out_of,
            ];
            let maxGrade: number | null = null;
            for (const m of maxCandidates) {
              const n = coerceNum(m);
              if (n != null && n > 0) { maxGrade = n; break; }
            }
            return { ...s, grade, maxGrade } as any;
          } catch {
            return { ...s } as any;
          }
        })
      );

      const html = `<!DOCTYPE html>
      <html lang="en"><head><meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width,initial-scale=1"/>
      <title>Student Report - ${name}</title>
      <style>
        :root{--primary:#0ea5e9;--primary-2:#2563eb;--text:#0f172a;--muted:#6b7280;--border:#e5e7eb;--bg:#ffffff;--thead:#f8fafc}
        *{box-sizing:border-box}
        html,body{background:var(--bg)}
        body{font-family:Segoe UI, Roboto, Helvetica, Arial, sans-serif;direction:ltr;line-height:1.6;margin:32px auto;color:var(--text);max-width:980px;font-size:14px}
        h1{font-size:28px;margin:0 0 6px;font-weight:900;color:#0b1220}
        h2{font-size:20px;margin:0 0 10px;font-weight:800;color:#0b1220}
        h3{font-size:14px;margin:0 0 6px;font-weight:700;color:#111827}
        .muted{color:var(--muted)}
        .wrap{display:flex;flex-direction:column;gap:16px}
        .header{border:1px solid var(--border);border-radius:16px;overflow:hidden}
        .header-top{background:linear-gradient(90deg,var(--primary),var(--primary-2));padding:18px 22px;color:#fff}
        .header-top .title{font-size:22px;font-weight:900}
        .header-body{background:#fff;padding:18px 22px;display:flex;gap:18px;align-items:center;justify-content:space-between}
        .avatar{width:56px;height:56px;border-radius:14px;background:linear-gradient(135deg,#22d3ee,#2563eb);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900}
        .badge{display:inline-block;padding:4px 8px;border-radius:999px;font-size:12px;border:1px solid var(--border);background:#eef2ff;color:#334155}
        .card{background:#fff;border:1px solid var(--border);border-radius:16px;padding:18px}
        .kv{display:flex;justify-content:space-between;gap:10px;margin:8px 0}
        .kv .k{color:#374151;font-weight:700}
        .kv .v{color:#0b1220;text-align:right}
        .grid{display:grid;gap:14px}
        .grid-3{grid-template-columns:repeat(3,1fr)}
        .grid-2{grid-template-columns:repeat(2,1fr)}
        .pill{display:inline-block;padding:8px 12px;border:1px solid var(--border);border-radius:999px;background:#f8fafc;font-size:12px}
        table{width:100%;border-collapse:collapse;table-layout:fixed}
        thead th{font-size:12px;color:#334155;background:var(--thead);letter-spacing:.03em}
        th,td{padding:12px 14px;border-bottom:1px solid var(--border);text-align:left;font-size:13px;vertical-align:top;word-break:break-word}
        tr:nth-child(even) td{background:#fbfbff}
        .row{display:flex;gap:16px}
        .row > .col{flex:1}
        .small{font-size:12px}
        @media print { body{margin:0;max-width:auto} .card{page-break-inside:avoid} }
      </style></head><body>
      <div class="wrap">
        <div class="header">
          <div class="header-top">
            <div class="title">Student Report</div>
          </div>
          <div class="header-body">
            <div style="display:flex;gap:16px;align-items:center">
              <div class="avatar">${(name || 'ST').toString().slice(0,2).toUpperCase()}</div>
              <div>
                <h1>${name}</h1>
                <div class="muted small">Generated: ${new Date().toLocaleString()}</div>
              </div>
            </div>
            <div class="muted small">Course Management System</div>
          </div>
        </div>

        <div class="row">
          <div class="col card">
            <h2>Profile</h2>
            <div class="kv"><div class="k">Name</div><div class="v">${name}</div></div>
            <div class="kv"><div class="k">Email</div><div class="v">${email}</div></div>
            <div class="kv"><div class="k">Phone</div><div class="v">${phone}</div></div>
          </div>
          <div class="col card">
            <h2>Attendance Summary</h2>
            ${attendanceData ? `
              <div class="grid grid-3">
                <div class="pill"><strong>Present:</strong> ${attendanceData.present_classes ?? 0}</div>
                <div class="pill"><strong>Absent:</strong> ${attendanceData.absent_classes ?? 0}</div>
                <div class="pill"><strong>Late:</strong> ${attendanceData.late_classes ?? 0}</div>
              </div>
              <div class="grid grid-2" style="margin-top:12px">
                <div class="pill"><strong>Total Lectures:</strong> ${attendanceData.total_classes ?? 0}</div>
                <div class="pill"><strong>Rate:</strong> ${(Number(attendanceData.attendance_rate ?? 0)).toFixed(1)}%</div>
              </div>
            ` : '<div class="muted">No attendance data</div>'}
          </div>
        </div>

        <div class="card">
          <h2>Current Courses</h2>
          ${
            courses.length
              ? `
          <table><thead><tr><th>Course</th><th>Code</th><th>Enrolled At</th></tr></thead>
          <tbody>
          ${courses.map((c:any)=>`<tr><td>${c.course_title||''}</td><td>${c.course_code||''}</td><td>${c.enrolled_at?new Date(c.enrolled_at).toLocaleDateString():'-'}</td></tr>`).join('')}
          </tbody></table>`
              : '<div class="muted">No courses</div>'
          }
        </div>

        <div class="card">
          <h2>Recent Submissions</h2>
          ${
            enrichedSubs.length
              ? `
          <table><thead><tr><th>Title</th><th>Status</th><th>Grade</th><th>Submitted</th></tr></thead>
          <tbody>
          ${enrichedSubs.map((s:any)=>{
            const g = s.grade;
            const mg = s.maxGrade;
            const gStr = g != null ? (mg != null ? `${g} / ${mg}` : `${g}`) : '';
            return `<tr><td>${s.title||'Assignment'}</td><td><span class=\"badge\">${s.status}</span></td><td>${gStr}</td><td>${s.submittedDate?new Date(s.submittedDate).toLocaleDateString():'-'}</td></tr>`;
          }).join('')}
          </tbody></table>`
              : '<div class="muted">No submissions</div>'
          }
        </div>

        ${attendanceData && attendanceData.attendance_records && attendanceData.attendance_records.length ? `
        <div class="card">
          <h2>Recent Attendance Records</h2>
          <table>
            <thead><tr><th>Date</th><th>Course</th><th>Status</th></tr></thead>
            <tbody>
              ${attendanceData.attendance_records.slice(0,14).map((r:any)=>`<tr><td>${r.date?new Date(r.date).toLocaleDateString():'-'}</td><td>${r.course_name||r.course_code||'Course'}</td><td>${r.status}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>` : ''}
      </div>
      </body></html>`;

      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `student-report-${name.replace(/\s+/g, "-").toLowerCase()}.html`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(a.href);
        document.body.removeChild(a);
      }, 200);
    } catch (e) {
      console.error("Export HTML report failed", e);
      alert("Failed to export HTML report");
    }
  };

  const sendMessage = async () => {
    if (!studentId) return;
    if (!msgTitle.trim() || !msgBody.trim()) {
      toast.error("Please enter both title and message.");
      return;
    }
    try {
      setSendingMsg(true);
      const loadingId = toast.loading("Sending message...");
      await createAnnouncement({
        title: msgTitle.trim(),
        message: msgBody.trim(),
        target_audience: `student:${studentId}`,
        priority: msgPriority,
      });
      toast.success("Message sent successfully", { id: loadingId });
      setMsgOpen(false);
    } catch (e: any) {
      const msg =
        e?.response?.data?.detail ||
        e?.response?.data?.message ||
        e?.message ||
        "Failed to send message.";
      toast.error(msg, { id: undefined });
    } finally {
      // Ensure any loading toast is cleared if still present
      setSendingMsg(false);
    }
  };

  // Filters/sort (kept from your UI)
  const [submissionFilter, setSubmissionFilter] = useState<"all" | UiStatus>(
    "all"
  );
  const [sortBy, setSortBy] = useState<"submittedDate" | "grade">(
    "submittedDate"
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // simple local input for feedback form
  const [feedbackText, setFeedbackText] = useState("");

  // Load available courses
  const loadAvailableCourses = useCallback(async () => {
    try {
      const response = await getCourses();
      const items =
        response && (response as any).data !== undefined
          ? (response as any).data
          : (response as any);
      setAvailableCourses(Array.isArray(items) ? items : []);
    } catch (e) {
      console.error("Failed to load available courses:", e);
    }
  }, []);

  // Avoid white flash: animate after mount but always render gradient
  useEffect(() => {
    const t = setTimeout(() => setIsAnimated(true), 100);
    return () => clearTimeout(t);
  }, []);

  // Load student profile data
  const loadStudentProfile = useCallback(async () => {
    if (!studentId) {
      setLoadingProfile(false);
      setStudentProfile(null);
      return;
    }
    setLoadingProfile(true);
    setProfileError(null);
    try {
      console.log(
        "[student profile] Loading profile for student_id:",
        studentId
      );
      const { data } = await getStudentProfile(studentId);
      console.log("[student profile] Profile response:", data);
      setStudentProfile(data);
      // After loading profile, check if student is in any course and pre-select
      if (data && studentCourses.length > 0) {
        const currentEnrollment = studentCourses.find(
          (enrollment: any) =>
            enrollment.student_id === data.student_id &&
            enrollment.status === "Active"
        );
        if (currentEnrollment) {
          setSelectedCourse(currentEnrollment.course_id);
          setInitialCourse(currentEnrollment.course_id); // Store initial course
        }
      }
    } catch (e: any) {
      console.error("[student profile] loadStudentProfile failed", e);
      const errorMsg =
        e?.response?.data?.detail ||
        e?.response?.data?.message ||
        e?.message ||
        "Failed to load student profile.";
      setProfileError(errorMsg);
    } finally {
      setLoadingProfile(false);
    }
  }, [studentId, studentCourses]); // Added studentCourses to dependencies

  // Load academic info
  const loadAcademicInfo = useCallback(async () => {
    if (!studentId) return;
    try {
      console.log(
        "[student profile] Loading academic info for student_id:",
        studentId
      );
      const { data } = await getStudentAcademicInfo(studentId);
      console.log("[student profile] Academic info response:", data);
      setAcademicInfo(data);
    } catch (e: any) {
      console.error("[student profile] loadAcademicInfo failed", e);
    }
  }, [studentId]);

  // Load student courses
  const loadStudentCourses = useCallback(async () => {
    if (!studentId) return;
    setLoadingCourses(true);
    try {
      console.log(
        "[student profile] Loading courses for student_id:",
        studentId,
        "type:",
        typeof studentId
      );
      console.log("[student profile] Converting to number:", Number(studentId));
      console.log(
        "[student profile] Making API call to:",
        `/course-management/enrollments/student/${Number(studentId)}`
      );

      const enrollments = await getStudentEnrollments(Number(studentId));
      console.log("[student profile] Full API response:", enrollments);
      console.log("[student profile] Response data:", enrollments);
      console.log(
        "[student profile] Data type:",
        typeof enrollments,
        "length:",
        Array.isArray(enrollments) ? enrollments.length : "not array"
      );

      const finalEnrollments = Array.isArray(enrollments) ? enrollments : [];
      console.log(
        "[student profile] Final enrollments to set:",
        finalEnrollments
      );
      setStudentCourses(finalEnrollments);
    } catch (e: any) {
      console.error("[student profile] loadStudentCourses failed", e);
      console.error("[student profile] Error details:", {
        status: e?.response?.status,
        statusText: e?.response?.statusText,
        data: e?.response?.data,
        message: e?.message,
      });
      setStudentCourses([]);
    } finally {
      setLoadingCourses(false);
    }
  }, [studentId]);

  // Load attendance data
  const loadAttendanceData = useCallback(async () => {
    if (!studentId) return;
    setLoadingAttendance(true);
    try {
      console.log(
        "[student profile] Loading attendance for student_id:",
        studentId
      );
      const { data } = await getStudentAttendance(studentId);
      console.log("[student profile] Attendance response:", data);
      setAttendanceData(data);
    } catch (e: any) {
      console.error("[student profile] loadAttendanceData failed", e);
      setAttendanceData(null);
    } finally {
      setLoadingAttendance(false);
    }
  }, [studentId]);

  // Load submissions for the selected student
  const loadSubmissions = useCallback(async () => {
    if (!studentId) {
      setLoading(false);
      setSubmissions([]);
      return;
    }
    setLoading(true);
    setFetchError(null);
    try {
      console.log(
        "[student profile] Loading submissions for student_id:",
        studentId
      );
      const { data } = await listInstructorSubmissions({
        student_id: studentId,
        // Important: allow viewing all submissions for the student
        // regardless of assignment ownership linkage
        mine_only: false,
      });
      console.log("[student profile] API response:", data);
      // instructor endpoint returns:
      // { id, assignmentId, studentId, title, course, submittedAt, status, fileName, filePath, fileType, notes }
      const mapped: UiSubmission[] = (data || []).map((r: any) => ({
        id: Number(r.id ?? r.submission_id ?? r.submissionId),
        title: r.title ?? "",
        course: r.course ?? null,
        submittedDate: r.submittedAt ?? r.submitted_at ?? null,
        dueDate: null, // not provided
        status: mapStatus(r.status),
        grade: null, // will load per-submission when needed
        feedback: null, // will load per-submission when needed
        fileType: r.fileType ?? null,
        filePath: r.filePath ?? null,
        priority: "medium",
      }));
      setSubmissions(mapped);
    } catch (e: any) {
      console.error("[student profile] loadSubmissions failed", e);
      const errorMsg =
        e?.response?.data?.detail ||
        e?.response?.data?.message ||
        e?.message ||
        "Failed to load submissions.";
      console.error("[student profile] API error details:", {
        status: e?.response?.status,
        statusText: e?.response?.statusText,
        data: e?.response?.data,
        url: e?.config?.url,
        method: e?.config?.method,
      });
      setFetchError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    loadSubmissions();
    loadStudentProfile();
    loadAcademicInfo();
    loadStudentCourses();
    loadAttendanceData();
    loadAvailableCourses();
  }, [studentId]); // Only depend on studentId, not the callback functions

  // Lazy-load feedback/grade for "feedback" tab
  useEffect(() => {
    if (activeTab !== "feedback") return;
    if (!submissions.length) return;

    let cancelled = false;
    (async () => {
      try {
        setLoadingFeedback(true);
        const withFb = await Promise.all(
          submissions.map(async (s) => {
            try {
              const { data } = await getInstructorSubmission(s.id);
              const fb = data?.feedback;
              return {
                ...s,
                grade:
                  typeof fb?.grade === "number" ? fb.grade : s.grade ?? null,
                feedback: fb?.text ?? s.feedback ?? null,
                // status is already from submission; keep
              };
            } catch {
              return s;
            }
          })
        );
        if (!cancelled) setSubmissions(withFb);
      } finally {
        if (!cancelled) setLoadingFeedback(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTab, submissions.length]);

  /** ------- derived list for Submissions tab (kept your logic) ------- */
  const filteredSubmissions = useMemo(() => {
    const base = submissions.filter((s) =>
      submissionFilter === "all" ? true : s.status === submissionFilter
    );
    const val = (x: UiSubmission) =>
      sortBy === "submittedDate"
        ? x.submittedDate
          ? new Date(x.submittedDate).getTime()
          : 0
        : x.grade ?? -1;
    const sorted = base.sort((a, b) => {
      const A = val(a),
        B = val(b);
      return sortOrder === "desc" ? B - A : A - B;
    });
    return sorted;
  }, [submissions, submissionFilter, sortBy, sortOrder]);

  /** ---------------- button handlers ---------------- */
  const handleGoBack = () => window.history.back();
  const handleSignOut = () => signOut("/signin");

  // Export a PDF report with student profile, GPA, courses, submissions, attendance
  const exportStudentReport = async () => {
    try {
      const name =
        studentProfile?.full_name ||
        studentProfile?.fullName ||
        displayName ||
        "Student";
      const email = studentProfile?.email || "-";
      const phone = studentProfile?.phone || "-";

      const gpa =
        academicInfo?.overall_gpa != null
          ? academicInfo.overall_gpa.toFixed(2)
          : "-";
      const courses = academicInfo?.current_courses || [];

      const html = `<!DOCTYPE html>
      <html lang="en"><head><meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width,initial-scale=1"/>
      <title>Student Report - ${name}</title>
      <style>
        :root{--primary:#0ea5e9;--primary-2:#2563eb;--text:#0f172a;--muted:#6b7280;--border:#e5e7eb;--bg:#ffffff;--thead:#f8fafc}
        *{box-sizing:border-box}
        html,body{background:var(--bg)}
        body{font-family:Segoe UI, Roboto, Helvetica, Arial, sans-serif;direction:ltr;line-height:1.6;margin:32px auto;color:var(--text);max-width:900px;font-size:13px}
        h1{font-size:26px;margin:0 0 4px;font-weight:800;color:#0b1220}
        h2{font-size:18px;margin:0 0 8px;font-weight:800;color:#0b1220}
        h3{font-size:14px;margin:0 0 6px;font-weight:700;color:#111827}
        .muted{color:var(--muted)}
        .wrap{display:flex;flex-direction:column;gap:14px}
        .header{border:1px solid var(--border);border-radius:14px;overflow:hidden}
        .header-top{background:linear-gradient(90deg,var(--primary),var(--primary-2));padding:16px 18px;color:#fff}
        .header-top .title{font-size:20px;font-weight:900}
        .header-body{background:#fff;padding:14px 18px;display:flex;gap:16px;align-items:center;justify-content:space-between}
        .avatar{width:52px;height:52px;border-radius:12px;background:linear-gradient(135deg,#22d3ee,#2563eb);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900}
        .badge{display:inline-block;padding:4px 8px;border-radius:999px;font-size:12px;border:1px solid var(--border);background:#eef2ff;color:#334155}
        .card{background:#fff;border:1px solid var(--border);border-radius:14px;padding:16px}
        .kv{display:flex;justify-content:space-between;gap:8px;margin:6px 0}
        .kv .k{color:#374151;font-weight:700}
        .kv .v{color:#0b1220;text-align:right}
        .grid{display:grid;gap:12px}
        .grid-3{grid-template-columns:repeat(3,1fr)}
        .grid-2{grid-template-columns:repeat(2,1fr)}
        .pill{display:inline-block;padding:6px 10px;border:1px solid var(--border);border-radius:999px;background:#f8fafc;font-size:12px}
        table{width:100%;border-collapse:collapse;table-layout:fixed}
        thead th{font-size:12px;color:#334155;background:var(--thead);letter-spacing:.03em}
        th,td{padding:10px 12px;border-bottom:1px solid var(--border);text-align:left;font-size:12px;vertical-align:top;word-break:break-word}
        tr:nth-child(even) td{background:#fbfbff}
        .row{display:flex;gap:12px}
        .row > .col{flex:1}
        .small{font-size:12px}
        .header,.card, table, tr, td, th{page-break-inside:avoid}
        h1, h2{page-break-after:avoid}
      </style></head><body>
      <div class="wrap">
        <div class="header">
          <div class="header-top">
            <div class="title">Student Report</div>
          </div>
          <div class="header-body">
            <div style="display:flex;gap:14px;align-items:center">
              <div class="avatar">${(name || 'ST').toString().slice(0,2).toUpperCase()}</div>
              <div>
                <h1>${name}</h1>
                <div class="muted small">Generated: ${new Date().toLocaleString()}</div>
              </div>
            </div>
            <div class="muted small">Course Management System</div>
          </div>
        </div>

        <div class="row">
          <div class="col card">
            <h2>Profile</h2>
            <div class="kv"><div class="k">Name</div><div class="v">${name}</div></div>
            <div class="kv"><div class="k">Email</div><div class="v">${email}</div></div>
            <div class="kv"><div class="k">Phone</div><div class="v">${phone}</div></div>
          </div>
          <div class="col card">
            <h2>Attendance Summary</h2>
            ${attendanceData ? `
              <div class="grid grid-3">
                <div class="pill"><strong>Present:</strong> ${attendanceData.present_classes ?? 0}</div>
                <div class="pill"><strong>Absent:</strong> ${attendanceData.absent_classes ?? 0}</div>
                <div class="pill"><strong>Late:</strong> ${attendanceData.late_classes ?? 0}</div>
              </div>
              <div class="grid grid-2" style="margin-top:10px">
                <div class="pill"><strong>Total Lectures:</strong> ${attendanceData.total_classes ?? 0}</div>
                <div class="pill"><strong>Rate:</strong> ${(Number(attendanceData.attendance_rate ?? 0)).toFixed(1)}%</div>
              </div>
            ` : '<div class="muted">No attendance data</div>'}
          </div>
        </div>

        <div class="card">
          <h2>Current Courses</h2>
          ${
            courses.length
              ? `
          <table><thead><tr><th>Course</th><th>Code</th><th>Enrolled At</th></tr></thead>
          <tbody>
          ${courses
            .map(
              (c: any) =>
                `<tr><td>${c.course_title || ''}</td><td>${c.course_code || ''}</td><td>${c.enrolled_at ? new Date(c.enrolled_at).toLocaleDateString() : '-'}</td></tr>`
            )
            .join('')}
          </tbody></table>`
              : '<div class="muted">No courses</div>'
          }
        </div>

        <div class="card">
          <h2>Recent Submissions</h2>
          ${
            submissions.length
              ? `
          <table><thead><tr><th>Title</th><th>Status</th><th>Grade</th><th>Submitted</th></tr></thead>
          <tbody>
          ${submissions
            .slice(0,20)
            .map(
              (s) => `<tr><td>${s.title || 'Assignment'}</td><td><span class="badge">${s.status}</span></td><td>${s.grade ?? ''}</td><td>${s.submittedDate ? new Date(s.submittedDate).toLocaleDateString() : '-'}</td></tr>`
            )
            .join('')}
          </tbody></table>`
              : '<div class="muted">No submissions</div>'
          }
        </div>

        ${attendanceData && attendanceData.attendance_records && attendanceData.attendance_records.length ? `
        <div class="card">
          <h2>Recent Attendance Records</h2>
          <table>
            <thead><tr><th>Date</th><th>Course</th><th>Status</th></tr></thead>
            <tbody>
              ${attendanceData.attendance_records.slice(0,12).map((r:any) => `<tr>
                <td>${r.date ? new Date(r.date).toLocaleDateString() : '-'}</td>
                <td>${r.course_name || r.course_code || 'Course'}</td>
                <td>${r.status}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>` : ''}
      </div>
      </body></html>`;

      // Render HTML in an offscreen iframe then export full page to PDF using jsPDF html()
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.left = "-9999px";
      iframe.style.top = "0";
      document.body.appendChild(iframe);
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) throw new Error("Failed to prepare print document");
      doc.open();
      doc.write(html);
      doc.close();

      await new Promise((resolve) => setTimeout(resolve, 300));

      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 36; // 0.5 inch

      const filename = `student-report-${name.replace(/\s+/g, "-").toLowerCase()}.pdf`;
      const bodyEl = doc.body as HTMLElement;
      const contentWidth = pageWidth - margin * 2;
      await pdf.html(bodyEl, {
        x: margin,
        y: margin,
        width: contentWidth,
        windowWidth: 820, // match CSS max-width to get stable scaling
        html2canvas: {
          scale: 1.4,
          useCORS: true,
          backgroundColor: "#ffffff",
          letterRendering: true,
        },
      } as any);
      // Footer with page numbers
      const pageCount = pdf.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        pdf.setFontSize(9);
        pdf.setTextColor(120);
        pdf.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pdf.internal.pageSize.getHeight() - 14, { align: "right" as any });
      }
      pdf.setProperties({ title: `Student Report - ${name}` });
      pdf.save(filename);
      document.body.removeChild(iframe);
    } catch (e) {
      console.error("Export report failed", e);
      alert("Failed to export report");
    } finally {
      // in case of any error before removal
      const leftover = document.querySelector('iframe[style*="-9999px"]');
      if (leftover && leftover.parentElement) {
        try { leftover.parentElement.removeChild(leftover); } catch {}
      }
    }
  };

  const handleView = (id: number) => {
    navigate(`/instructor/submissions/${id}`);
  };

  const handleDownload = (s: UiSubmission) => {
    const url = fileUrl(s.filePath);
    if (url) window.open(url, "_blank");
  };

  const handleApprove = async (id: number) => {
    try {
      await reviewInstructorSubmission(id, { status: "Accepted" });
      setSubmissions((prev) =>
        prev.map((x) => (x.id === id ? { ...x, status: "approved" } : x))
      );
    } catch (e) {
      console.error("approve failed", e);
    }
  };

  const handleReject = async (id: number) => {
    try {
      await reviewInstructorSubmission(id, { status: "NeedsRevision" });
      setSubmissions((prev) =>
        prev.map((x) => (x.id === id ? { ...x, status: "needs_revision" } : x))
      );
    } catch (e) {
      console.error("reject failed", e);
    }
  };

  const handleUpdateStudent = async () => {
    if (!studentId || !newGpa) return;
    try {
      const gpaValue = parseFloat(newGpa);
      if (isNaN(gpaValue) || gpaValue < 0 || gpaValue > 4) {
        alert("Please enter a valid GPA between 0.0 and 4.0");
        return;
      }

      const profileUpdatePayload: any = {};
      if (studentProfile?.gpa !== gpaValue) {
        profileUpdatePayload.gpa = gpaValue;
      }

      // Handle course changes
      if (selectedCourse !== initialCourse) {
        if (initialCourse) {
          // If there was an initial course, unenroll the student from it (update status to 'Dropped')
          await updateStudentProfile(studentId, {
            course_id: initialCourse,
            status: "Dropped",
          }); // Assuming an API to update enrollment status
        }
        if (selectedCourse) {
          // Enroll student in the new selected course
          await adminEnrollStudent({
            student_id: Number(studentId),
            course_id: Number(selectedCourse),
          });
        }
      }

      // Only call updateStudentProfile if there are actual profile changes (excluding course logic handled above)
      if (Object.keys(profileUpdatePayload).length > 0) {
        await updateStudentProfile(studentId, profileUpdatePayload);
      }

      setEditingGpa(false);
      setNewGpa("");
      // Reload profile and courses to get updated data
      loadStudentProfile();
      loadStudentCourses();
    } catch (e: any) {
      console.error("update failed", e);
      alert("Failed to update student. Please try again.");
    }
  };

  /** ---------------- header quick stats (from real data) ---------------- */
  const approvedCount = submissions.filter(
    (s) => s.status === "approved"
  ).length;
  const pendingCount = submissions.filter((s) => s.status === "pending").length;

  /** --------- UI starts here (unchanged styles) --------- */
  return (
    <div className="min-h-screen relative overflow-hidden bg-white">
      {/* Header */}
      <div className="relative z-10 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 group">
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-md">
                  <GraduationCap className="w-8 h-8 text-white" />
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-black text-gray-900">
                  Course Management System
                </h1>
                <p className="text-sm text-gray-500 font-medium">
                  Student Profile
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={handleGoBack}
                className="group flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 transition-all duration-300"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>

              <button
                onClick={exportStudentReportHtml}
                className="group flex items-center gap-2 px-4 py-2 bg-sky-600 border border-sky-700 rounded-xl text-white hover:bg-sky-700 transition-all duration-300"
                title="Export as HTML"
              >
                <Download className="w-4 h-4" />
                <span>Export HTML</span>
              </button>

              {/* Send Message icon removed per request */}

              <div className="flex items-center gap-3 pl-4 border-l border-white/20">
                <div className="w-10 h-10 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center">
                  <User className="w-5 h-5 text-white" />
                </div>
                <div className="hidden sm:block text-right">
                  <p className="text-sm font-bold text-gray-900">
                    {instructorInfo?.fullName || instructorInfo?.full_name || "Instructor"}
                  </p>
                  <p className="text-xs text-gray-500">
                    {instructorInfo?.department || "-"}
                  </p>
                </div>
                <button
                  onClick={handleSignOut}
                  className="p-2 text-gray-500 hover:text-gray-700 transition-colors group"
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
        {/* Student Header Card */}
        <div
          className={`mb-8 transform transition-all duration-1000 ${
            isAnimated ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
          }`}
        >
          <div className="bg-white rounded-3xl border border-gray-200 p-8 shadow-sm">
            <div className="flex flex-col lg:flex-row items-start gap-8">
              {/* Student Info */}
              <div className="flex items-start gap-6 flex-1">
                <div className="relative">
                  <div className="w-20 h-20 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-md">
                    {displayName?.trim().slice(0, 2).toUpperCase() || "ST"}
                  </div>
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-3xl font-black text-gray-900">
                      {displayName || "Student"}
                    </h2>
                    <div className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-sm font-bold border border-emerald-200">
                      Active
                    </div>
                    {studentRank != null && (
                      <div className="px-3 py-1 bg-yellow-50 text-yellow-700 rounded-full text-sm font-bold border border-yellow-200">
                        Rank #{studentRank}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className="flex items-center gap-2 text-gray-600">
                      <CreditCard className="w-4 h-4" />
                      <span>ID: {studentId || "-"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <Mail className="w-4 h-4" />
                      <span>{studentProfile?.email || "-"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <Phone className="w-4 h-4" />
                      <span>{studentProfile?.phone || "-"}</span>
                    </div>
                    {/* Courses list (all enrolled courses) */}
                    <div className="flex items-start gap-2 text-gray-600">
                      <BookOpen className="w-4 h-4 mt-0.5" />
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-700">Courses:</span>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(studentCourses && studentCourses.length > 0) ? (
                            studentCourses
                              .filter((c: any) => (c.status === "Active" || c.status === "Enrolled"))
                              .map((c: any) => (
                              <span
                                key={`header-course-${c.course_id}`}
                                className="px-2 py-0.5 bg-gray-200/70 border border-gray-300 rounded-full text-xs text-gray-800"
                              >
                                {(c.course_code || c.code || "")} { (c.course_title || c.name) ? `• ${c.course_title || c.name}` : "" }
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-gray-600">No courses</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4">
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 text-yellow-400" />
                      {editingGpa ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={newGpa}
                            onChange={(e) => setNewGpa(e.target.value)}
                            placeholder="0.0"
                            min="0"
                            max="4"
                            step="0.1"
                            className="w-16 px-2 py-1 bg-white border border-gray-300 rounded text-gray-800 text-sm"
                          />
                          <button
                            onClick={handleUpdateStudent}
                            className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded text-xs hover:bg-emerald-100"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setEditingGpa(false);
                              setNewGpa("");
                            }}
                            className="px-2 py-1 bg-red-50 text-red-700 rounded text-xs hover:bg-red-100"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-yellow-600 font-bold">
                            GPA:{" "}
                            {studentProfile?.gpa
                              ? studentProfile.gpa.toFixed(2)
                              : "-"}
                          </span>
                          <button
                            onClick={() => {
                              setEditingGpa(true);
                              setNewGpa(studentProfile?.gpa?.toString() || "");
                            }}
                            className="p-1 text-gray-500 hover:text-gray-700 transition-colors"
                            title="Edit GPA"
                          >
                            <Edit className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-blue-600" />
                      <span className="text-blue-600 font-medium">Rank: -</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-purple-600" />
                      <span className="text-purple-600 font-medium">
                        Enrolled: -
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Stats (live counts from submissions) */}
              <div className="grid grid-cols-2 lg:grid-cols-1 gap-4 min-w-[280px]">
                <div className="bg-white/5 rounded-2xl p-4 border border-gray-200">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 bg-gradient-to-r from-emerald-500 to-green-600 rounded-lg flex items-center justify-center">
                      <CheckCircle className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-lg font-black text-gray-900">
                        {approvedCount}
                      </p>
                      <p className="text-gray-500 text-xs">Approved</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white/5 rounded-2xl p-4 border border-gray-200">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 bg-gradient-to-r from-amber-500 to-orange-600 rounded-lg flex items-center justify-center">
                      <Clock className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-lg font-black text-gray-900">
                        {pendingCount}
                      </p>
                      <p className="text-gray-500 text-xs">Pending</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div
          className={`mb-8 transform transition-all duration-1000 ${
            isAnimated ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
          }`}
          style={{ transitionDelay: "200ms" }}
        >
          <div className="bg-white rounded-2xl border border-gray-200 p-2 shadow-sm">
            <div className="flex flex-wrap gap-2">
              {[
                { id: "overview", label: "Overview", icon: Target },
                { id: "submissions", label: "Submissions", icon: FileText },
                { id: "courses", label: "Courses", icon: BookOpen },
                { id: "attendance", label: "Attendance", icon: Calendar },
                { id: "feedback", label: "Feedback", icon: MessageSquare },
              ].map((tab) => {
                const Icon = tab.icon as any;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium transition-all duration-300 ${
                      activeTab === tab.id
                        ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg transform scale-105"
                        : "text-gray-600 hover:text-gray-800"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Content */}
        <div
          className={`transform transition-all duration-1000 ${
            isAnimated ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
          }`}
          style={{ transitionDelay: "400ms" }}
        >
          {/* OVERVIEW (kept visual shell; no mock metrics) */}
          {activeTab === "overview" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                <div className="bg-white rounded-3xl border border-gray-200 p-8 shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
                        <BarChart3 className="w-5 h-5 text-white" />
                      </div>
                      <h3 className="text-xl font-black text-gray-900">
                        Academic Performance
                      </h3>
                    </div>
                    <button
                      className="group inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors"
                      onClick={() => {
                        try {
                          const width = 1200;
                          const height = 700;
                          const canvas = document.createElement("canvas");
                          canvas.width = width;
                          canvas.height = height;
                          const ctx = canvas.getContext("2d");
                          if (!ctx) return;

                          // Background
                          ctx.fillStyle = "#ffffff";
                          ctx.fillRect(0, 0, width, height);

                          // Title
                          ctx.fillStyle = "#111827";
                          ctx.font =
                            "bold 28px Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
                          ctx.fillText("Student Analysis", 40, 60);
                          ctx.font =
                            "14px Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
                          const now = new Date();
                          ctx.fillStyle = "#6B7280";
                          ctx.fillText(now.toLocaleString(), 40, 86);

                          // Panels frames
                          const drawPanel = (
                            x: number,
                            y: number,
                            w: number,
                            h: number
                          ) => {
                            ctx.fillStyle = "#F9FAFB";
                            ctx.fillRect(x, y, w, h);
                            ctx.strokeStyle = "#E5E7EB";
                            ctx.lineWidth = 1;
                            ctx.strokeRect(x, y, w, h);
                          };

                          // GPA panel
                          drawPanel(40, 120, 520, 200);
                          ctx.fillStyle = "#111827";
                          ctx.font = "bold 18px Inter, system-ui";
                          ctx.fillText("Overall GPA", 60, 150);
                          const gpa = academicInfo?.overall_gpa ?? 0;
                          // bar
                          const barX = 60,
                            barY = 170,
                            barW = 440,
                            barH = 24;
                          ctx.fillStyle = "#E5E7EB";
                          ctx.fillRect(barX, barY, barW, barH);
                          ctx.fillStyle = "#059669"; // emerald-600
                          const pct = Math.max(0, Math.min(1, gpa / 4.0));
                          ctx.fillRect(
                            barX,
                            barY,
                            Math.round(barW * pct),
                            barH
                          );
                          ctx.fillStyle = "#065F46";
                          ctx.font = "bold 16px Inter, system-ui";
                          ctx.fillText(
                            `${gpa ? gpa.toFixed(2) : "0.00"} / 4.00`,
                            barX,
                            barY + 50
                          );

                          // Credits panel
                          drawPanel(640, 120, 520, 200);
                          ctx.fillStyle = "#111827";
                          ctx.font = "bold 18px Inter, system-ui";
                          ctx.fillText("Credits Progress", 660, 150);
                          const cDone = academicInfo?.credits_completed ?? 0;
                          const cReq = academicInfo?.credits_required ?? 0;
                          const cPct =
                            cReq > 0
                              ? Math.max(0, Math.min(1, cDone / cReq))
                              : 0;
                          const cBarX = 660,
                            cBarY = 170,
                            cBarW = 440,
                            cBarH = 24;
                          ctx.fillStyle = "#E5E7EB";
                          ctx.fillRect(cBarX, cBarY, cBarW, cBarH);
                          ctx.fillStyle = "#2563EB"; // blue-600
                          ctx.fillRect(
                            cBarX,
                            cBarY,
                            Math.round(cBarW * cPct),
                            cBarH
                          );
                          ctx.fillStyle = "#1E3A8A";
                          ctx.font = "bold 16px Inter, system-ui";
                          ctx.fillText(
                            `${cDone} of ${cReq}`,
                            cBarX,
                            cBarY + 50
                          );

                          // Courses panel
                          drawPanel(40, 360, 1120, 280);
                          ctx.fillStyle = "#111827";
                          ctx.font = "bold 18px Inter, system-ui";
                          ctx.fillText("Current Courses", 60, 390);
                          const courses = (academicInfo?.current_courses ??
                            []) as any[];
                          ctx.font = "14px Inter, system-ui";
                          const startY = 420;
                          const rowH = 28;
                          const maxRows = 7;
                          if (courses.length === 0) {
                            ctx.fillStyle = "#6B7280";
                            ctx.fillText("No current courses", 60, startY);
                          } else {
                            ctx.fillStyle = "#374151";
                            ctx.fillText("Course", 60, startY);
                            ctx.fillText("Code", 520, startY);
                            ctx.fillText("Enrolled At", 820, startY);
                            ctx.strokeStyle = "#E5E7EB";
                            ctx.beginPath();
                            ctx.moveTo(60, startY + 10);
                            ctx.lineTo(1120, startY + 10);
                            ctx.stroke();
                            ctx.fillStyle = "#111827";
                            for (
                              let i = 0;
                              i < Math.min(maxRows, courses.length);
                              i++
                            ) {
                              const cy = startY + 20 + (i + 1) * rowH;
                              const c = courses[i];
                              const title = String(
                                c?.course_title ??
                                  `Course ${c?.course_id ?? ""}`
                              );
                              const code = String(c?.course_code ?? "-");
                              const date = c?.enrolled_at
                                ? new Date(c.enrolled_at).toLocaleDateString()
                                : "-";
                              ctx.fillText(title, 60, cy);
                              ctx.fillStyle = "#1D4ED8";
                              ctx.fillText(code, 520, cy);
                              ctx.fillStyle = "#111827";
                              ctx.fillText(date, 820, cy);
                            }
                          }

                          canvas.toBlob((blob) => {
                            if (!blob) return;
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = "student-analysis.png";
                            document.body.appendChild(a);
                            a.click();
                            a.remove();
                            URL.revokeObjectURL(url);
                          });
                        } catch (e) {
                          console.error("Export analysis failed:", e);
                        }
                      }}
                      title="Download analysis as PNG"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download Analysis</span>
                    </button>
                  </div>

                  {/* Academic performance with real data */}
                  <div className="grid grid-cols-1 gap-6 mb-8">
                    <div className="bg-gray-50 rounded-2xl p-6 border border-gray-200">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-lg font-bold text-gray-900">
                          Overall GPA
                        </h4>
                        <div className="text-right">
                          <p className="text-2xl font-black text-emerald-600">
                            {academicInfo?.overall_gpa
                              ? academicInfo.overall_gpa.toFixed(2)
                              : "-"}
                          </p>
                          <p className="text-gray-600 text-sm">out of 4.0</p>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-emerald-400 to-green-500 h-2 rounded-full transition-all duration-1000"
                          style={{
                            width: `${
                              academicInfo?.overall_gpa
                                ? (academicInfo.overall_gpa / 4.0) * 100
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* GPA Editing Section */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-200">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-lg font-bold text-gray-900">
                          Edit GPA
                        </h4>
                        <div className="flex items-center gap-2">
                          {editingGpa ? (
                            <>
                              <button
                                onClick={async () => {
                                  try {
                                    setUpdatingGpa(true);
                                    const gpaValue = parseFloat(newGpa);
                                    if (
                                      isNaN(gpaValue) ||
                                      gpaValue < 0 ||
                                      gpaValue > 4.0
                                    ) {
                                      alert(
                                        "Please enter a valid GPA between 0.0 and 4.0"
                                      );
                                      return;
                                    }
                                    await updateStudentProfile(
                                      Number(studentId),
                                      { gpa: gpaValue }
                                    );
                                    setAcademicInfo((prev: any) => ({
                                      ...prev,
                                      overall_gpa: gpaValue,
                                    }));
                                    setEditingGpa(false);
                                    setNewGpa("");
                                    alert("GPA updated successfully!");
                                  } catch (error) {
                                    console.error(
                                      "Failed to update GPA:",
                                      error
                                    );
                                    alert(
                                      "Failed to update GPA. Please try again."
                                    );
                                  } finally {
                                    setUpdatingGpa(false);
                                  }
                                }}
                                disabled={updatingGpa}
                                className="px-3 py-1 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {updatingGpa ? "Saving..." : "Save"}
                              </button>
                              <button
                                onClick={() => {
                                  setEditingGpa(false);
                                  setNewGpa("");
                                }}
                                disabled={updatingGpa}
                                className="px-3 py-1 bg-gray-500 text-white text-sm font-medium rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingGpa(true);
                                setNewGpa(
                                  academicInfo?.overall_gpa?.toString() || ""
                                );
                              }}
                              className="px-3 py-1 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors"
                            >
                              Edit GPA
                            </button>
                          )}
                        </div>
                      </div>

                      {editingGpa ? (
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Current GPA
                            </label>
                            <input
                              type="number"
                              min="0"
                              max="4"
                              step="0.01"
                              value={newGpa}
                              onChange={(e) => setNewGpa(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="Enter GPA (0.0 - 4.0)"
                            />
                          </div>
                          <div className="text-sm text-gray-600">
                            <p>• Enter a value between 0.0 and 4.0</p>
                            <p>
                              • Use decimal places for precision (e.g., 3.75)
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="text-gray-600 text-sm">
                          <p>
                            Click "Edit GPA" to update the student's overall
                            GPA.
                          </p>
                          <p className="mt-1">
                            Current GPA:{" "}
                            <span className="font-medium text-gray-900">
                              {academicInfo?.overall_gpa?.toFixed(2) ||
                                "Not set"}
                            </span>
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Credits tracking not implemented yet */}
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-lg font-bold text-gray-900 mb-4">
                      Current Courses
                    </h4>
                    {academicInfo?.current_courses &&
                    academicInfo.current_courses.length > 0 ? (
                      <div className="space-y-3">
                        {academicInfo.current_courses.map(
                          (course: any, index: number) => (
                            <div
                              key={index}
                              className="bg-white rounded-xl p-4 border border-gray-200"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <h5 className="font-bold text-gray-900">
                                  {course.course_title}
                                </h5>
                                <span className="text-blue-600 text-sm font-medium">
                                  {course.course_code}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-600">
                                  {course.department_name}
                                </span>
                                <span className="text-cyan-700">
                                  {course.credits} credits
                                </span>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    ) : (
                      <p className="text-gray-600 text-sm">
                        No current courses enrolled.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Sidebar */}
              <div className="space-y-8">
                {/* Recent Activity: use submissions timestamps for now */}
                <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg flex items-center justify-center">
                      <Activity className="w-4 h-4 text-white" />
                    </div>
                    <h3 className="text-lg font-black text-gray-900">
                      Recent Activity
                    </h3>
                  </div>

                  <div className="space-y-4">
                    {loading && (
                      <p className="text-gray-600 text-sm">
                        Loading submissions…
                      </p>
                    )}
                    {!loading &&
                      submissions.slice(0, 5).map((s) => (
                        <div key={s.id} className="flex items-start gap-3">
                          <div
                            className={`w-2 h-2 rounded-full mt-2 bg-blue-500`}
                          />
                          <div className="flex-1">
                            <p className="text-gray-900 text-sm">
                              Submitted {s.title || "Assignment"}
                            </p>
                            <p className="text-gray-600 text-xs">
                              {s.submittedDate
                                ? new Date(s.submittedDate).toLocaleDateString()
                                : "-"}
                            </p>
                          </div>
                        </div>
                      ))}
                    {!loading && submissions.length === 0 && (
                      <p className="text-gray-600 text-sm">No activity yet.</p>
                    )}
                  </div>
                </div>

                {/* Personal Info shell (you can fill via params or future API) */}
                <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-lg flex items-center justify-center">
                      <User className="w-4 h-4 text-white" />
                    </div>
                    <h3 className="text-lg font-black text-gray-900">
                      Personal Information
                    </h3>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Calendar className="w-4 h-4 text-blue-400" />
                      <div>
                        <p className="text-gray-600 text-xs">Date of Birth</p>
                        <p className="text-gray-900 text-sm">
                          {studentProfile?.date_of_birth
                            ? new Date(
                                studentProfile.date_of_birth
                              ).toLocaleDateString()
                            : "-"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Globe className="w-4 h-4 text-green-400" />
                      <div>
                        <p className="text-gray-600 text-xs">Nationality</p>
                        <p className="text-gray-900 text-sm">
                          {studentProfile?.nationality || "-"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <MapPin className="w-4 h-4 text-purple-400" />
                      <div>
                        <p className="text-gray-600 text-xs">Address</p>
                        <p className="text-gray-900 text-sm">
                          {studentProfile?.address || "-"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Emergency Contact shell */}
                <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 bg-gradient-to-r from-red-500 to-pink-500 rounded-lg flex items-center justify-center">
                      <Shield className="w-4 h-4 text-white" />
                    </div>
                    <h3 className="text-lg font-black text-gray-900">
                      Emergency Contact
                    </h3>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="text-gray-600 text-xs">Name</p>
                      <p className="text-gray-900 font-medium">
                        {studentProfile?.emergency_contact_name || "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600 text-xs">Relationship</p>
                      <p className="text-gray-900 font-medium">
                        {studentProfile?.emergency_contact_relationship || "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600 text-xs">Phone</p>
                      <p className="text-gray-900 font-medium">
                        {studentProfile?.emergency_contact_phone || "-"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SUBMISSIONS (live) */}
          {activeTab === "submissions" && (
            <div className="space-y-8">
              <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm">
                <div className="flex flex-col lg:flex-row gap-4 justify-between">
                  <div className="flex items-center gap-4">
                    <select
                      value={submissionFilter}
                      onChange={(e) =>
                        setSubmissionFilter(e.target.value as any)
                      }
                      className="px-4 py-2 bg-white border border-gray-300 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                    >
                      <option value="all" className="bg-white text-gray-900">
                        All Submissions
                      </option>
                      <option
                        value="approved"
                        className="bg-white text-gray-900"
                      >
                        Approved
                      </option>
                      <option
                        value="pending"
                        className="bg-white text-gray-900"
                      >
                        Pending
                      </option>
                      <option
                        value="reviewed"
                        className="bg-white text-gray-900"
                      >
                        Reviewed
                      </option>
                      <option
                        value="needs_revision"
                        className="bg-white text-gray-900"
                      >
                        Needs Revision
                      </option>
                    </select>

                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      className="px-4 py-2 bg-white border border-gray-300 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                    >
                      <option
                        value="submittedDate"
                        className="bg-white text-gray-900"
                      >
                        Sort by Date
                      </option>
                      <option value="grade" className="bg-white text-gray-900">
                        Sort by Grade
                      </option>
                    </select>

                    <button
                      onClick={() =>
                        setSortOrder((p) => (p === "desc" ? "asc" : "desc"))
                      }
                      className="p-2 bg-white border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition-all"
                    >
                      {sortOrder === "desc" ? (
                        <SortDesc className="w-4 h-4" />
                      ) : (
                        <SortAsc className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  <div className="flex gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-black text-gray-900">
                        {filteredSubmissions.length}
                      </p>
                      <p className="text-gray-600 text-xs">Showing</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-black text-emerald-600">
                        {
                          filteredSubmissions.filter(
                            (s) => s.status === "approved"
                          ).length
                        }
                      </p>
                      <p className="text-gray-600 text-xs">Approved</p>
                    </div>
                  </div>
                </div>
              </div>

              {fetchError && (
                <div className="bg-red-500/10 border border-red-400/30 text-red-200 rounded-2xl p-4">
                  {fetchError}
                </div>
              )}

              <div className="space-y-6">
                {loading && (
                  <div className="text-gray-600">Loading submissions…</div>
                )}

                {!loading &&
                  filteredSubmissions.map((submission) => {
                    const StatusIcon = getStatusIcon(submission.status);
                    return (
                      <div
                        key={submission.id}
                        className="bg-white rounded-3xl border border-gray-200 p-8 hover:bg-gray-50 transition-all duration-500 shadow-sm"
                      >
                        <div className="flex items-start justify-between mb-6">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-3">
                              <h3 className="text-xl font-bold text-gray-900">
                                {submission.title || "Assignment"}
                              </h3>
                              <div
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold ${getStatusColor(
                                  submission.status
                                )}`}
                              >
                                <StatusIcon className="w-3 h-3" />
                                <span className="capitalize">
                                  {submission.status.replace("_", " ")}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-6 mb-4 text-sm">
                              <div className="flex items-center gap-2 text-sky-700">
                                <BookOpen className="w-4 h-4" />
                                <span>{submission.course || "-"}</span>
                              </div>
                              <div className="flex items-center gap-2 text-gray-600">
                                <Calendar className="w-4 h-4" />
                                <span>
                                  Submitted:{" "}
                                  {submission.submittedDate
                                    ? new Date(
                                        submission.submittedDate
                                      ).toLocaleDateString()
                                    : "-"}
                                </span>
                              </div>
                              {typeof submission.grade === "number" && (
                                <div className="flex items-center gap-2">
                                  <Star className="w-4 h-4 text-yellow-400" />
                                  <span
                                    className={`font-bold ${getGradeColor(
                                      submission.grade
                                    )}`}
                                  >
                                    {submission.grade}/10
                                  </span>
                                </div>
                              )}
                            </div>

                            {submission.feedback && (
                              <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-2xl">
                                <div className="flex items-center gap-2 mb-2">
                                  <MessageSquare className="w-4 h-4 text-sky-700" />
                                  <span className="text-sm font-bold text-sky-700">
                                    Feedback
                                  </span>
                                </div>
                                <p className="text-gray-800 text-sm">
                                  {submission.feedback}
                                </p>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleView(submission.id)}
                              className="p-2 text-gray-600 hover:text-gray-800 transition-colors rounded-xl hover:bg-gray-100"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDownload(submission)}
                              className="p-2 text-gray-600 hover:text-gray-800 transition-colors rounded-xl hover:bg-gray-100"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleApprove(submission.id)}
                              className="p-2 text-emerald-400 hover:text-emerald-300 transition-colors rounded-xl hover:bg-emerald-500/10"
                            >
                              <ThumbsUp className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleReject(submission.id)}
                              className="p-2 text-red-400 hover:text-red-300 transition-colors rounded-xl hover:bg-red-500/10"
                            >
                              <ThumbsDown className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                {!loading && !filteredSubmissions.length && (
                  <div className="text-gray-600">No submissions to show.</div>
                )}
              </div>
            </div>
          )}

          {/* COURSES */}
          {activeTab === "courses" && (
            <div className="space-y-8">
              <div className="bg-white rounded-3xl border border-gray-200 p-8 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-xl font-black text-gray-900">
                    Enrolled Courses
                  </h3>
                </div>

                {loadingCourses ? (
                  <div className="text-gray-600">Loading courses...</div>
                ) : studentCourses && studentCourses.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {studentCourses
                      .filter((enrollment: any) => enrollment.status === "Active" || enrollment.status === "Enrolled")
                      .map((enrollment: any, index: number) => (
                      <div
                        key={index}
                        className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm"
                      >
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="font-bold text-gray-900">
                            {enrollment.course_title ||
                              `Course ${enrollment.course_id}`}
                          </h4>
                          <div
                            className={`px-3 py-1 rounded-full text-xs font-bold ${
                              enrollment.status === "Active"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-gray-50 text-gray-700 border border-gray-200"
                            }`}
                          >
                            {enrollment.status || "Active"}
                          </div>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Course ID:</span>
                            <span className="text-gray-900">
                              {enrollment.course_id}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Status:</span>
                            <span className="text-gray-900">
                              {enrollment.status}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">{(enrollment.status === "Active" || enrollment.status === "Enrolled") ? "Enrolled At:" : "Requested At:"}</span>
                            <span className="text-gray-900">
                              {enrollment.enrolled_at
                                ? new Date(
                                    enrollment.enrolled_at
                                  ).toLocaleDateString()
                                : "-"}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <BookOpen className="w-12 h-12 text-white/40 mx-auto mb-4" />
                    <p className="text-white/60">No courses enrolled</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "attendance" && (
            <div className="space-y-8">
              <div className="bg-white rounded-3xl border border-gray-200 p-8 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-xl font-black text-gray-900">
                    Attendance Summary
                  </h3>
                </div>

                {loadingAttendance ? (
                  <div className="text-gray-600">
                    Loading attendance data...
                  </div>
                ) : attendanceData ? (
                  <div className="space-y-6">
                    {/* Overall Attendance Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="bg-gray-50 rounded-2xl p-6 border border-gray-200">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-8 h-8 bg-gradient-to-r from-emerald-500 to-green-600 rounded-lg flex items-center justify-center">
                            <CheckCircle className="w-4 h-4 text-white" />
                          </div>
                          <div>
                            <p className="text-lg font-black text-gray-900">
                              {attendanceData.present_classes || 0}
                            </p>
                            <p className="text-gray-600 text-xs">Present</p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-gray-50 rounded-2xl p-6 border border-gray-200">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-8 h-8 bg-gradient-to-r from-red-500 to-pink-600 rounded-lg flex items-center justify-center">
                            <XCircle className="w-4 h-4 text-white" />
                          </div>
                          <div>
                            <p className="text-lg font-black text-gray-900">
                              {attendanceData.absent_classes || 0}
                            </p>
                            <p className="text-gray-600 text-xs">Absent</p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-gray-50 rounded-2xl p-6 border border-gray-200">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-cyan-600 rounded-lg flex items-center justify-center">
                            <BarChart3 className="w-4 h-4 text-white" />
                          </div>
                          <div>
                            <p className="text-lg font-black text-gray-900">
                              {(() => {
                                const pct = attendanceData?.attendance_rate ?? attendanceData?.attendance_percentage ?? 0;
                                return `${Number(pct).toFixed(1)}%`;
                              })()}
                            </p>
                            <p className="text-gray-600 text-xs">
                              Attendance Rate
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Recent Attendance Records */}
                    {attendanceData.attendance_records &&
                      attendanceData.attendance_records.length > 0 && (
                        <div className="bg-white rounded-2xl p-6 border border-gray-200">
                          <h4 className="text-lg font-bold text-gray-900 mb-4">
                            Recent Records
                          </h4>
                          <div className="space-y-3">
                            {attendanceData.attendance_records
                              .slice(0, 10)
                              .map((record: any, index: number) => (
                                <div
                                  key={index}
                                  className="flex items-center justify-between py-2 border-b border-gray-200 last:border-b-0"
                                >
                                  <div className="flex items-center gap-3">
                                    <div
                                      className={`w-3 h-3 rounded-full ${
                                        record.status === "Present"
                                          ? "bg-emerald-500"
                                          : record.status === "Absent"
                                          ? "bg-red-500"
                                          : "bg-yellow-500"
                                      }`}
                                    />
                                    <div>
                                      <p className="text-gray-900 text-sm">
                                        {record.course_name || record.course_code || "Course"}
                                      </p>
                                      <p className="text-gray-600 text-xs">
                                        {record.date
                                          ? new Date(
                                              record.date
                                            ).toLocaleDateString()
                                          : "-"}
                                      </p>
                                    </div>
                                  </div>
                                  <span
                                    className={`text-sm font-medium ${
                                      record.status === "Present"
                                        ? "text-emerald-700"
                                        : record.status === "Absent"
                                        ? "text-red-700"
                                        : "text-yellow-700"
                                    }`}
                                  >
                                    {record.status || "Unknown"}
                                  </span>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-600">
                      No attendance data available
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* FEEDBACK (loads real feedback for submissions when opened) */}
          {activeTab === "feedback" && (
            <div className="space-y-8">
              <div className="bg-white rounded-3xl border border-gray-200 p-8 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-600 rounded-xl flex items-center justify-center">
                    <MessageSquare className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-xl font-black text-gray-900">
                    Add Feedback
                  </h3>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-gray-800 font-medium mb-3">
                      Your Feedback
                    </label>
                    <textarea
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      placeholder="Write your feedback for this student..."
                      className="w-full h-32 bg-white border border-gray-300 rounded-2xl p-4 text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setFeedbackText("")}
                      className="group bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold py-3 px-6 rounded-2xl transition-all duration-500 transform hover:scale-105 flex items-center justify-center gap-3"
                    >
                      <Send className="w-4 h-4" />
                      <span>Send Feedback (wire /feedback when ready)</span>
                    </button>
                    <button
                      onClick={() => setFeedbackText("")}
                      className="px-6 py-3 bg-gray-100 border border-gray-200 text-gray-800 rounded-2xl hover:bg-gray-200 transition-all"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-gray-200 p-8 shadow-sm">
                <h3 className="text-xl font-black text-gray-900 mb-6">
                  Previous Feedback
                </h3>
                {loadingFeedback && (
                  <p className="text-gray-600">Loading feedback…</p>
                )}
                {!loadingFeedback &&
                  submissions.filter((s) => s.feedback).length === 0 && (
                    <p className="text-gray-600">No feedback yet.</p>
                  )}
                <div className="space-y-4">
                  {submissions
                    .filter((s) => s.feedback)
                    .map((s) => (
                      <div
                        key={s.id}
                        className="bg-white/5 border border-white/10 rounded-2xl p-6"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-bold text-white">
                            {s.title || "Assignment"}
                          </h4>
                          <span className="text-white/60 text-sm">
                            {s.submittedDate
                              ? new Date(s.submittedDate).toLocaleDateString()
                              : "-"}
                          </span>
                        </div>
                        <p className="text-white/80 text-sm mb-3">
                          {s.feedback}
                        </p>
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(
                              s.status
                            )}`}
                          >
                            <span className="capitalize">
                              {s.status.replace("_", " ")}
                            </span>
                          </div>
                          {typeof s.grade === "number" && (
                            <div className="flex items-center gap-2">
                              <Star className="w-3 h-3 text-yellow-400" />
                              <span
                                className={`text-sm font-bold ${getGradeColor(
                                  s.grade
                                )}`}
                              >
                                {s.grade}/10
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Quick Actions Bar */}
        <div
          className={`mt-12 transform transition-all duration-1000 ${
            isAnimated ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
          }`}
          style={{ transitionDelay: "600ms" }}
        >
          <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-600 rounded-xl flex items-center justify-center">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    Quick Actions
                  </h3>
                  <p className="text-gray-600 text-sm">
                    Manage student progress efficiently
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    const to = studentProfile?.email || "";
                    const subject = encodeURIComponent(
                      `Message regarding your progress`
                    );
                    const body = encodeURIComponent(
                      `Hello ${studentProfile?.full_name || displayName},\n\n`
                    );
                    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
                  }}
                  className="group bg-white border border-gray-200 hover:bg-gray-50 text-gray-800 font-medium py-3 px-4 rounded-xl transition-all duration-300 flex items-center gap-2"
                >
                  <MessageSquare className="w-4 h-4 text-sky-600" />
                  <span>Send Message</span>
                </button>

                <button
                  onClick={() => {
                    setActiveTab("feedback");
                    // focus textarea on next tick
                    setTimeout(() => {
                      const ta = document.querySelector("textarea");
                      if (ta) (ta as HTMLTextAreaElement).focus();
                    }, 0);
                  }}
                  className="group bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-700 font-medium py-3 px-4 rounded-xl transition-all duration-300 flex items-center gap-2"
                >
                  <Award className="w-4 h-4" />
                  <span>Award / Feedback</span>
                </button>

                <button
                  onClick={exportStudentReport}
                  className="group bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold py-3 px-4 rounded-2xl transition-all duration-500 transform hover:scale-105 flex items-center gap-2 shadow-lg"
                >
                  <Download className="w-4 h-4" />
                  <span>Export Report</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
