// src/pages/instructor/Tasks.tsx
import { useSearchParams, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import {
  ClipboardList,
  Plus,
  X,
  Calendar,
  Users,
  FileText,
  Eye,
  Edit,
  Trash2,
  Download,
  Upload,
  Star,
  SortAsc,
  SortDesc,
} from "lucide-react";
  import {
    api,
    listAssignments,
    createAssignment,
    updateAssignment,
    deleteAssignment,
    listAssignmentSubmissions,
    reviewInstructorSubmission,
    getInstructorSubmission,
    getCourses,
    getCourseEnrollments,
    getStudentProfile,
    fileUrl,
  } from "../../lib/api";
import SubmissionReviewModal from "../../components/SubmissionReviewModal";
import toast from "react-hot-toast";

type UiTask = {
  id: number;
  title: string;
  type: string;
  department: string;
  deadline?: string | null; // ISO "YYYY-MM-DD"
  status: "Active" | "Draft" | "Expired" | string;
  submissions: number;
  totalStudents: number;
  description?: string | null;
  courseId?: number; // include course filter support
  maxGrade?: number;
};

type UiSubmission = {
  id: number;
  studentId?: number | null;
  studentName: string;
  submittedAt?: string | null; // "YYYY-MM-DD HH:mm"
  status: "Not Submitted" | "Graded" | "Needs Revision" | string;
  grade: string | null;
  files: string[];
  filePaths: (string | null)[];
};

const statusBadge = (status: string) => {
  switch (status) {
    case "Active":
      return "bg-emerald-100 text-emerald-800";
    case "Draft":
      return "bg-amber-100 text-amber-800";
    case "Expired":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

const submissionBadge = (status: string) => {
  switch (status) {
    case "Graded":
      return "bg-emerald-100 text-emerald-800";
    case "Not Submitted":
      return "bg-amber-100 text-amber-800";
    case "Needs Revision":
      return "bg-orange-100 text-orange-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const safeNum = (n: any, d = 0) => (Number.isFinite(Number(n)) ? Number(n) : d);

const asFileUrl = (path?: string | null): string | null => {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const base = (import.meta as any).env?.VITE_API_URL || "http://127.0.0.1:8000";
  const baseClean = String(base).replace(/\/+$/, "");
  const pathClean = String(path).replace(/^\/+/, "");
  return `${baseClean}/${pathClean}`;
};

export default function Tasks() {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<UiTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [courses, setCourses] = useState<any[]>([]);

  const [form, setForm] = useState({
    title: "",
    description: "",
    course_id: "",
    deadline: "",
    max_grade: 100,
  });

  useEffect(() => {
    if (params.get("create") === "1") {
      openCreate();
      navigate("/instructor/tasks", { replace: true });
    }
  }, [params, navigate]);

  const [selectedTask, setSelectedTask] = useState<UiTask | null>(null);
  const [showSubmissions, setShowSubmissions] = useState(false);
  const [submissions, setSubmissions] = useState<UiSubmission[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);

  const [reviewingSubmissionId, setReviewingSubmissionId] = useState<number | null>(null);

  const [sortBy, setSortBy] = useState<"deadline" | "title">("deadline");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCourse, setFilterCourse] = useState<string>("all");

  // Load courses for the create/edit modal select
  useEffect(() => {
    (async () => {
      try {
        const list = await getCourses();
        setCourses(Array.isArray(list) ? list : []);
      } catch (e) {
        console.warn("[tasks] failed to load courses", e);
        setCourses([]);
      }
    })();
  }, []);

  const loadTasks = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const courseIdParamRaw = params.get("course_id");
      const courseIdParam = courseIdParamRaw ? Number(courseIdParamRaw) : 0;
      const assignmentIdParamRaw = params.get("assignment_id");
      const assignmentIdParam = assignmentIdParamRaw ? Number(assignmentIdParamRaw) : 0;

      const { data } = await listAssignments(
        courseIdParam ? ({ course_id: courseIdParam } as any) : undefined
      );

      const mapped: UiTask[] = (data ?? []).map((r: any) => {
        const deadline = r.deadline || r.due_date || r.dueDate || null;
        const submissionsCount =
          r.submissions_count ?? r.submissionsCount ?? (r.stats ? r.stats.submissions ?? 0 : 0);
        const totalStudents =
          r.total_students ?? r.totalStudents ?? (r.stats ? r.stats.total_students ?? 0 : 0);
        const cId = Number(r.course_id ?? r.courseId ?? 0);
        const maxGrade = Number(
          r.max_grade ?? r.maxGrade ?? r.max_points ?? r.points_max ?? r.total_points ?? r.out_of ?? 0
        );

        return {
          id: Number(r.id ?? r.assignment_id ?? r.assignmentId),
          title: String(r.title ?? r.name ?? "Untitled"),
          type: String(r.type ?? r.assignment_type?.name ?? "-"),
          department: String(r.department?.name ?? r.department ?? r.year ?? "-"),
          deadline: deadline ? String(deadline).slice(0, 10) : null,
          status: String(r.status ?? "Active"),
          submissions: safeNum(submissionsCount, 0),
          totalStudents: safeNum(totalStudents, 0),
          // Be lenient: different backends may use various keys
          description:
            (r.description ??
             r.instructions ??
             r.details ??
             r.desc ??
             r.assignment_description ??
             r.assignmentDescription ??
             ""),
          courseId: cId,
          maxGrade: Number.isFinite(maxGrade) && maxGrade > 0 ? maxGrade : undefined,
        };
      });

      // If course filter provided (redundant since backend filtered), keep only matching
      const filtered = courseIdParam ? mapped.filter((t) => t.courseId === courseIdParam) : mapped;
      setTasks(filtered);

      // Hydrate missing descriptions by fetching assignment details
      const toHydrate = filtered.filter((t) => !t.description || !t.description.trim());
      if (toHydrate.length) {
        try {
          const results = await Promise.allSettled(
            toHydrate.map((t) => api.get(`/assignments/${t.id}`).then((res) => ({ id: t.id, data: res.data })))
          );
          const descById = new Map<number, string>();
          results.forEach((r) => {
            if (r.status === "fulfilled" && r.value?.data) {
              const d = r.value.data as any;
              const desc =
                d.description ??
                d.instructions ??
                d.details ??
                d.desc ??
                d.assignment_description ??
                d.assignmentDescription ??
                "";
              if (desc && String(desc).trim()) {
                descById.set(r.value.id as number, String(desc));
              }
            }
          });
          if (descById.size) {
            setTasks((prev) =>
              prev.map((t) =>
                descById.has(t.id) && (!t.description || !t.description.trim())
                  ? { ...t, description: descById.get(t.id)! }
                  : t
              )
            );
          }
          // Hydrate totalStudents when missing (0) using course enrollments
          const missingCounts = filtered.filter((t) => (!t.totalStudents || t.totalStudents === 0) && t.courseId);
          if (missingCounts.length) {
            try {
              const byCourse = new Map<number, number[]>();
              missingCounts.forEach((t) => {
                const cid = t.courseId as number;
                if (!byCourse.has(cid)) byCourse.set(cid, []);
                byCourse.get(cid)!.push(t.id);
              });
              const fetches = Array.from(byCourse.keys()).map((cid) =>
                getCourseEnrollments(cid).then((list: any[]) => ({ cid, list }))
              );
              const res = await Promise.allSettled(fetches);
              const countByCourse = new Map<number, number>();
              res.forEach((r) => {
                if (r.status === "fulfilled") {
                  const active = (r.value.list || []).filter((e: any) => (e.status || "").toLowerCase() === "active");
                  countByCourse.set(r.value.cid, active.length);
                }
              });
              if (countByCourse.size) {
                setTasks((prev) =>
                  prev.map((t) =>
                    (!t.totalStudents || t.totalStudents === 0) && t.courseId && countByCourse.has(t.courseId)
                      ? { ...t, totalStudents: countByCourse.get(t.courseId)! }
                      : t
                  )
                );
              }
            } catch (e) {
              console.warn("[tasks] totalStudents hydration skipped", e);
            }
          }
          // Second pass: hydrate via course-management assignments for any still missing
          // compute current tasks snapshot for remaining description hydration
          const tasksNow = ((): UiTask[] => {
            // We don't have direct access to latest state here; materialize from 'filtered' then overlay descById
            return filtered.map(t => (
              descById.has(t.id) && (!t.description || !t.description.trim())
                ? { ...t, description: descById.get(t.id)! }
                : t
            ));
          })();
          const missingWithCourse = tasksNow.filter(t => (!t.description || !t.description.trim()) && t.courseId);
          if (missingWithCourse.length) {
            const byCourse = new Map<number, number[]>();
            missingWithCourse.forEach(t => {
              const cid = t.courseId as number;
              if (!byCourse.has(cid)) byCourse.set(cid, []);
              byCourse.get(cid)!.push(t.id);
            });
            const courseFetches = Array.from(byCourse.keys()).map(cid =>
              api.get(`/course-management/courses/${cid}/assignments`).then(res => ({ cid, list: res.data as any[] }))
            );
            const courseResults = await Promise.allSettled(courseFetches);
            const descByAssign = new Map<number, string>();
            courseResults.forEach(r => {
              if (r.status === "fulfilled") {
                const items = r.value.list || [];
                items.forEach((a: any) => {
                  const aid = Number(a.assignment_id ?? a.id);
                  const d = a.description ?? a.details ?? a.instructions ?? a.desc ?? "";
                  if (aid && d && String(d).trim()) descByAssign.set(aid, String(d));
                });
              }
            });
            if (descByAssign.size) {
              setTasks(prev => prev.map(t =>
                (!t.description || !t.description.trim()) && descByAssign.has(t.id)
                  ? { ...t, description: descByAssign.get(t.id)! }
                  : t
              ));
            }
          }
        } catch (e) {
          // Non-fatal; just skip hydration on error
          console.warn("[tasks] description hydration skipped", e);
        }
      }

      // Auto-open submissions for a given assignment if specified
      if (assignmentIdParam) {
        const target = filtered.find((t) => t.id === assignmentIdParam);
        if (target) {
          // open immediately using the mapped object
          openSubmissions(target);
        }
      }
    } catch (e) {
      console.error("[tasks] load failed", e);
      setLoadError("Failed to load tasks.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
    // re-run when query params change (course_id / assignment_id)
  }, [params]);

  const courseNameById = useMemo(() => {
    const m = new Map<number, string>();
    courses.forEach((c: any) => m.set(Number(c.id), c.name || c.title || c.code || `Course #${c.id}`));
    return m;
  }, [courses]);

  const sortedTasks = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const matchesSearch = (t: UiTask) => {
      if (!term) return true;
      const courseName = t.courseId ? (courseNameById.get(Number(t.courseId)) || "") : "";
      return (
        (t.title || "").toLowerCase().includes(term) ||
        (t.description || "").toLowerCase().includes(term) ||
        (t.type || "").toLowerCase().includes(term) ||
        (t.department || "").toLowerCase().includes(term) ||
        courseName.toLowerCase().includes(term)
      );
    };

    const filtered = tasks.filter((t) => {
      const courseOk = filterCourse === "all" || String(t.courseId || "") === filterCourse;
      return courseOk && matchesSearch(t);
    });

    const arr = [...filtered];
    arr.sort((a, b) => {
      if (sortBy === "deadline") {
        const A = a.deadline ? new Date(a.deadline).getTime() : 0;
        const B = b.deadline ? new Date(b.deadline).getTime() : 0;
        return sortOrder === "asc" ? A - B : B - A;
      } else {
        const A = a.title.toLowerCase();
        const B = b.title.toLowerCase();
        if (A < B) return sortOrder === "asc" ? -1 : 1;
        if (A > B) return sortOrder === "asc" ? 1 : -1;
        return 0;
      }
    });
    return arr;
  }, [tasks, sortBy, sortOrder, searchTerm, filterCourse, courseNameById]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      title: "",
      description: "",
      course_id: "",
      deadline: "",
      max_grade: 100,
    });
    setShowCreateModal(true);
  };

  const openEdit = (t: UiTask) => {
    setEditingId(t.id);
    setForm({
      title: t.title || "",
      description: t.description || "",
      course_id: t.courseId ? String(t.courseId) : "",
      // If only date available, leave empty so user picks datetime
      deadline: "",
      max_grade: 100,
    });
    setShowCreateModal(true);
  };

  const submitForm = async () => {
    setSaveError(null);

    if (!form.title.trim()) {
      setSaveError("Title is required.");
      return;
    }
    if (!form.course_id) {
      setSaveError("Please select a course.");
      return;
    }
    if (!form.deadline) {
      setSaveError("Please choose a deadline.");
      return;
    }
    if (!form.max_grade || Number(form.max_grade) <= 0) {
      setSaveError("Please enter a valid maximum grade.");
      return;
    }

    setIsSaving(true);
    try {
      // Convert datetime-local to ISO
      const deadlineIso = new Date(form.deadline).toISOString();
      const createPayload = {
        title: form.title.trim(),
        description: form.description?.trim() || undefined,
        course_id: Number(form.course_id),
        deadline: deadlineIso,
        max_grade: Number(form.max_grade),
      };

      if (editingId) {
        await updateAssignment(editingId, {
          title: createPayload.title,
          description: createPayload.description || "",
          deadline: createPayload.deadline,
          // @ts-ignore backend supports max_grade
          max_grade: createPayload.max_grade,
        } as any);
        toast.success("Assignment updated successfully");
      } else {
        await createAssignment(createPayload);
        toast.success("Assignment created successfully");
      }

      setShowCreateModal(false);
      await loadTasks();
    } catch (e: any) {
      console.error(
        "[create/update assignment]",
        e?.response?.status,
        e?.response?.config?.url,
        e?.response?.data
      );
      const errMsg =
        e?.response?.data?.detail ||
        (e?.response?.status
          ? `HTTP ${e.response.status} ${e.response.config?.url}`
          : e?.message) ||
        "Failed to save task.";
      setSaveError(errMsg);
      toast.error(errMsg);
    } finally {
      setIsSaving(false);
    }
  };

  const removeTask = async (id: number) => {
    if (!confirm("Delete this task?")) return;
    try {
      await deleteAssignment(id);
      toast.success("Assignment deleted");
      await loadTasks();
    } catch (e) {
      console.error("[tasks] delete failed", e);
      toast.error("Failed to delete task.");
    }
  };

  const handleFormChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const openSubmissions = async (task: UiTask) => {
    setSelectedTask(task);
    setShowSubmissions(true);
    setSubsLoading(true);
    setSubmissions([]);
    try {
      const { data } = await listAssignmentSubmissions(task.id);
      const mapped: UiSubmission[] = (data ?? []).map((r: any, idx: number) => {
        const filesArr: string[] =
          (r.files ? r.files.map((f: any) => String(f.name ?? f.filename ?? f)) : null) ??
          (r.fileName ? [String(r.fileName)] : []) ??
          [];

        const filePaths: (string | null)[] =
          (r.files ? r.files.map((f: any) => f.path ?? f.file_path ?? f.url ?? null) : null) ??
          (r.filePath ? [String(r.filePath)] : []) ??
          [];

        // Derive grade from multiple possible fields (backend variations)
        const coerceNum = (v: any): number | null => {
          if (v == null) return null;
          const n = typeof v === "string" ? Number(v) : Number(v);
          return Number.isFinite(n) ? n : null;
        };
        const gradeCandidates: any[] = [
          r.grade,
          r.feedback_grade,
          r.final_grade,
          r.result?.grade,
          r.result_grade,
          r.evaluation?.grade,
        ];
        let gradeNum: number | null = null;
        for (const g of gradeCandidates) {
          const n = coerceNum(g);
          if (n != null) { gradeNum = n; break; }
        }
        // Use backend grade as-is (assumed already on the assignment scale); do not parse from free text
        let gradeStr = gradeNum != null ? String(gradeNum) : (typeof r.grade === "string" ? r.grade : null);
        // Debug graded rows (first 3) to see available grade fields
        try {
          const sLower = String(r.status ?? '').toLowerCase();
          if ((sLower === 'graded' || sLower === 'accepted') && idx < 3) {
            console.debug('[Tasks] Graded mapping', {
              id: r.id ?? r.submission_id,
              fields: {
                grade: r.grade,
                feedback_grade: r.feedback_grade,
                final_grade: r.final_grade,
                grade100: r.grade100,
                score: r.score,
                score_value: r.score_value,
                mark: r.mark,
                points: r.points,
                obtained_points: r.obtained_points,
                awarded_points: r.awarded_points,
                result_grade: r.result?.grade ?? r.result_grade,
                evaluation_grade: r.evaluation?.grade,
                feedback_text: r.feedback_text ?? r.review_feedback ?? r.feedback,
              },
              resolved: gradeStr,
            });
          }
        } catch {}

        const uiStatus = (() => {
          const s = String(r.status ?? "").toLowerCase();
          if (s === "accepted" || s === "graded") return "Graded";
          if (s === "needsrevision" || s === "rejected") return "Needs Revision";
          return "Not Submitted";
        })();

        // Try a wide set of common name fields; normalize and trim
        const nameCandidates = [
          r.student_name,
          r.studentName,
          r.student_full_name,
          r.studentFullName,
          r.student?.full_name,
          r.student?.fullName,
          [r.student_first_name, r.student_last_name].filter(Boolean).join(" "),
          [r.student?.first_name, r.student?.last_name].filter(Boolean).join(" "),
          [r.student?.firstName, r.student?.lastName].filter(Boolean).join(" "),
        ]
          .map((x) => (x != null ? String(x).trim() : ""))
          .filter((x) => x.length > 0);
        const usernameCandidates = [
          r.student_username,
          r.studentUsername,
          r.student?.username,
        ]
          .map((x) => (x != null ? String(x).trim() : ""))
          .filter((x) => x.length > 0);
        const emailCandidates = [
          r.student_email,
          r.studentEmail,
          r.student?.email,
        ]
          .map((x) => (x != null ? String(x).trim() : ""))
          .filter((x) => x.length > 0);
        const fallbackId = r.student?.id ?? r.student_id ?? r.studentId ?? r.studentNumber ?? r.student_number;
        // If backend returns a raw string in r.student, use it
        const rawStudent = typeof r.student === 'string' ? String(r.student).trim() : "";
        const studentName =
          nameCandidates[0] ||
          rawStudent ||
          usernameCandidates[0] ||
          emailCandidates[0] ||
          (fallbackId != null ? `Student ${fallbackId}` : "Student");

        // Debug first few rows once to verify mapping fields (non-fatal)
        try {
          if (idx < 3) {
            console.debug("[Tasks] Submission student mapping", {
              raw: {
                student_name: r.student_name,
                studentName: r.studentName,
                student_full_name: r.student_full_name,
                studentFullName: r.studentFullName,
                student: r.student,
              },
              resolved: studentName,
            });
          }
        } catch {}

        return {
          id: Number(r.id ?? r.submission_id ?? r.submissionId),
          studentId: ((): number | null => {
            const sid = r.student?.id ?? r.student_id ?? r.studentId ?? r.studentNumber ?? r.student_number;
            return sid != null ? Number(sid) : null;
          })(),
          studentName,
          submittedAt: r.submittedAt ?? r.submitted_at ?? null,
          status: uiStatus,
          grade: gradeStr,
          files: filesArr,
          filePaths,
        };
      });
      setSubmissions(mapped);

      // Enrich file lists by fetching detailed submission for each row
      try {
        const details = await Promise.allSettled(mapped.map((m) => getInstructorSubmission(m.id)));
        const merged = mapped.map((m, i) => {
          const dres = details[i];
          if (dres.status !== 'fulfilled') return m;
          const d: any = dres.value.data || {};
          const arr = Array.isArray(d.files) ? d.files : (Array.isArray(d.attachments) ? d.attachments : []);
          // Build pairs and de-duplicate by name|path key
          const pairs: { name: string; path: string | null }[] = (arr || []).map((f: any) => ({
            name: String(f?.name ?? f?.filename ?? f?.file_name ?? f ?? "").trim(),
            path: (f?.path ?? f?.file_path ?? f?.url ?? f?.fileUrl ?? null) as any,
          })).filter(p => p.name.length > 0);
          const seen = new Set<string>();
          const uniq = pairs.filter((p: { name: string; path: string | null }) => {
            const key = `${p.name}||${p.path ?? ''}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          const dFiles: string[] = uniq.map(p => p.name);
          const dPaths: (string | null)[] = uniq.map(p => p.path);
          if (dFiles.length > 0) {
            return { ...m, files: dFiles, filePaths: dPaths };
          }
          return m;
        });
        setSubmissions(merged);
      } catch (e) {
        console.warn('[tasks] file enrichment skipped', e);
      }

      // Enrich fallback names like '#1' or 'Student 1' with real names via profile API
      try {
        const unknowns = mapped.filter((m) => {
          const n = (m.studentName || "").toLowerCase();
          return (!!m.studentId) && (n.startsWith("#") || n.startsWith("student "));
        });
        const uniqueIds = Array.from(new Set(unknowns.map((m) => m.studentId as number))).filter(Boolean);
        if (uniqueIds.length > 0) {
          const results = await Promise.allSettled(uniqueIds.map((sid) => getStudentProfile(sid)));
          const nameById = new Map<number, string>();
          results.forEach((res, i) => {
            if (res.status === "fulfilled") {
              const data: any = res.value.data;
              const fullName = data?.full_name || data?.name || [data?.first_name, data?.last_name].filter(Boolean).join(" ");
              const username = data?.username || data?.student?.username;
              const label = (fullName && String(fullName).trim()) || (username && String(username).trim());
              if (label) nameById.set(uniqueIds[i], label);
            }
          });
          if (nameById.size > 0) {
            setSubmissions((prev) => prev.map((s) => {
              if (s.studentId && nameById.has(s.studentId)) {
                return { ...s, studentName: nameById.get(s.studentId)! };
              }
              return s;
            }));
          }
        }
      } catch (e) {
        console.warn("[tasks] name enrichment skipped", e);
      }

      // Enrich missing grades for graded/accepted submissions by fetching detailed submission
      try {
        const needsGrade = mapped.filter((m) => {
          const st = String(m.status || "").toLowerCase();
          return (!m.grade || m.grade === "") && (st === "graded" || st === "accepted");
        });
        if (needsGrade.length > 0) {
          const detailResults = await Promise.allSettled(
            needsGrade.map((m) => getInstructorSubmission(m.id))
          );
          const gradeById = new Map<number, string>();
          const coerceNum = (v: any): number | null => {
            if (v == null) return null;
            const n = typeof v === "string" ? Number(v) : Number(v);
            return Number.isFinite(n) ? n : null;
          };
          const extractGradeFromObject = (obj: any, depth = 0): { value: number | null; path?: string } => {
            if (!obj || typeof obj !== 'object' || depth > 2) return { value: null };
            let best: { value: number | null; keyRank: number; path?: string } = { value: null, keyRank: 9999 } as any;
            const rank = (k: string) => {
              const key = k.toLowerCase();
              // ignore maxima/denominators
              if (key.includes('max') || key.includes('out_of') || key.includes('total')) return 9999;
              if (key.includes('final_grade')) return 1;
              if (key === 'grade' || key.endsWith('_grade') || key.includes('grade')) return 2;
              return 9999;
            };
            for (const [k, v] of Object.entries(obj)) {
              const r = rank(k);
              if (r < 9999) {
                const n = coerceNum(v);
                if (n != null && r < best.keyRank) best = { value: n, keyRank: r, path: k };
              }
              if (v && typeof v === 'object') {
                // don't dive into assignment structure for grades
                if (k && String(k).toLowerCase().includes('assignment')) continue;
                const child = extractGradeFromObject(v, depth + 1);
                if (child.value != null) {
                  const cr = rank(k);
                  const effRank = Math.min(cr, 3); // prefer near parents
                  if (!best.value || effRank < best.keyRank) best = { value: child.value, keyRank: effRank, path: `${k}.${child.path}` } as any;
                }
              }
            }
            return { value: best.value, path: best.path };
          };
          detailResults.forEach((res, i) => {
            if (res.status === "fulfilled") {
              const d: any = res.value.data;
              const candidates = [
                d?.grade,
                d?.feedback_grade,
                d?.final_grade,
                d?.result?.grade,
                d?.result_grade,
                d?.evaluation?.grade,
              ];
              let val: string | null = null;
              for (const g of candidates) {
                const n = coerceNum(g);
                if (n != null) { val = String(n); break; }
                if (typeof g === "string" && g.trim()) { val = g.trim(); break; }
              }
              if (!val) {
                // try generic extraction from payload
                const ex = extractGradeFromObject(d);
                if (ex.value != null) val = String(ex.value);
                try {
                  if (i < 2) console.debug('[Tasks] Detail grade extraction', { id: needsGrade[i].id, path: ex.path, value: ex.value, sample: d });
                } catch {}
              }
              if (val) gradeById.set(needsGrade[i].id, val);

              // Also try to detect max grade from detail payload if not set on selectedTask
              const maxCandidates = [
                d?.max_grade,
                d?.max_points,
                d?.points_max,
                d?.total_points,
                d?.out_of,
                d?.assignment?.max_grade,
                d?.assignment?.max_points,
                d?.assignment?.out_of,
              ];
              let maxFound: number | null = null;
              for (const m of maxCandidates) {
                const n = coerceNum(m);
                if (n != null && n > 0) { maxFound = n; break; }
              }
              if (maxFound != null && (!task.maxGrade || task.maxGrade <= 0)) {
                setSelectedTask((prev) => (prev && prev.id === task.id ? { ...prev, maxGrade: maxFound as number } : prev));
              }
            }
          });
          if (gradeById.size > 0) {
            setSubmissions((prev) => prev.map((s) => (
              gradeById.has(s.id) ? { ...s, grade: gradeById.get(s.id)! } : s
            )));
          }
        }
      } catch (e) {
        console.warn("[tasks] grade enrichment skipped", e);
      }

      // Enrich missing maxGrade by fetching assignment detail if still undefined
      try {
        if (!task.maxGrade) {
          const res = await api.get(`/assignments/${task.id}`);
          const a: any = res.data;
          const coerce = (v: any): number | null => {
            if (v == null) return null;
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
          };
          const cands = [
            a?.max_grade,
            a?.max_points,
            a?.points_max,
            a?.total_points,
            a?.out_of,
          ];
          let mg: number | null = null;
          for (const v of cands) {
            const n = coerce(v);
            if (n != null && n > 0) { mg = n; break; }
          }
          if (mg != null) {
            setSelectedTask((prev) => (prev && prev.id === task.id ? { ...prev, maxGrade: mg as number } : prev));
          }
        }
      } catch (e) {
        console.warn('[tasks] maxGrade enrichment skipped', e);
      }
    } catch (e) {
      console.error("[tasks] load submissions failed", e);
      setSubmissions([]);
    } finally {
      setSubsLoading(false);
    }
  };

  const closeSubmissions = () => {
    setShowSubmissions(false);
    setSelectedTask(null);
    setSubmissions([]);
  };

  const downloadFirst = async (sub: UiSubmission) => {
    try {
      // If multiple files exist, download them all.
      const paths = (sub.filePaths || []).filter(Boolean) as string[];
      const names = sub.files || [];
      if (paths.length > 1) {
        for (let i = 0; i < paths.length; i++) {
          const p = paths[i];
          const name = names[i] || `submission-${sub.id}-${i+1}`;
          const abs = fileUrl(p);
          const resp = await fetch(abs, { credentials: 'include' });
          if (!resp.ok) continue;
          const blob = await resp.blob();
          const urlObj = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = urlObj;
          a.download = name;
          a.setAttribute('download', name);
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(urlObj);
          }, 100);
        }
        return;
      }

      // Fallback to API single-file download (or when only one file exists)
      const { downloadSubmissionFile } = await import("../../lib/api");
      const res = await downloadSubmissionFile(sub.id);
      if (!res.data) throw new Error('No file data received');
      const contentType = res.headers?.['content-type'] || res.headers?.['Content-Type'] || 'application/octet-stream';
      const blob = new Blob([res.data], { type: contentType });
      let filename = paths[0] ? (names[0] || `submission-${sub.id}`) : `submission-${sub.id}`;
      const contentDisposition = res.headers?.['content-disposition'] || res.headers?.['Content-Disposition'];
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) filename = filenameMatch[1].replace(/['"]/g, '');
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      a.setAttribute('download', filename);
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 100);
      console.log('Download initiated successfully with filename:', filename);
    } catch (err: any) {
      console.error('Download failed:', err);
      const errorMsg = err.response?.data?.detail || err.message || 'Unknown error';
      toast.error(`Failed to download submission: ${errorMsg}`);
    }
  };

    // Download all files as a ZIP via backend endpoint; fallback to individual downloads.
  const downloadAllZip = async (sub: UiSubmission) => {
    try {
      const count = (sub.filePaths || []).filter(Boolean).length;
      if (count <= 1) {
        await downloadFirst(sub);
        return;
      }

      toast.loading("Preparing ZIP...", { id: "zip-" + sub.id });
      const endpoints = [
        "/instructor/submissions/" + sub.id + "/zip",
        "/submissions/" + sub.id + "/zip",
      ];
      let success = false;
      for (const ep of endpoints) {
        try {
          const res = await api.get(ep, { responseType: 'blob' });
          const ct = String((res.headers as any)?.['content-type'] || (res.headers as any)?.['Content-Type'] || '').toLowerCase();
          console.debug('[ZIP] response', { url: ep, status: res.status, ct });
          if (res.status >= 200 && res.status < 300 && (ct.includes('zip') || ct.includes('octet-stream') || res.data)) {
            const blob = new Blob([res.data], { type: ct || 'application/zip' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = "submission-" + sub.id + ".zip";
            a.setAttribute("download", "submission-" + sub.id + ".zip");
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
              document.body.removeChild(a);
              window.URL.revokeObjectURL(url);
            }, 100);
            success = true;
            break;
          }
        } catch {
          continue;
        }
      }
      if (!success) {
        await downloadFirst(sub);
        toast.success('Downloaded files individually (ZIP not available)', { id: "zip-" + sub.id });
      } else {
        toast.success('ZIP downloaded', { id: "zip-" + sub.id });
      }
    } catch (e: any) {
      console.error('[tasks] downloadAllZip failed', e);
      toast.error(e?.message || 'Failed to download ZIP', { id: "zip-" + sub.id });
    }
  };
  const viewSubmission = (sub: UiSubmission) => {
    // Open the review/details modal instead of downloading files
    setReviewingSubmissionId(sub.id);
  };

  const handleReviewSaved = (updatedSubmission: any) => {
    setSubmissions(prev => 
      prev.map(s => 
        s.id === updatedSubmission.id 
          ? { ...s, status: updatedSubmission.status, grade: updatedSubmission.grade?.toString() || null }
          : s
      )
    );
  };

  const [gradeInputs, setGradeInputs] = useState<
    Record<number, { grade: string; feedback: string; showGrading?: boolean }>
  >({});
  const setGradeInput = (
    id: number,
    patch: Partial<{ grade: string; feedback: string; showGrading: boolean }>
  ) =>
    setGradeInputs((prev) => ({
      ...prev,
      [id]: {
        grade: prev[id]?.grade || "",
        feedback: prev[id]?.feedback || "",
        showGrading: prev[id]?.showGrading || false,
        ...patch,
      },
    }));

  return (
    <div className="min-h-screen bg-gray-200 p-6 text-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-gradient-to-r from-sky-500 to-sky-600 rounded-2xl flex items-center justify-center shadow-lg">
            <ClipboardList className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-gray-900" data-testid="text-page-title">
              Tasks Management
            </h1>
            <p className="text-gray-800">Create and manage student assignments</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap justify-end">
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by title, description, course..."
              className="w-72 max-w-[60vw] bg-gray-100/70 border border-gray-300 rounded-xl py-2 pl-3 pr-3 text-gray-900 placeholder-gray-500 focus:outline-none focus:border-sky-500 focus:bg-gray-200/70 transition-all"
            />
          </div>
          <select
            className="bg-gray-100/70 border border-gray-300 rounded-xl px-3 py-2 text-gray-900 focus:outline-none focus:border-sky-500 focus:bg-gray-200/70 transition-all"
            value={filterCourse}
            onChange={(e) => setFilterCourse(e.target.value)}
            title="Filter by course"
          >
            <option value="all">All Courses</option>
            {courses.map((c: any) => (
              <option key={c.id} value={String(c.id)}>{c.name || c.title || c.code}</option>
            ))}
          </select>
          <button
            onClick={() => setSortOrder((o) => (o === "asc" ? "desc" : "asc"))}
            className="px-3 py-3 bg-gray-100/70 border border-gray-300 text-gray-800 rounded-xl hover:bg-gray-200/70 transition-all"
            title="Toggle sort order"
          >
            {sortOrder === "asc" ? <SortAsc className="w-5 h-5" /> : <SortDesc className="w-5 h-5" />}
          </button>
          <button
            onClick={openCreate}
            className="px-6 py-3 bg-gradient-to-r from-sky-500 to-sky-600 text-white rounded-xl hover:from-sky-600 hover:to-sky-700 transition-all flex items-center gap-2 shadow-lg"
            data-testid="button-create-task"
          >
            <Plus className="w-5 h-5" />
            {editingId ? "Edit Task" : "Create New Task"}
          </button>
        </div>
      </div>

      {/* Errors / Loading */}
      {loadError && (
        <div className="mb-4 bg-red-100 border border-red-400 text-red-800 rounded-2xl p-4">
          {loadError}
        </div>
      )}
      {loading && <div className="text-gray-700 mb-4">Loading tasks…</div>}

      {/* Tasks List */}
      <div className="grid grid-cols-1 gap-6 mb-8">
        {sortedTasks.map((task) => {
          const total = Math.max(task.totalStudents, task.submissions);
          const progress = total ? Math.round((task.submissions / total) * 100) : 0;
          const daysLeft =
            task.deadline
              ? Math.ceil(
                  (new Date(task.deadline).getTime() - new Date().getTime()) /
                    (1000 * 60 * 60 * 24)
                )
              : null;

          return (
            <div
              key={task.id}
              className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-6 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:shadow-sky-500/20 transition-all duration-300 hover:-translate-y-1"
              data-testid={`card-task-${task.id}`}
            >
              <div className="flex-1">
                <h2 className="text-xl font-black text-gray-900 mb-2">{task.title}</h2>
                <p className="text-gray-700 text-sm mb-3 whitespace-pre-wrap">{task.description || "No description provided."}</p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-gray-800 text-sm">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4 text-gray-600" />
                    <span>Deadline: {task.deadline ? new Date(task.deadline).toLocaleDateString() : 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4 text-gray-600" />
                    <span>{task.totalStudents} Students</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <FileText className="w-4 h-4 text-gray-600" />
                    <span>{task.submissions} Submissions</span>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${statusBadge(task.status)}`}
                  >
                    {task.status}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 mt-4 md:mt-0">
                <button
                  onClick={() => openSubmissions(task)}
                  className="p-3 text-sky-600 hover:text-sky-700 transition-colors rounded-lg hover:bg-sky-100/50"
                  data-testid={`button-view-submissions-${task.id}`}
                  title="View Submissions"
                >
                  <Eye className="w-5 h-5" />
                </button>
                <button
                  onClick={() => openEdit(task)}
                  className="p-3 text-amber-600 hover:text-amber-700 transition-colors rounded-lg hover:bg-amber-100/50"
                  data-testid={`button-edit-task-${task.id}`}
                  title="Edit Task"
                >
                  <Edit className="w-5 h-5" />
                </button>
                <button
                  onClick={() => removeTask(task.id)}
                  className="p-3 text-red-600 hover:text-red-700 transition-colors rounded-lg hover:bg-red-100/50"
                  data-testid={`button-delete-task-${task.id}`}
                  title="Delete Task"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create / Edit Task Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50" data-testid="modal-create-task">
          <div className="bg-gray-100 rounded-3xl p-8 w-full max-w-2xl shadow-xl border border-gray-300 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-300">
              <h2 className="text-2xl font-black text-gray-900">{editingId ? "Edit Assignment" : "Create New Assignment"}</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 text-gray-800 hover:text-gray-900 transition-colors"
                data-testid="button-close-create-modal"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <label className="block text-gray-800 font-medium mb-2">Task Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Enter task title..."
                  className="w-full p-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:border-sky-500"
                  data-testid="input-task-title"
                />
              </div>

              <div>
                <label className="block text-gray-800 font-medium mb-2">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Enter task description..."
                  rows={4}
                  className="w-full p-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:border-sky-500 resize-none"
                  data-testid="textarea-task-description"
                ></textarea>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="course_id" className="block text-sm font-semibold text-gray-800 tracking-wide">
                    Course
                  </label>
                  <select
                    id="course_id"
                    name="course_id"
                    value={form.course_id}
                    onChange={handleFormChange}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900
                              focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500
                              transition-colors placeholder-gray-500"
                  >
                    <option value="">Select course…</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="max_grade" className="block text-sm font-semibold text-gray-800 tracking-wide">
                    Max Grade
                  </label>
                  <input
                    id="max_grade"
                    name="max_grade"
                    type="number"
                    value={form.max_grade}
                    onChange={handleFormChange}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-800 font-medium mb-2">Deadline</label>
                <input
                  type="datetime-local"
                  value={form.deadline}
                  onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
                  className="w-full p-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:border-sky-500"
                  data-testid="input-task-deadline"
                />
              </div>

              {saveError && (
                <div className="bg-red-100 border border-red-400 text-red-800 rounded-xl p-3">
                  {saveError}
                </div>
              )}

              <div className="flex gap-4 pt-4">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-3 bg-gray-200 text-gray-800 rounded-xl hover:bg-gray-300 transition-colors"
                  data-testid="button-cancel-create"
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  onClick={submitForm}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-sky-500 to-sky-600 text-white rounded-xl hover:from-sky-600 hover:to-sky-700 transition-all disabled:opacity-60"
                  data-testid="button-submit-create"
                  disabled={isSaving}
                >
                  {editingId ? (isSaving ? "Saving…" : "Save Changes") : (isSaving ? "Creating…" : "Create Task")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Submissions Modal */}
      {showSubmissions && selectedTask && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          data-testid="modal-submissions"
        >
          <div className="bg-gray-100 rounded-3xl p-8 w-full max-w-5xl shadow-xl border border-gray-300 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-300">
              <div>
                <h2 className="text-2xl font-black text-gray-900" data-testid="text-submissions-title">
                  {selectedTask.title}
                </h2>
                <p className="text-gray-800">Student Submissions</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <span className="px-2 py-1 rounded-full bg-gray-200 text-gray-800 border border-gray-300">
                    Required: <strong className="ml-1">{selectedTask.totalStudents ?? 0}</strong>
                  </span>
                  <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                    Submitted: <strong className="ml-1">{submissions.length}</strong>
                  </span>
                  <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                    Not Submitted: <strong className="ml-1">{Math.max(0, (selectedTask.totalStudents || 0) - submissions.length)}</strong>
                  </span>
                </div>
              </div>
              <button
                onClick={closeSubmissions}
                className="p-2 text-gray-800 hover:text-gray-900 transition-colors"
                data-testid="button-close-submissions-modal"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6">
              {subsLoading && <div className="text-gray-700">Loading submissions…</div>}
              {!subsLoading && submissions.length === 0 && (
                <div className="text-gray-700">No submissions yet.</div>
              )}

              <div className="space-y-4">
                {submissions.map((submission) => (
                  <div
                    key={submission.id}
                    className="bg-gray-50/70 rounded-2xl p-4 border border-gray-300"
                    data-testid={`submission-item-${submission.id}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-r from-sky-500 to-sky-600 rounded-full flex items-center justify-center text-white font-medium">
                          {submission.studentName
                            .split(" ")
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()}
                        </div>
                        <div>
                          <h4
                            className="text-gray-900 font-medium"
                            data-testid={`text-submission-student-${submission.id}`}
                          >
                            {submission.studentName}
                          </h4>
                          <p
                            className="text-gray-700 text-sm"
                            data-testid={`text-submission-time-${submission.id}`}
                          >
                            Submitted:{" "}
                            {submission.submittedAt
                              ? new Date(submission.submittedAt).toLocaleString()
                              : "-"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {(() => {
                          const sLower = String(submission.status || '').toLowerCase();
                          const isGraded = sLower === 'graded' || sLower === 'accepted';
                          const hasGrade = submission.grade != null && String(submission.grade).trim() !== '';
                          // Ensure display matches 0-100 if maxGrade is 100
                          const displayGrade = ((): string => {
                            if (!hasGrade) return '—';
                            const val = Number(submission.grade);
                            if (!Number.isFinite(val)) return String(submission.grade);
                            return String(val);
                          })();
                          const statusLabel = isGraded || hasGrade
                            ? `Grade: ${displayGrade}${selectedTask.maxGrade ? ` / ${selectedTask.maxGrade}` : ""}`
                            : submission.status;
                          return (
                            <span
                              className={`px-3 py-1 rounded-full text-sm ${submissionBadge(submission.status)}`}
                              data-testid={`text-submission-status-${submission.id}`}
                            >
                              {statusLabel}
                            </span>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 text-gray-700">
                          <Upload className="w-4 h-4" />
                          <span
                            className="text-sm"
                            data-testid={`text-submission-files-count-${submission.id}`}
                          >
                            {submission.files.length} file(s)
                          </span>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          {submission.files.map((file, index) => (
                            <button
                              key={index}
                              onClick={async () => {
                                const p = submission.filePaths[index];
                                if (p) {
                                  const abs = fileUrl(String(p));
                                  const resp = await fetch(abs, { credentials: 'include' });
                                  if (!resp.ok) return;
                                  const blob = await resp.blob();
                                  const urlObj = window.URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.style.display = 'none';
                                  a.href = urlObj;
                                  a.download = file;
                                  a.setAttribute('download', file);
                                  document.body.appendChild(a);
                                  a.click();
                                  setTimeout(() => {
                                    document.body.removeChild(a);
                                    window.URL.revokeObjectURL(urlObj);
                                  }, 100);
                                }
                              }}
                              className="px-2 py-1 bg-gray-200 text-gray-800 rounded text-xs hover:bg-gray-300 transition-colors"
                              data-testid={`text-submission-file-${submission.id}-${index}`}
                              title="Download this file"
                            >
                              {file}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => downloadFirst(submission)}
                          className="p-2 bg-sky-100 text-sky-800 rounded-lg hover:bg-sky-200 transition-colors"
                          data-testid={`button-download-submission-${submission.id}`}
                          title="Download"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        {submission.files.length > 1 && (
                          <button
                            onClick={() => downloadAllZip(submission)}
                            className="p-2 bg-sky-100 text-sky-800 rounded-lg hover:bg-sky-200 transition-colors"
                            title="Download All (ZIP)"
                          >
                            <span className="text-xs font-semibold">ZIP</span>
                          </button>
                        )}
                        {submission.status === "Not Submitted" && (
                          <button
                            onClick={() => setReviewingSubmissionId(submission.id)}
                            className="p-2 bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 transition-colors"
                            data-testid={`button-grade-submission-${submission.id}`}
                            title="Grade"
                          >
                            <Star className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => viewSubmission(submission)}
                          className="p-2 bg-emerald-100 text-emerald-800 rounded-lg hover:bg-emerald-200 transition-colors"
                          data-testid={`button-view-submission-${submission.id}`}
                          title="View"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
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



