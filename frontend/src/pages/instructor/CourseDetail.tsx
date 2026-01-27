import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  Users,
  Calendar,
  GraduationCap,
  Edit,
  Plus,
  Eye,
  FileText,
  Activity,
  Sparkles,
  Stethoscope,
  Trash2,
  Save,
  X,
} from "lucide-react";
import { api, getInstructorProfile, exportStudentsData, updateAssignment, deleteAssignment, listLectures, createLecture, getCourseAttendanceSummary, markLectureAttendance, getLectureAttendance, setStudentAttendance, listAssignmentSubmissions, getStudentProfile } from "../../lib/api";
import { getToken } from "../../lib/auth";
import toast from "react-hot-toast";
import ProfileDropdown from "../../components/ProfileDropdown";

interface Course {
  course_id: number;
  title: string;
  description?: string;
  code: string;
  credits: number;
  department_id: number;
  created_by: number;
  is_active: number;
  created_at: string;
  enrollment_count: number;
  department_name: string;
}

interface Assignment {
  assignment_id: number;
  title: string;
  description: string;
  deadline: string;
  created_at: string;
  max_grade: number;
  target_year: string;
}

interface Student {
  enrollment_id: number;
  student_id: number;
  course_title: string;
  course_code: string;
  enrolled_at: string;
  status: string;
  student_name: string; // Added student name
}

export default function CourseDetail() {
  const navigate = useNavigate();
  const location = useLocation();
  const { courseId } = useParams();
  const [course, setCourse] = useState<Course | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [editing, setEditing] = useState<{ open: boolean; data: Partial<Assignment> & { assignment_id?: number } }>({ open: false, data: {} });
  const [savingEdit, setSavingEdit] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [confirmDlg, setConfirmDlg] = useState<{ open: boolean; title?: string; message?: string; onConfirm?: () => Promise<void> | void }>(
    { open: false }
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isAnimated, setIsAnimated] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "overview" | "assignments" | "students" | "lectures"
  >("overview");

  // Lectures state
  const [lectures, setLectures] = useState<any[]>([]);
  const [attendanceSummary, setAttendanceSummary] = useState<any[]>([]);
  const [creatingLecture, setCreatingLecture] = useState(false);
  const [newLecture, setNewLecture] = useState<{ date: string; topic: string; duration_minutes?: number }>({ date: "", topic: "", duration_minutes: 60 });
  const lectureFormRef = useRef<HTMLDivElement | null>(null);
  const lectureDateRef = useRef<HTMLInputElement | null>(null);

  // Export selected student's attendance as modern HTML (better than PDF)
  const exportStudentAttendanceHtml = (student: any) => {
    try {
      const s = attendanceSummary.find((a: any) => Number(a.student_id) === Number(student.student_id)) || {};
      const name = student.student_name || `Student #${student.student_id}`;
      const present = s.present ?? 0;
      const absent = s.absent ?? 0;
      const late = s.late ?? 0;
      const excused = s.excused ?? 0;
      const total = s.total_lectures ?? (present + absent + late + excused);
      const rate = (s.percentage != null ? Number(s.percentage) : (total > 0 ? ((present + excused) / total) * 100 : 0)).toFixed(1);

      const html = `<!DOCTYPE html>
      <html lang="en"><head><meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width,initial-scale=1"/>
      <title>Attendance - ${name}</title>
      <style>
        :root{--primary:#0ea5e9;--primary2:#2563eb;--text:#0f172a;--muted:#64748b;--border:#e5e7eb;--bg:#ffffff}
        *{box-sizing:border-box}
        body{margin:32px auto;max-width:860px;font-family:Segoe UI, Roboto, Helvetica, Arial, sans-serif;color:var(--text);background:#fff}
        h1{font-size:26px;margin:0;font-weight:900}
        h2{font-size:18px;margin:0 0 10px;font-weight:800}
        .header{border:1px solid var(--border);border-radius:16px;overflow:hidden;margin-bottom:16px}
        .top{background:linear-gradient(90deg,var(--primary),var(--primary2));color:#fff;padding:16px 20px;font-weight:900}
        .body{padding:18px 20px;background:#fff;display:flex;justify-content:space-between;align-items:center}
        .avatar{width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#22d3ee,#2563eb);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900}
        .muted{color:var(--muted);font-size:12px}
        .card{border:1px solid var(--border);border-radius:16px;padding:18px;margin-top:12px}
        .pills{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px}
        .pill{padding:8px 12px;border:1px solid var(--border);border-radius:999px;background:#f8fafc;font-size:12px}
        .kv{display:flex;justify-content:space-between;margin:6px 0}
        .k{font-weight:700;color:#334155}
        .v{text-align:right}
      </style></head><body>
        <div class="header">
          <div class="top">Student Attendance Report</div>
          <div class="body">
            <div style="display:flex;gap:12px;align-items:center">
              <div class="avatar">${(name||'S').toString().slice(0,2).toUpperCase()}</div>
              <div>
                <h1>${name}</h1>
                <div class="muted">Generated: ${new Date().toLocaleString()}</div>
              </div>
            </div>
            <div class="muted">Status: ${student.status || '-'}</div>
          </div>
        </div>

        <div class="card">
          <h2>Attendance Summary</h2>
          <div class="pills">
            <div class="pill"><strong>Present:</strong> ${present}</div>
            <div class="pill"><strong>Absent:</strong> ${absent}</div>
            <div class="pill"><strong>Late:</strong> ${late}</div>
            <div class="pill"><strong>Excused:</strong> ${excused}</div>
            <div class="pill"><strong>Total Lectures:</strong> ${total}</div>
            <div class="pill"><strong>Rate:</strong> ${rate}%</div>
          </div>
        </div>
      </body></html>`;

      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `attendance-${name.replace(/\s+/g,'-').toLowerCase()}.html`;
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>{ URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 200);
    } catch (e) {
      console.error('Export student attendance HTML failed', e);
      toast?.error?.('Failed to export HTML');
    }
  };

  // Initialize active tab from URL (?tab=assignments)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const t = (params.get("tab") || "").toLowerCase();
    if (["assignments","students","overview","lectures"].includes(t)) {
      setActiveTab(t as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh attendance summary whenever Students tab is opened
  useEffect(() => {
    (async () => {
      try {
        if (activeTab === "students" && courseId) {
          const sumRes = await getCourseAttendanceSummary(Number(courseId));
          setAttendanceSummary(sumRes.data || []);
        }
      } catch (e) {
        // ignore
      }
    })();
  }, [activeTab, courseId]);

  const [instructor, setInstructor] = useState({
    fullName: "",
    email: "",
    specialization: "",
  });

  useEffect(() => {
    if (courseId) {
      loadCourseData();
      loadInstructorData();
    }
  }, [courseId]);

  // For animation
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
      setIsAnimated(true);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // When opening the create lecture form, scroll it into view and focus the first field
  useEffect(() => {
    if (creatingLecture) {
      setTimeout(() => {
        lectureFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        lectureDateRef.current?.focus();
      }, 50);
    }
  }, [creatingLecture]);

  const loadInstructorData = async () => {
    try {
      const resp = await getInstructorProfile().catch(() => null);
      const data = resp?.data as any;
      if (data) {
        const name = data.fullName || data.full_name || data.name || "Instructor";
        setInstructor((d) => ({
          ...d,
          fullName: name,
          email: data.email || d.email,
          specialization: data.specialization || d.specialization,
        }));
      }
    } catch (err) {
      console.error("Failed to load /auth/me", err);
    }
  };

  const refreshAssignments = async () => {
    try {
      const assignmentsResponse = await api.get(`/course-management/courses/${courseId}/assignments`);
      setAssignments(assignmentsResponse.data || []);
    } catch (e) {
      console.error("Failed to reload assignments", e);
    }
  };

  const openEditAssignment = (a: Assignment) => {
    setEditing({
      open: true,
      data: {
        assignment_id: a.assignment_id,
        title: a.title,
        description: a.description,
        deadline: a.deadline,
        max_grade: a.max_grade,
      },
    });
  };

  const closeEditModal = () => setEditing({ open: false, data: {} });

  const saveEdit = async () => {
    if (!editing.data.assignment_id) return;
    setSavingEdit(true);
    try {
      const payload: any = {};
      if (editing.data.title != null) payload.title = editing.data.title;
      if (editing.data.description != null) payload.description = editing.data.description;
      if (editing.data.deadline) payload.deadline = editing.data.deadline; // backend expects ISO datetime
      if (editing.data.max_grade != null) payload.max_grade = editing.data.max_grade as any;
      await updateAssignment(editing.data.assignment_id, payload);
      toast.success("Assignment updated successfully");
      closeEditModal();
      await refreshAssignments();
    } catch (e: any) {
      console.error("Failed to update assignment", e);
      toast.error(e?.response?.data?.detail || e?.message || "Failed to update assignment");
    } finally {
      setSavingEdit(false);
    }
  };

  const removeAssignment = async (id: number) => {
    try {
      await deleteAssignment(id);
      toast.success("Assignment deleted");
      await refreshAssignments();
    } catch (e: any) {
      console.error("Failed to delete assignment", e);
      toast.error(e?.response?.data?.detail || e?.message || "Failed to delete assignment");
    }
  };

  const askDeleteAssignment = (a: Assignment) => {
    setConfirmDlg({
      open: true,
      title: "Delete Assignment",
      message: `Are you sure you want to delete "${a.title}"? This will deactivate it for students.`,
      onConfirm: async () => {
        setConfirmDlg({ open: false });
        await removeAssignment(a.assignment_id);
      },
    });
  };

  const loadCourseData = async () => {
    try {
      setIsLoading(true);

      // Load course details
      const courseResponse = await api.get(
        `/course-management/courses/${courseId}`
      );
      setCourse(courseResponse.data);

      // Load assignments for this course
      const assignmentsResponse = await api.get(
        `/course-management/courses/${courseId}/assignments`
      );
      setAssignments(assignmentsResponse.data || []);

      // Load enrolled students
      const studentsResponse = await api.get(
        `/course-management/enrollments/course/${courseId}?status=Active`
      );
      setStudents(studentsResponse.data || []);

      // Load lectures and attendance summary
      const [lecRes, sumRes] = await Promise.all([
        listLectures(Number(courseId)),
        getCourseAttendanceSummary(Number(courseId)),
      ]);
      setLectures(lecRes.data || []);
      setAttendanceSummary(sumRes.data || []);
    } catch (error: any) {
      console.error("Error loading course data:", error);
      if (error.response?.status === 404) {
        toast.error("Course not found");
        navigate("/instructor/courses");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditCourse = () => {
    navigate(`/instructor/courses/${courseId}/edit`);
  };

  const handleCreateAssignment = () => {
    const params = new URLSearchParams();
    params.set("tab", activeTab);
    const returnTo = encodeURIComponent(`${location.pathname}?${params.toString()}`);
    navigate(`/instructor/create-assignment?courseId=${courseId}&returnTo=${returnTo}`);
  };

  const viewAssignment = (a: Assignment) => {
    // Navigate to Tasks page and auto-open this assignment's submissions
    navigate(`/instructor/tasks?assignment_id=${a.assignment_id}`);
  };

  const exportThisCourseStudents = async () => {
    if (!courseId) {
      toast?.error?.("Course ID is missing. Please reopen the course and try again.");
      return;
    }
    try {
      setExporting(true);
      toast?.loading?.("Preparing export...", { id: "export-students" });

      // Preferred: Build export locally to ensure dynamic columns per assignment
      try {
        // 1) Load submissions with grades for each assignment in this course
        const subsByAssignment: Record<number, any[]> = {};
        for (const a of assignments) {
          try {
            const { data } = await listAssignmentSubmissions(a.assignment_id, { include_feedback: true, mine_only: false });
            subsByAssignment[a.assignment_id] = Array.isArray(data) ? data : [];
          } catch { subsByAssignment[a.assignment_id] = []; }
        }
        // 2) Build quick lookup for student profiles (email/phone)
        const profileCache: Record<number, { email?: string; phone?: string }> = {};
        for (const s of students) {
          try {
            const resp = await getStudentProfile(s.student_id);
            profileCache[s.student_id] = { email: resp?.data?.email || "", phone: resp?.data?.phone || "" };
          } catch { profileCache[s.student_id] = { email: "", phone: "" }; }
        }
        // 3) Build a wide table: one column per assignment with values 'grade/max' or 'Not submitted'
        const esc = (v:any)=> String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const extractGrade = (row: any): number | null => {
          const coerce = (v:any): number | null => {
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
          };
          const candidates: any[] = [
            row?.feedback?.grade,
            row?.grade,
            row?.final_grade,
            row?.score,
            row?.points,
            row?.obtained_points,
            row?.awarded_points,
            row?.result?.grade,
            row?.evaluation?.grade,
          ];
          for (const c of candidates) {
            const n = coerce(c);
            if (n != null) return n;
          }
          return null;
        };
        const getStudentId = (row: any): number | null => {
          const candidates: any[] = [
            row?.studentId, row?.student_id, row?.student_number, row?.studentNumber,
            row?.student?.id, row?.student?.student_id, row?.student?.student_number,
          ];
          for (const c of candidates) {
            const n = Number(c);
            if (Number.isFinite(n)) return n;
          }
          return null;
        };
        const aMax = new Map<number, number>(assignments.map(a=>[a.assignment_id, a.max_grade]));
        const assignmentCols = assignments.map(a => ({ id: a.assignment_id, title: a.title, max: aMax.get(a.assignment_id) || 0 }));
        // Attendance lookup
        let localAttendance = attendanceSummary;
        if (!Array.isArray(localAttendance) || localAttendance.length === 0) {
          try {
            const sumRes = await getCourseAttendanceSummary(Number(courseId));
            localAttendance = sumRes.data || [];
          } catch {
            localAttendance = [] as any[];
          }
        }
        const attByStudent = new Map<number, any>();
        (localAttendance || []).forEach((a:any)=>{
          const sid = Number(a.student_id ?? a.id);
          if (Number.isFinite(sid)) attByStudent.set(sid, a);
        });

        const headers: string[] = [
          "student_id","student_full_name","student_email","student_phone",
          "avg_grade_percent","attendance_percent","attendance_present","attendance_absent","attendance_late","attendance_excused","attendance_total",
          ...assignmentCols.map(col => `${col.title}`)
        ];
        const dataRowsXml: string[] = [];
        for (const s of students) {
          const profile = profileCache[s.student_id] || { email: "", phone: "" };
          const baseCells = [
            `${s.student_id}`,
            esc(s.student_name || `Student #${s.student_id}`),
            esc(profile.email || ""),
            esc(profile.phone || ""),
          ];
          // Compute weighted avg grade for this student
          let earned = 0;
          let possible = 0;
          // Also prepare grade cells
          const gradeCells: string[] = [];
          for (const col of assignmentCols) {
            const list = subsByAssignment[col.id] || [];
            const found = list.find((r:any)=> {
              const sid = getStudentId(r);
              return sid != null && Number(sid) === Number(s.student_id);
            });
            if (found) {
              const gVal = extractGrade(found);
              const g = gVal == null ? NaN : gVal;
              const cellVal = Number.isFinite(g) ? `${g}/${col.max}` : "Not submitted";
              gradeCells.push(esc(cellVal));
              if (Number.isFinite(g) && col.max > 0) { earned += Number(g); possible += col.max; }
            } else {
              gradeCells.push("Not submitted");
            }
          }
          const avgPercent = possible > 0 ? ((earned / possible) * 100) : 0;
          // Attendance stats for this student
          const att = attByStudent.get(Number(s.student_id)) || {};
          const present = Number(att.present ?? 0);
          const absent = Number(att.absent ?? 0);
          const late = Number(att.late ?? 0);
          const excused = Number(att.excused ?? 0);
          const totalLect = Number(att.total_lectures ?? (present + absent + late + excused));
          const attPercent = att.percentage != null ? Number(att.percentage) : (totalLect > 0 ? ((present + excused) / totalLect) * 100 : 0);
          const summaryCells = [
            `${avgPercent.toFixed(1)}`,
            `${attPercent.toFixed(1)}`,
            `${present}`,
            `${absent}`,
            `${late}`,
            `${excused}`,
            `${totalLect}`,
          ];
          const rowCells = [...baseCells, ...summaryCells, ...gradeCells]
            .map(val=>`<Cell><Data ss:Type="String">${val}</Data></Cell>`)
            .join("");
          dataRowsXml.push(`<Row>${rowCells}</Row>`);
        }
        // Build CSV to avoid format/extension warnings
        const csvEscape = (v: string) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
        const csvHeader = headers.map(csvEscape).join(',');
        // Convert our XML-built row cells to values again: we have base data in gradeCells/baseCells; rebuild CSV rows
        const csvRows: string[] = [];
        // Recompute rows as plain values for CSV
        for (const s of students) {
          const profile = profileCache[s.student_id] || { email: "", phone: "" };
          const baseVals = [
            `${s.student_id}`,
            s.student_name || `Student #${s.student_id}`,
            profile.email || "",
            profile.phone || "",
          ];
          // Compute weighted average and attendance summary
          let earned = 0; let possible = 0;
          const gradeVals: string[] = [];
          for (const col of assignmentCols) {
            const list = subsByAssignment[col.id] || [];
            const found = list.find((r:any)=> Number(r?.studentId ?? r?.student_id) === Number(s.student_id));
            if (found) {
              const gVal = extractGrade(found);
              const g = gVal == null ? NaN : gVal;
              const cellVal = Number.isFinite(g) ? `${g}/${col.max}` : "Not submitted";
              gradeVals.push(cellVal);
              if (Number.isFinite(g) && col.max > 0) { earned += Number(g); possible += col.max; }
            } else {
              gradeVals.push("Not submitted");
            }
          }
          const avgPercent = possible > 0 ? ((earned / possible) * 100) : 0;
          const att = attByStudent.get(Number(s.student_id)) || {};
          const present = Number(att.present ?? 0);
          const absent = Number(att.absent ?? 0);
          const late = Number(att.late ?? 0);
          const excused = Number(att.excused ?? 0);
          const totalLect = Number(att.total_lectures ?? (present + absent + late + excused));
          const attPercent = att.percentage != null ? Number(att.percentage) : (totalLect > 0 ? ((present + excused) / totalLect) * 100 : 0);
          const summaryVals = [
            `${avgPercent.toFixed(1)}`,
            `${attPercent.toFixed(1)}`,
            `${present}`,
            `${absent}`,
            `${late}`,
            `${excused}`,
            `${totalLect}`,
          ];
          const line = [...baseVals, ...summaryVals, ...gradeVals].map(csvEscape).join(',');
          csvRows.push(line);
        }
        const csvContent = [csvHeader, ...csvRows].join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
        const safeTitle = (course?.title || `course_${courseId}`).replace(/[^a-z0-9-_]+/gi, "_");
        const filename = `students_${course?.code || "code"}_${safeTitle}.csv`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = filename; a.style.display = "none"; document.body.appendChild(a); a.click();
        setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
        toast?.success?.("Export downloaded", { id: "export-students" });
        return; // early return: local build succeeded
      } catch (localErr) {
        console.warn("Local export failed, trying server export...", localErr);
      }
      // Try Axios first with a hard 6s timeout via Promise.race
      const axiosCall = exportStudentsData({
        format: "excel",
        include_grades: true,
        include_assignments: true,
        // @ts-ignore backend accepts course_id
        course_id: Number(courseId),
      }) as any;
      const res = await Promise.race([
        axiosCall,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Export timed out, retrying...")), 6000)),
      ]) as any;

      const contentType = (res as any)?.headers?.["content-type"] || (res as any)?.headers?.["Content-Type"] || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      const incomingBlob: Blob = res.data as any;
      // If backend returned JSON error as blob, read and show it
      if (!incomingBlob || (incomingBlob.size === 0)) {
        throw new Error("Empty file received from server");
      }
      if (String(contentType).includes("application/json") || String(incomingBlob.type).includes("application/json")) {
        const text = await (incomingBlob as Blob).text().catch(() => "");
        try {
          const j = text ? JSON.parse(text) : {};
          const msg = j?.detail || j?.message || "Export failed";
          throw new Error(msg);
        } catch {
          throw new Error(text || "Export failed");
        }
      }
      const blob = new Blob([incomingBlob], { type: contentType });
      const safeTitle = (course?.title || `course_${courseId}`).replace(/[^a-z0-9-_]+/gi, "_");
      let filename = `students_${course?.code || "code"}_${safeTitle}.xlsx`;
      const cd = (res as any)?.headers?.["content-disposition"] || (res as any)?.headers?.["Content-Disposition"];
      if (cd) {
        const m = cd.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (m && m[1]) filename = m[1].replace(/['"]/g, "");
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 100);
      toast?.success?.("Export downloaded", { id: "export-students" });
    } catch (e: any) {
      console.error("[export course students] axios failed, trying fetch fallback", e);
      // Fallback: use fetch manually with Bearer token
      try {
        const base = String(api?.defaults?.baseURL || "").replace(/\/+$/, "");
        const params = new URLSearchParams();
        params.set("format", "excel");
        params.set("include_grades", "true");
        params.set("include_assignments", "true");
        params.set("course_id", String(courseId));
        const resp = await fetch(`${base}/instructor/export/students?${params.toString()}`,
          { headers: { Authorization: `Bearer ${getToken()}` } }
        );
        if (!resp.ok) {
          const txt = await resp.text().catch(()=>"");
          let msg = txt;
          try { const j = JSON.parse(txt); msg = j?.detail || j?.message || msg; } catch {}
          throw new Error(msg || `Export failed (HTTP ${resp.status})`);
        }
        const blob = await resp.blob();
        if (!blob || blob.size === 0) throw new Error("Empty file received from server");
        const safeTitle = (course?.title || `course_${courseId}`).replace(/[^a-z0-9-_]+/gi, "_");
        const filename = `students_${course?.code || "code"}_${safeTitle}.xlsx`;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        }, 100);
        toast?.success?.("Export downloaded", { id: "export-students" });
      } catch (e2: any) {
        console.error("[export course students] fetch fallback failed", e2);
        // Final fallback: build Excel-compatible XML from client-side data
        try {
          toast?.loading?.("Building local export...", { id: "export-students" });
          // 1) Load submissions with grades for each assignment
          const subsByAssignment: Record<number, any[]> = {};
          for (const a of assignments) {
            try {
              const { data } = await listAssignmentSubmissions(a.assignment_id, { include_feedback: true, mine_only: false });
              subsByAssignment[a.assignment_id] = Array.isArray(data) ? data : [];
            } catch { subsByAssignment[a.assignment_id] = []; }
          }
          // 2) Build quick lookup for student profiles (email/phone)
          const profileCache: Record<number, { email?: string; phone?: string }> = {};
          for (const s of students) {
            try {
              const resp = await getStudentProfile(s.student_id);
              profileCache[s.student_id] = { email: resp?.data?.email || "", phone: resp?.data?.phone || "" };
            } catch { profileCache[s.student_id] = { email: "", phone: "" }; }
          }
          // 3) Build a wide table: one column per assignment with values 'grade/max' or 'Not submitted'
          const esc = (v:any)=> String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          const aMax = new Map<number, number>(assignments.map(a=>[a.assignment_id, a.max_grade]));
          const assignmentCols = assignments.map(a => ({ id: a.assignment_id, title: a.title, max: aMax.get(a.assignment_id) || 0 }));

          // Build header row: static student fields + dynamic assignment columns
          const headers: string[] = [
            "student_id","student_full_name","student_email","student_phone",
            ...assignmentCols.map(col => `${col.title}`)
          ];

          // Build data rows per student
          const dataRowsXml: string[] = [];
          for (const s of students) {
            const profile = profileCache[s.student_id] || { email: "", phone: "" };
            const baseCells = [
              `${s.student_id}`,
              esc(s.student_name || `Student #${s.student_id}`),
              esc(profile.email || ""),
              esc(profile.phone || ""),
            ];
            const gradeCells: string[] = [];
            for (const col of assignmentCols) {
              const list = subsByAssignment[col.id] || [];
              const found = list.find((r:any)=> Number(r?.studentId ?? r?.student_id) === Number(s.student_id));
              if (found && (found?.feedback?.grade != null || found?.grade != null)) {
                const g = Number(found?.feedback?.grade ?? found?.grade);
                const cellVal = Number.isFinite(g) ? `${g}/${col.max}` : "Not submitted";
                gradeCells.push(esc(cellVal));
              } else {
                gradeCells.push("Not submitted");
              }
            }
            const rowCells = [...baseCells, ...gradeCells]
              .map(val=>`<Cell><Data ss:Type="String">${val}</Data></Cell>`)
              .join("");
            dataRowsXml.push(`<Row>${rowCells}</Row>`);
          }

          // 4) Generate Excel 2003 XML (opens in Excel) as .xls
          const xmlHeader = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="StudentData"><Table>`;
          const xmlFooter = `</Table></Worksheet></Workbook>`;
          const headerRow = `<Row>` + headers.map(h=>`<Cell><Data ss:Type="String">${esc(h)}</Data></Cell>`).join("") + `</Row>`;
          const xml = xmlHeader + headerRow + dataRowsXml.join("") + xmlFooter;
          const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
          const safeTitle = (course?.title || `course_${courseId}`).replace(/[^a-z0-9-_]+/gi, "_");
          const filename = `students_${course?.code || "code"}_${safeTitle}.xls`;
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = filename; a.style.display = "none"; document.body.appendChild(a); a.click();
          setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
          toast?.success?.("Export downloaded", { id: "export-students" });
        } catch (e3:any) {
          console.error("[export course students] local build failed", e3);
          toast.error(e3?.message || "Failed to export students for this course");
        }
      }
    }
    finally {
      setExporting(false);
      toast?.dismiss?.("export-students");
    }
  };

  const handleLogoClick = () => {
    navigate("/instructor/dashboard");
  };

  const displayName = instructor.fullName || "Instructor";

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-200 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-sky-400 to-sky-600 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Stethoscope className="w-8 h-8 text-white" />
          </div>
          <p className="text-gray-800 font-medium">Loading course details...</p>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-gray-200 flex items-center justify-center">
        <div className="text-center">
          <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-800 mb-2">
            Course not found
          </h3>
          <button
            onClick={() => navigate("/instructor/courses")}
            className="group bg-gray-200/50 border border-gray-300 hover:bg-gray-300/70 text-gray-800 font-bold py-3 px-6 rounded-2xl transition-all duration-500 transform hover:-translate-y-1 hover:scale-[1.02] flex items-center justify-center gap-3 shadow-lg mx-auto"
          >
            <ArrowLeft className="w-5 h-5 group-hover:scale-110 transition-transform" />
            Back to Courses
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
              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigate("/instructor/dashboard")}
                  className="p-2 text-gray-800 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-300/70"
                  title="Back to Dashboard"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                  <h1 className="text-2xl font-black bg-gradient-to-r from-gray-800 via-gray-900 to-black bg-clip-text text-transparent">
                    Course Management System
                  </h1>
                  <p className="text-gray-800 font-medium">Course Details</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
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
        {/* Course Header Card */}
        <div
          className={`mb-8 transform transition-all duration-1000 ${
            isAnimated ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
          }`}
        >
          <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-8">
            <div className="flex flex-col lg:flex-row items-start gap-8">
              <div className="flex items-start gap-6 flex-1">
                <div className="relative">
                  <div className="w-20 h-20 bg-gradient-to-r from-sky-400 to-sky-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold shadow-2xl">
                    <BookOpen className="w-10 h-10 text-white" />
                  </div>
                  <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-yellow-400 animate-pulse" />
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-3xl font-black text-gray-900">
                      {course.title}
                    </h2>
                    <span className="px-3 py-1 bg-sky-500/20 text-sky-700 rounded-full text-sm font-bold border border-sky-400/30">
                      {course.code}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className="flex items-center gap-2 text-gray-800">
                      <Users className="w-4 h-4" />
                      <span>{course.enrollment_count} Students Enrolled</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-800">
                      <GraduationCap className="w-4 h-4" />
                      <span>{course.credits} Credits</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-800">
                      <Calendar className="w-4 h-4" />
                      <span>
                        Created:{" "}
                        {new Date(course.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-800">
                      <Activity className="w-4 h-4" />
                      <span>
                        Status: {course.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={handleEditCourse}
                    className="mt-4 group bg-gray-200/50 border border-gray-300 hover:bg-gray-300/70 text-gray-800 font-bold py-3 px-6 rounded-2xl transition-all duration-500 transform hover:-translate-y-1 hover:scale-[1.02] flex items-center justify-center gap-3 shadow-lg"
                  >
                    <Edit className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    Edit Course
                  </button>
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
          <div className="bg-gray-100/70 backdrop-blur-xl rounded-2xl border border-gray-300 p-2">
            <div className="flex flex-wrap gap-2">
              {[
                { id: "overview", label: "Overview", icon: BookOpen },
                { id: "assignments", label: "Assignments", icon: FileText },
                { id: "students", label: "Students", icon: Users },
                { id: "lectures", label: "Lectures", icon: Calendar },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => {
                    setActiveTab(id as any);
                    const params = new URLSearchParams(location.search);
                    params.set("tab", id);
                    navigate(`${location.pathname}?${params.toString()}`, { replace: true });
                  }}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium transition-all duration-300 ${
                    activeTab === id
                      ? "bg-gradient-to-r from-sky-500 to-sky-600 text-white shadow-lg transform scale-105"
                      : "text-gray-700 hover:text-gray-900 hover:bg-gray-100/50"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                </button>
              ))}
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
          {activeTab === "overview" && (
            <div className="space-y-8">
              <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-8">
                <div>
                  <h3 className="text-xl font-black text-gray-900 mb-3">
                    Description
                  </h3>
                  <p className="text-gray-700 leading-relaxed">
                    {course.description ||
                      "No description available for this course."}
                  </p>
                </div>
                <div className="mt-8">
                  <h3 className="text-xl font-black text-gray-900 mb-3">
                    Course Details
                  </h3>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="bg-gray-100/50 rounded-lg p-4 border border-gray-300">
                      <p className="text-gray-600 text-sm mb-1">Instructor</p>
                      <p className="text-gray-900 font-medium">
                        {displayName}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

      {/* Confirm Dialog */}
      {confirmDlg.open && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-gray-100 rounded-3xl p-8 w-full max-w-md shadow-xl border border-gray-300">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-500/15 text-red-600 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-black text-gray-900">{confirmDlg.title || "Confirm"}</h3>
            </div>
            <p className="text-gray-800 mb-6">{confirmDlg.message || "Are you sure?"}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDlg({ open: false })}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-xl hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={async () => { try { await confirmDlg.onConfirm?.(); } catch {} finally { setConfirmDlg({ open: false }); } }}
                className="px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

          {activeTab === "assignments" && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-black text-gray-900">
                  Assignments
                </h3>
                <button
                  onClick={handleCreateAssignment}
                  className="group bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white font-bold py-3 px-6 rounded-2xl transition-all duration-500 transform hover:-translate-y-1 hover:scale-[1.02] flex items-center justify-center gap-3 shadow-lg"
                >
                  <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  Create Assignment
                </button>
              </div>

              {assignments.length === 0 ? (
                <div className="text-center py-8 bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-8">
                  <FileText className="w-16 h-16 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-700">No assignments created yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {assignments.map((assignment) => (
                    <div
                      key={assignment.assignment_id}
                      className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-6 hover:shadow-sky-500/20 transition-all duration-300 hover:-translate-y-1"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <h4 className="text-lg font-bold text-gray-900 mb-2">
                            {assignment.title}
                          </h4>
                          <p className="text-gray-700 text-sm mb-3">
                            {assignment.description}
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-800">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-4 h-4 text-gray-600" />
                              <span>
                                Due:{" "}
                                {new Date(
                                  assignment.deadline
                                ).toLocaleDateString()}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <FileText className="w-4 h-4 text-gray-600" />
                              <span>Max Grade: {assignment.max_grade}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => viewAssignment(assignment)}
                            className="p-2 text-sky-600 hover:text-sky-700 transition-colors rounded-lg hover:bg-sky-100/50"
                            title="View"
                          >
                            <Eye className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => openEditAssignment(assignment)}
                            className="p-2 text-amber-600 hover:text-amber-700 transition-colors rounded-lg hover:bg-amber-100/50"
                            title="Edit"
                          >
                            <Edit className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => askDeleteAssignment(assignment)}
                            className="p-2 text-red-600 hover:text-red-700 transition-colors rounded-lg hover:bg-red-100/50"
                            title="Delete"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "lectures" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-black text-gray-900">Lectures & Attendance</h3>
                <button
                  onClick={() => setCreatingLecture(true)}
                  className="px-4 py-2 rounded-xl bg-sky-600 text-white hover:bg-sky-700"
                >
                  <Plus className="w-4 h-4 inline mr-1" /> New Lecture
                </button>
              </div>

              {/* Attendance summary per student */}
              {attendanceSummary.length > 0 && (
                <div className="bg-gray-100/70 rounded-2xl border border-gray-300 p-4">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-gray-900">
                      <thead>
                        <tr className="text-left">
                          <th className="p-2">Student</th>
                          <th className="p-2">Present</th>
                          <th className="p-2">Absent</th>
                          <th className="p-2">Late</th>
                          <th className="p-2">% Attendance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {students.map((s) => {
                          const row = attendanceSummary.find((r:any) => r.student_id === s.student_id) || {};
                          return (
                            <tr key={s.student_id} className="border-t border-gray-300">
                              <td className="p-2">{s.student_name || `#${s.student_id}`}</td>
                              <td className="p-2">{row.present ?? 0}</td>
                              <td className="p-2">{row.absent ?? 0}</td>
                              <td className="p-2">{row.late ?? 0}</td>
                              <td className="p-2 font-semibold">{(row.percentage ?? 0).toFixed(1)}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Lectures list */}
              <div className="space-y-3">
                {lectures.length === 0 ? (
                  <div className="text-center py-8 bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-8">
                    <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-700">No lectures yet</p>
                  </div>
                ) : (
                  lectures.map((lec) => (
                    <LectureRow
                      key={lec.lecture_id}
                      lecture={lec}
                      students={students}
                      onRefresh={async () => {
                        const [lecRes, sumRes] = await Promise.all([
                          listLectures(Number(courseId)),
                          getCourseAttendanceSummary(Number(courseId)),
                        ]);
                        setLectures(lecRes.data || []);
                        setAttendanceSummary(sumRes.data || []);
                      }}
                    />
                  ))
                )}
              </div>

              {/* Create lecture modal overlay (via portal) */}
              {creatingLecture && createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  {/* Backdrop */}
                  <div className="absolute inset-0 bg-black/60" onClick={() => setCreatingLecture(false)} />
                  {/* Modal Card */}
                  <div className="relative w-full max-w-md mx-auto bg-gray-100 rounded-3xl shadow-2xl border border-gray-300 overflow-hidden min-h-[80vh] flex flex-col">
                    <div className="px-6 sm:px-8 pt-6 pb-4 border-b border-gray-300 flex items-center justify-between">
                      <div>
                        <h4 className="text-2xl font-black text-gray-900">Create Lecture</h4>
                        <p className="text-gray-800">Add a new lecture to this course</p>
                      </div>
                      <button
                        onClick={() => setCreatingLecture(false)}
                        className="p-2 text-gray-800 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-300/70"
                        aria-label="Close"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="px-6 sm:px-8 py-6 flex-1 overflow-y-auto">
                      <div className="grid grid-cols-1 gap-5">
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-800 mb-1">Date & Time</label>
                          <input
                            type="datetime-local"
                            value={newLecture.date}
                            onChange={(e) => setNewLecture((d) => ({ ...d, date: e.target.value }))}
                            className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:border-sky-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-800 mb-1">Topic</label>
                          <input
                            type="text"
                            value={newLecture.topic}
                            onChange={(e) => setNewLecture((d) => ({ ...d, topic: e.target.value }))}
                            placeholder="e.g., Occlusion Principles"
                            className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:border-sky-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-800 mb-1">Duration (minutes)</label>
                          <input
                            type="number"
                            value={newLecture.duration_minutes ?? 60}
                            onChange={(e) => setNewLecture((d) => ({ ...d, duration_minutes: Number(e.target.value) }))}
                            className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:border-sky-500"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="px-6 sm:px-8 pb-6 flex flex-col sm:flex-row items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setCreatingLecture(false)}
                        className="w-full sm:w-auto px-6 py-3 bg-gray-200 text-gray-800 rounded-xl hover:bg-gray-300 transition-colors shadow-md flex items-center gap-2"
                      >
                        <X className="w-5 h-5" />
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            if (!courseId) return;
                            await createLecture(Number(courseId), {
                              date: new Date(newLecture.date).toISOString(),
                              topic: newLecture.topic,
                              duration_minutes: newLecture.duration_minutes ?? 60,
                            });
                            const [lecRes, sumRes] = await Promise.all([
                              listLectures(Number(courseId)),
                              getCourseAttendanceSummary(Number(courseId)),
                            ]);
                            setLectures(lecRes.data || []);
                            setAttendanceSummary(sumRes.data || []);
                            setCreatingLecture(false);
                            toast.success("Lecture created");
                          } catch (e:any) {
                            toast.error(e?.response?.data?.detail || "Failed to create lecture");
                          }
                        }}
                        className="w-full sm:w-auto px-6 py-3 bg-sky-500 text-white rounded-xl hover:bg-sky-600 transition-colors shadow-md flex items-center gap-2"
                      >
                        Create Lecture
                      </button>
                    </div>
                  </div>
                </div>,
                document.body
              )}
            </div>
          )}

          {activeTab === "students" && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-black text-gray-900">
                  Enrolled Students
                </h3>
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 bg-gray-100/50 text-gray-800 rounded-full text-sm font-medium border border-gray-300">
                    {students.length} students
                  </span>
                  <button
                    onClick={exportThisCourseStudents}
                    className={`px-5 py-3 text-sm font-extrabold rounded-xl text-white shadow-sm transition-colors border border-emerald-700/50 ${exporting ? 'bg-emerald-400 cursor-not-allowed opacity-80' : 'bg-emerald-600 hover:bg-emerald-700 hover:shadow-md'}`}
                    disabled={exporting}
                    title="Export student data (Excel)"
                  >
                    {exporting ? 'Exporting…' : 'Export Student Data'}
                  </button>
                </div>
              </div>

              {students.length === 0 ? (
                <div className="text-center py-8 bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-8">
                  <Users className="w-16 h-16 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-700">No students enrolled yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {students.map((student) => (
                    <div
                      key={student.enrollment_id}
                      className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-6 hover:shadow-sky-500/20 transition-all duration-300 hover:-translate-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gradient-to-r from-sky-400 to-sky-600 rounded-full flex items-center justify-center">
                            <span className="text-white font-bold text-sm">
                              {student.student_name
                                ? student.student_name.charAt(0).toUpperCase()
                                : "S"}
                            </span>
                          </div>
                          <div>
                            <h4 className="text-gray-900 font-medium">
                              {student.student_name || `Student #${student.student_id}`}
                            </h4>
                            <p className="text-gray-700 text-sm">
                              Status: {student.status}
                            </p>
                            {/* Attendance summary chips */}
                            <div className="mt-2 flex flex-wrap gap-2 text-xs">
                              {(() => {
                                const s = attendanceSummary.find((a: any) => Number(a.student_id) === Number(student.student_id));
                                const present = s?.present ?? 0;
                                const absent = s?.absent ?? 0;
                                const late = s?.late ?? 0;
                                const excused = s?.excused ?? 0;
                                const total = s?.total_lectures ?? (present + absent + late + excused);
                                const pct = s?.percentage ?? (total > 0 ? Math.round(((present + excused) / total) * 100) : 0);
                                return (
                                  <>
                                    <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">Present: {present}</span>
                                    <span className="px-2 py-1 rounded-full bg-red-100 text-red-800 border border-red-200">Absent: {absent}</span>
                                    <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200">Late: {late}</span>
                                    <span className="px-2 py-1 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200" title="Excused counts toward the rate">Excused: {excused}</span>
                                    <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-800 border border-gray-200">Total Lectures: {total}</span>
                                    <span className="px-2 py-1 rounded-full bg-sky-100 text-sky-800 border border-sky-200" title="Rate treats Excused as Present">Rate: {pct}%</span>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-gray-600 text-sm">Enrolled</p>
                          <p className="text-gray-900 text-sm">
                            {new Date(student.enrolled_at).toLocaleDateString()}
                          </p>
                          <div className="mt-2">
                            <button
                              onClick={() => exportStudentAttendanceHtml(student)}
                              className="px-3 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700 border border-sky-700"
                              title="Export Attendance as HTML"
                            >
                              Export HTML
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {/* Edit Assignment Modal */}
      {editing.open && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50" data-testid="modal-edit-assignment">
          <div className="bg-gray-100 rounded-3xl p-8 w-full max-w-xl shadow-xl border border-gray-300">
            <div className="flex items-center justify-between pb-4 border-b border-gray-300">
              <h3 className="text-xl font-black text-gray-900">Edit Assignment</h3>
              <button onClick={closeEditModal} className="p-2 text-gray-800 hover:text-gray-900">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="pt-4 space-y-4">
              <div>
                <label className="block text-gray-800 font-medium mb-2">Title</label>
                <input
                  type="text"
                  value={editing.data.title || ""}
                  onChange={(e) => setEditing((prev) => ({ ...prev, data: { ...prev.data, title: e.target.value } }))}
                  className="w-full p-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-gray-800 font-medium mb-2">Description</label>
                <textarea
                  value={editing.data.description || ""}
                  onChange={(e) => setEditing((prev) => ({ ...prev, data: { ...prev.data, description: e.target.value } }))}
                  rows={4}
                  className="w-full p-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:border-sky-500"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-800 font-medium mb-2">Deadline</label>
                  <input
                    type="datetime-local"
                    value={(editing.data.deadline ? (() => { try { return new Date(editing.data.deadline as string).toISOString().slice(0,16); } catch { return ""; } })() : "")}
                    onChange={(e) => setEditing((prev) => ({ ...prev, data: { ...prev.data, deadline: new Date(e.target.value).toISOString() } }))}
                    className="w-full p-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-gray-800 font-medium mb-2">Max Grade</label>
                  <input
                    type="number"
                    value={(editing.data.max_grade as any) ?? 100}
                    onChange={(e) => setEditing((prev) => ({ ...prev, data: { ...prev.data, max_grade: Number(e.target.value) } }))}
                    className="w-full p-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={closeEditModal} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-xl hover:bg-gray-300 flex items-center gap-2">
                  <X className="w-4 h-4" /> Cancel
                </button>
                <button onClick={saveEdit} disabled={savingEdit} className="px-4 py-2 bg-sky-600 text-white rounded-xl hover:bg-sky-700 flex items-center gap-2 disabled:opacity-60">
                  <Save className="w-4 h-4" /> {savingEdit ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LectureRow({ lecture, students, onRefresh }: { lecture: any; students: any[]; onRefresh: () => Promise<void> | void }) {
  const [marks, setMarks] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await getLectureAttendance(Number(lecture.lecture_id));
        const map: Record<number, string> = {};
        (res.data || []).forEach((m: any) => {
          map[m.student_id] = m.status;
        });
        setMarks(map);
      } catch (e) {}
    })();
  }, [lecture.lecture_id]);

  const setAll = async (status: string) => {
    try {
      setLoading(true);
      const payload = students.map((s) => ({ student_id: s.student_id, status }));
      await markLectureAttendance(Number(lecture.lecture_id), payload);
      await onRefresh();
      const next: Record<number, string> = {};
      students.forEach((s) => (next[s.student_id] = status));
      setMarks(next);
      toast.success("Attendance saved");
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Failed to save");
    } finally {
      setLoading(false);
    }
  };

  const saveOne = async (studentId: number, status: string) => {
    try {
      setLoading(true);
      await setStudentAttendance(Number(lecture.lecture_id), studentId, { status });
      await onRefresh();
      toast.success("Saved");
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-100/70 rounded-2xl border border-gray-300 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-semibold text-gray-900">
            {new Date(lecture.date).toLocaleString()} {lecture.topic ? `— ${lecture.topic}` : ""}
          </div>
          <div className="text-gray-600 text-sm">
            {(() => {
              const total = Number(lecture.duration_minutes ?? 60) || 0;
              const h = Math.floor(total / 60);
              const m = total % 60;
              if (h > 0) {
                return `Duration: ${h} hr${h > 1 ? 's' : ''}${m ? ` ${m} min` : ''}`;
              }
              return `Duration: ${m} min`;
            })()}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setAll("Present")} disabled={loading} className="px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">Mark All Present</button>
          <button onClick={() => setAll("Absent")} disabled={loading} className="px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700">Mark All Absent</button>
          <button
            onClick={async () => {
              try {
                setLoading(true);
                const payload = Object.entries(marks).map(([sid, status]) => ({ student_id: Number(sid), status }));
                // include students not changed yet (default Absent in UI) to persist explicit choice
                const missing = students
                  .filter((s) => marks[s.student_id] == null)
                  .map((s) => ({ student_id: s.student_id, status: "Absent" }));
                await markLectureAttendance(Number(lecture.lecture_id), [...payload, ...missing]);
                await onRefresh();
                toast.success("All changes saved");
              } catch (e:any) {
                toast.error(e?.response?.data?.detail || "Failed to save changes");
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
            className="px-3 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-700"
          >
            Save All Changes
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm text-gray-900">
          <thead>
            <tr className="text-left">
              <th className="p-2">Student</th>
              <th className="p-2">Status</th>
              <th className="p-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.student_id} className="border-t border-gray-300">
                <td className="p-2">{s.student_name || `#${s.student_id}`}</td>
                <td className="p-2">
                  <select
                    value={marks[s.student_id] || "Absent"}
                    onChange={(e) => setMarks((m) => ({ ...m, [s.student_id]: e.target.value }))}
                    className="p-2 rounded-md border border-gray-300 bg-white"
                  >
                    <option value="Present">Present</option>
                    <option value="Absent">Absent</option>
                    <option value="Late">Late</option>
                    <option value="Excused">Excused</option>
                  </select>
                </td>
                <td className="p-2">
                  <button
                    onClick={() => saveOne(s.student_id, marks[s.student_id] || "Absent")}
                    disabled={loading}
                    className="px-3 py-1 rounded-md bg-sky-600 text-white hover:bg-sky-700"
                  >
                    Save
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
