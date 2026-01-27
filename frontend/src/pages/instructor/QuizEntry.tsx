import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { Download, Plus, Trash2, ArrowLeft, Users, BookOpen, Search } from "lucide-react";
import { getStudents, getCourses, createQuizEntry, listQuizEntries, getStudentEnrollments, deleteQuizEntry } from "../../lib/api";

// A lightweight, spreadsheet-like quiz entry page with CSV download
// No backend dependency for saving; data is exported client-side as CSV
// You can later wire a POST endpoint if needed.

interface StudentOption {
  id: number;
  name: string;
  number?: string;
}

interface CourseOption {
  id: number | string;
  name: string;
  code?: string;
}

interface QuizRow {
  id: string; // local unique id
  student_id: number | "";
  quiz_title: string;
  quiz_date: string; // yyyy-mm-dd
  course_id: number | string | "";
  max_grade: string; // keep as string for easy input; cast on export
  grade: string; // keep as string for easy input; cast on export
  notes: string;
  // Derived labels for dashboard display (optional)
  student_name?: string;
  student_number?: string;
  course_name?: string;
  course_code?: string;
}

const newRow = (): QuizRow => ({
  id: Math.random().toString(36).slice(2),
  student_id: "",
  quiz_title: "",
  quiz_date: new Date().toISOString().slice(0, 10),
  course_id: "",
  max_grade: "10",
  grade: "",
  notes: "",
});

export default function QuizEntry() {
  const navigate = useNavigate();

  const [students, setStudents] = useState<StudentOption[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [rows, setRows] = useState<QuizRow[]>([newRow()]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // CWCM modal state for adding a populated row
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<QuizRow>(() => newRow());
  // Cache of student_id -> set of course_id strings the student is enrolled in
  const [enrollmentsMap, setEnrollmentsMap] = useState<Record<number, Set<string>>>({});
  // Delete confirmations (CWCM)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  // Validation helpers
  const validateRow = (row: QuizRow) => {
    const errs: { date?: string; max?: string; grade?: string } = {};
    // date
    if (row.quiz_date) {
      try {
        const today = new Date();
        const d = new Date(String(row.quiz_date) + "T00:00:00");
        const td = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        if (d.getTime() > td.getTime()) errs.date = "Date cannot be in the future";
      } catch {}
    }
    // max
    const maxN = row.max_grade !== "" ? Number(row.max_grade) : undefined;
    if (maxN !== undefined && (Number.isNaN(maxN) || maxN < 0)) errs.max = "Max grade cannot be negative";
    // grade
    const gradeN = row.grade !== "" ? Number(row.grade) : undefined;
    if (gradeN !== undefined && (Number.isNaN(gradeN) || gradeN < 0)) errs.grade = "Grade cannot be negative";
    if (gradeN !== undefined && maxN !== undefined && gradeN > maxN) errs.grade = "Grade cannot exceed max";
    return errs;
  };

  const formErrors = useMemo(() => validateRow(form), [form]);

  // Restore table-only rows from localStorage on mount (before loading options)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("quizEntries.tableRows");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setRows(parsed);
      }
    } catch {}
  }, []);

  // Persist rows to localStorage whenever they change so refresh keeps the table
  useEffect(() => {
    try {
      localStorage.setItem("quizEntries.tableRows", JSON.stringify(rows));
    } catch {}
  }, [rows]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        const [studentsData, coursesData] = await Promise.all([
          getStudents(),
          getCourses(),
        ]);

        const sOpts: StudentOption[] = Array.isArray(studentsData)
          ? studentsData.map((s: any) => ({
              id: Number(s.student_id ?? s.id),
              name: String(s.full_name ?? s.name ?? "Student"),
              number: s.student_number ?? undefined,
            }))
          : [];
        setStudents(sOpts);

        const cOpts: CourseOption[] = Array.isArray(coursesData)
          ? coursesData.map((c: any) => ({
              id: c.id ?? c.course_id ?? c.code ?? c.name,
              name: String(c.name ?? c.title ?? c.course_title ?? "Course"),
              code: c.code ?? c.course_code ?? undefined,
            }))
          : [];
        setCourses(cOpts);

        // Load server quiz entries so refresh always reflects current DB state
        const LOAD_SERVER = true;
        if (LOAD_SERVER) {
          try {
            const { data } = await listQuizEntries();
            const studentById = new Map<number, StudentOption>(sOpts.map((s) => [s.id, s]));
            const courseById = new Map<string, CourseOption>(cOpts.map((c) => [String(c.id), c]));
            const mapped: QuizRow[] = Array.isArray(data)
              ? data.map((q: any) => {
                  const s = studentById.get(Number(q.student_id));
                  const c = q.course_id != null ? courseById.get(String(q.course_id)) : undefined;
                  return {
                    id: String(q.id),
                    student_id: Number(q.student_id),
                    quiz_title: String(q.title || "Quiz"),
                    quiz_date: q.quiz_date ? String(q.quiz_date).slice(0, 10) : new Date().toISOString().slice(0, 10),
                    course_id: q.course_id != null ? String(q.course_id) : "",
                    max_grade: q.max_grade != null ? String(q.max_grade) : "10",
                    grade: q.grade != null ? String(q.grade) : "",
                    notes: q.notes || "",
                    student_name: s?.name,
                    student_number: s?.number,
                    course_name: c?.name,
                    course_code: c?.code,
                  } as QuizRow;
                })
              : [];
            setRows(mapped);
            // Preload enrollments for all students present so course dropdown has options after refresh
            try {
              const uniqueStudentIds = Array.from(
                new Set(mapped.map((r) => Number(r.student_id)).filter((n) => Number.isFinite(n)))
              );
              await Promise.allSettled(uniqueStudentIds.map((sid) => ensureEnrollments(sid)));
            } catch {}
          } catch (e) {
            console.warn("[QuizEntry] listQuizEntries failed", e);
          }
        }
      } catch (e: any) {
        console.error("[QuizEntry] Failed to load options", e);
        toast.error(e?.response?.data?.detail || e?.message || "Failed to load data");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // No localStorage persistence; we save to backend immediately on add.

  const updateCell = (rowId: string, patch: Partial<QuizRow>) => {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));
  };

  const removeRow = (rowId: string) => setRows((prev) => prev.filter((r) => r.id !== rowId));
  const clearAll = () => setRows([newRow()]);

  const openAddModal = () => {
    setForm({ ...newRow(), max_grade: "10" });
    setAddOpen(true);
  };

  // Ensure enrollments are fetched for a student and cached
  const ensureEnrollments = async (studentId: number) => {
    if (!Number.isFinite(studentId)) return new Set<string>();
    if (enrollmentsMap[studentId]) return enrollmentsMap[studentId];
    try {
      const list = await getStudentEnrollments(studentId);
      const ids = Array.isArray(list)
        ? new Set<string>(
            list
              .filter((e: any) => (e.status === "Active" || e.status === "Enrolled") && (e.course_id != null))
              .map((e: any) => String(e.course_id))
          )
        : new Set<string>();
      setEnrollmentsMap((prev) => ({ ...prev, [studentId]: ids }));
      return ids;
    } catch (e) {
      return new Set<string>();
    }
  };

  const submitAdd = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    // simple validation
    if (form.student_id === "" || String(form.quiz_title).trim() === "") {
      toast.error("Student and Quiz Title are required");
      return;
    }
    // Validation: no future date
    if (form.quiz_date) {
      try {
        const today = new Date();
        const d = new Date(form.quiz_date + "T00:00:00");
        const td = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        if (d.getTime() > td.getTime()) {
          toast.error("Date cannot be in the future");
          return;
        }
      } catch {}
    }
    // Validation: numeric constraints
    const maxN = form.max_grade !== "" ? Number(form.max_grade) : undefined;
    const gradeN = form.grade !== "" ? Number(form.grade) : undefined;
    if (maxN !== undefined && (Number.isNaN(maxN) || maxN < 0)) {
      toast.error("Max grade cannot be negative");
      return;
    }
    if (gradeN !== undefined && (Number.isNaN(gradeN) || gradeN < 0)) {
      toast.error("Grade cannot be negative");
      return;
    }
    if (gradeN !== undefined && maxN !== undefined && gradeN > maxN) {
      toast.error("Grade cannot exceed max grade");
      return;
    }
    (async () => {
      setSaving(true);
      try {
        const payload = {
          student_id: Number(form.student_id),
          title: String(form.quiz_title).trim(),
          quiz_date: form.quiz_date ? new Date(form.quiz_date).toISOString() : undefined,
          course_id:
            form.course_id !== "" && !Number.isNaN(Number(form.course_id))
              ? Number(form.course_id)
              : undefined,
          max_grade:
            form.max_grade !== "" && !Number.isNaN(Number(form.max_grade))
              ? Number(form.max_grade)
              : undefined,
          grade:
            form.grade !== "" && !Number.isNaN(Number(form.grade))
              ? Number(form.grade)
              : undefined,
          notes: form.notes || undefined,
        } as any;
        const { data: saved } = await createQuizEntry(payload);
        // Enrich with labels for table display
        const s = students.find((x) => x.id === Number(saved.student_id));
        const c = saved.course_id != null ? courses.find((x) => String(x.id) === String(saved.course_id)) : undefined;
        const row: QuizRow = {
          id: String(saved.id),
          student_id: Number(saved.student_id),
          quiz_title: String(saved.title || form.quiz_title),
          quiz_date: saved.quiz_date ? String(saved.quiz_date).slice(0, 10) : form.quiz_date,
          course_id: saved.course_id != null ? String(saved.course_id) : "",
          max_grade: saved.max_grade != null ? String(saved.max_grade) : form.max_grade,
          grade: saved.grade != null ? String(saved.grade) : form.grade,
          notes: saved.notes || form.notes,
          student_name: s?.name,
          student_number: s?.number,
          course_name: c?.name,
          course_code: c?.code,
        };
        setRows((prev) => [...prev, row]);
        setAddOpen(false);
        toast.success("Saved to database");
      } catch (err: any) {
        toast.error(err?.response?.data?.detail || err?.message || "Failed to save");
      } finally {
        setSaving(false);
      }
    })();
  };

  // Filter rows by student name/number, quiz title, course name/code, notes, or date
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    const studentById = new Map<number, StudentOption>(students.map((s) => [s.id, s]));
    const courseById = new Map<string, CourseOption>(courses.map((c) => [String(c.id), c]));
    return rows.filter((r) => {
      const s = r.student_id === "" ? undefined : studentById.get(Number(r.student_id));
      const c = r.course_id === "" ? undefined : courseById.get(String(r.course_id));
      const hay = [
        s?.name ?? "",
        s?.number ?? "",
        r.quiz_title ?? "",
        r.notes ?? "",
        r.quiz_date ?? "",
        c?.name ?? "",
        c?.code ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, students, courses]);

  // Allowed course ids for current modal student
  const allowedCourseIdsForForm = useMemo(() => {
    const sid = Number(form.student_id);
    if (!Number.isFinite(sid)) return null;
    return enrollmentsMap[sid] || null;
  }, [form.student_id, enrollmentsMap]);

  const validFilteredRows = useMemo(
    () => filteredRows.filter((r) => r.student_id !== "" && r.quiz_title.trim() !== ""),
    [filteredRows]
  );

  const buildCsv = (): string => {
    // CSV header
    const header = [
      "student_id",
      "student_name",
      "student_number",
      "quiz_title",
      "quiz_date",
      "course_id",
      "course_code",
      "course_name",
      "max_grade",
      "grade",
      "notes",
    ];

    const studentById = new Map<number, StudentOption>(students.map((s) => [s.id, s]));
    // Normalize course map to string keys to avoid number/string mismatches
    const courseById = new Map<string, CourseOption>(
      courses.map((c) => [String(c.id), c])
    );

    const bodyLines = validFilteredRows.map((r) => {
      const s = r.student_id === "" ? undefined : studentById.get(Number(r.student_id));
      const c = r.course_id === "" ? undefined : courseById.get(String(r.course_id));
      const cells = [
        r.student_id !== "" ? String(r.student_id) : "",
        s?.name ?? "",
        s?.number ?? "",
        r.quiz_title.replace(/\r?\n/g, " ").trim(),
        r.quiz_date,
        r.course_id !== "" ? String(r.course_id) : "",
        c?.code ?? "",
        c?.name ?? "",
        r.max_grade,
        r.grade,
        (r.notes || "").replace(/\r?\n/g, " ").trim(),
      ];
      // Escape CSV cells
      return cells
        .map((v) => {
          const s = String(v ?? "");
          if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
          return s;
        })
        .join(",");
    });

    return [header.join(","), ...bodyLines].join("\n");
  };

  const downloadCsv = () => {
    if (validFilteredRows.length === 0) {
      toast.error("Add at least one row with student and quiz title");
      return;
    }
    const csv = buildCsv();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `quiz-entries-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      document.body.removeChild(a);
    }, 200);
    toast.success("CSV downloaded");
  };

  return (
    <div className="min-h-screen bg-gray-200 text-gray-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="p-2 text-gray-800 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-300/70"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-3xl font-black text-gray-900">Quiz Entry</h1>
              <p className="text-gray-800">Enter quiz rows like Excel, then download as CSV</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-600 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by student, course, title, notes, date..."
                className="w-80 bg-white border border-gray-300 rounded-xl pl-9 pr-3 py-2 text-gray-900"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button
              onClick={openAddModal}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all shadow-lg"
            >
              <Plus className="w-4 h-4" /> Add Row
            </button>
            <button
              onClick={() => setConfirmClearOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100/70 border border-gray-300 text-gray-800 rounded-xl hover:bg-gray-200/70 transition-all"
            >
              <Trash2 className="w-4 h-4" /> Clear All
            </button>
            <button
              onClick={downloadCsv}
              className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-xl hover:bg-sky-700 transition-all shadow-lg"
            >
              <Download className="w-4 h-4" /> Download CSV
            </button>
          </div>
        </div>

        {/* Info banner */}
        <div className="mb-6 bg-gray-100/70 rounded-2xl border border-gray-300 p-4 flex items-center gap-3">
          <Users className="w-5 h-5 text-gray-700" />
          <p className="text-gray-800 text-sm">
            Select a student, fill quiz info and grade. Use the plus button to add multiple rows. No server save; use Download CSV to export.
          </p>
        </div>

        {/* CWCM Add Row Modal */}
        {addOpen && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-6 w-full max-w-md max-h-[80vh] overflow-auto">
              <h3 className="text-2xl font-extrabold text-gray-900 mb-4">Add Quiz Row</h3>
              <form onSubmit={submitAdd} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-1">Student</label>
                  <select
                    className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-gray-900"
                    value={form.student_id}
                    onChange={async (e) => {
                      const val = e.target.value === "" ? "" : Number(e.target.value);
                      setForm((prev) => ({ ...prev, student_id: val }));
                      if (val !== "") {
                        const allowed = await ensureEnrollments(Number(val));
                        // if current course not allowed, clear it
                        if (form.course_id !== "" && !allowed.has(String(form.course_id))) {
                          setForm((prev) => ({ ...prev, course_id: "" }));
                        }
                      }
                    }}
                    required
                  >
                    <option value="">Select student...</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}{s.number ? ` • ${s.number}` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-1">Quiz Title</label>
                  <input
                    type="text"
                    className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-gray-900"
                    placeholder="Quiz title"
                    value={form.quiz_title}
                    onChange={(e) => setForm((prev) => ({ ...prev, quiz_title: e.target.value }))}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-gray-800 mb-1">Date</label>
                    <input
                      type="date"
                      className={`w-full bg-white border rounded-xl px-3 py-2 text-gray-900 ${formErrors.date ? 'border-red-500' : 'border-gray-300'}`}
                      value={form.quiz_date}
                      onChange={(e) => setForm((prev) => ({ ...prev, quiz_date: e.target.value }))}
                    />
                    {formErrors.date && (
                      <div className="mt-1 text-xs text-red-600">{formErrors.date}</div>
                    )}

                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-800 mb-1">Course</label>
                    <select
                      className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-gray-900"
                      value={form.course_id}
                      onChange={(e) => setForm((prev) => ({ ...prev, course_id: e.target.value }))}
                    >
                      <option value="">No course</option>
                      {(allowedCourseIdsForForm ? courses.filter((c) => allowedCourseIdsForForm.has(String(c.id))) : courses).map((c) => (
                        <option key={String(c.id)} value={String(c.id)}>
                          {c.code ? `${c.code} • ` : ""}{c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-gray-800 mb-1">Max Grade</label>
                    <input
                      type="number"
                      min="0"
                      className={`w-full bg-white border rounded-xl px-3 py-2 text-gray-900 ${formErrors.max ? 'border-red-500' : 'border-gray-300'}`}
                      value={form.max_grade}
                      onChange={(e) => setForm((prev) => ({ ...prev, max_grade: e.target.value }))}
                    />
                    {formErrors.max && (
                      <div className="mt-1 text-xs text-red-600">{formErrors.max}</div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-800 mb-1">Grade</label>
                    <input
                      type="number"
                      min="0"
                      className={`w-full bg-white border rounded-xl px-3 py-2 text-gray-900 ${formErrors.grade ? 'border-red-500' : 'border-gray-300'}`}
                      value={form.grade}
                      onChange={(e) => setForm((prev) => ({ ...prev, grade: e.target.value }))}
                    />
                    {formErrors.grade && (
                      <div className="mt-1 text-xs text-red-600">{formErrors.grade}</div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-1">Notes</label>
                  <input
                    type="text"
                    className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-gray-900"
                    placeholder="Optional notes"
                    value={form.notes}
                    onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  />
                </div>

                <div className="mt-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setAddOpen(false)}
                    className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-800 bg-white hover:bg-gray-50 transition-colors text-sm"
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-60 text-sm"
                    disabled={saving}
                  >
                    {saving ? "Adding..." : "Add Row"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-gray-100/70 rounded-3xl border border-gray-300 overflow-x-auto shadow-xl">
          <table className="min-w-full divide-y divide-gray-300">
            <thead className="bg-gray-200/70">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-black text-gray-800 uppercase tracking-wider">Student</th>
                <th className="px-4 py-3 text-left text-xs font-black text-gray-800 uppercase tracking-wider">Quiz Title</th>
                <th className="px-4 py-3 text-left text-xs font-black text-gray-800 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-left text-xs font-black text-gray-800 uppercase tracking-wider">Course</th>
                <th className="px-4 py-3 text-left text-xs font-black text-gray-800 uppercase tracking-wider">Max</th>
                <th className="px-4 py-3 text-left text-xs font-black text-gray-800 uppercase tracking-wider">Grade</th>
                <th className="px-4 py-3 text-left text-xs font-black text-gray-800 uppercase tracking-wider">Notes</th>
                <th className="px-4 py-3 text-left text-xs font-black text-gray-800 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-gray-700">Loading options...</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-gray-700">No rows. Click Add Row.</td>
                </tr>
              ) : (
                filteredRows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-100/50">
                    <td className="px-4 py-2 align-top">
                      <select
                        className="w-64 bg-white border border-gray-300 rounded-xl px-3 py-2 text-gray-900"
                        value={r.student_id}
                        onChange={async (e) => {
                          const val = e.target.value === "" ? "" : Number(e.target.value);
                          updateCell(r.id, { student_id: val });
                          if (val !== "") {
                            const allowed = await ensureEnrollments(Number(val));
                            // If current course is not allowed, clear it for this row
                            const currentCourse = rows.find((x) => x.id === r.id)?.course_id;
                            if (currentCourse !== undefined && currentCourse !== "" && !allowed.has(String(currentCourse))) {
                              updateCell(r.id, { course_id: "" });
                            }
                          }
                        }}
                      >
                        <option value="">Select student...</option>
                        {students.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                            {s.number ? ` • ${s.number}` : ""}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2 align-top">
                      <input
                        type="text"
                        className="w-64 bg-white border border-gray-300 rounded-xl px-3 py-2 text-gray-900"
                        placeholder="Quiz title"
                        value={r.quiz_title}
                        onChange={(e) => updateCell(r.id, { quiz_title: e.target.value })}
                      />
                    </td>
                    <td className="px-4 py-2 align-top">
                      <input
                        type="date"
                        className="bg-white border border-gray-300 rounded-xl px-3 py-2 text-gray-900"
                        value={r.quiz_date}
                        onChange={(e) => updateCell(r.id, { quiz_date: e.target.value })}
                      />
                    </td>
                    <td className="px-4 py-2 align-top">
                      <select
                        className="w-56 bg-white border border-gray-300 rounded-xl px-3 py-2 text-gray-900"
                        value={r.course_id}
                        onChange={(e) => updateCell(r.id, { course_id: e.target.value })}
                      >
                        <option value="">No course</option>
                        {(() => {
                          const sid = Number(r.student_id);
                          const allowed = Number.isFinite(sid) ? enrollmentsMap[sid] : undefined;
                          // Until enrollments are fetched (allowed === undefined), show all courses so the selected course remains visible
                          const list = allowed === undefined
                            ? courses
                            : (allowed ? courses.filter((c) => allowed.has(String(c.id))) : []);
                          return list.map((c) => (
                            <option key={String(c.id)} value={String(c.id)}>
                              {c.code ? `${c.code} • ` : ""}{c.name}
                            </option>
                          ));
                        })()}
                      </select>
                    </td>
                    <td className="px-4 py-2 align-top">
                      <input
                        type="number"
                        min="0"
                        className="w-24 bg-white border border-gray-300 rounded-xl px-3 py-2 text-gray-900"
                        value={r.max_grade}
                        onChange={(e) => {
                          const val = e.target.value;
                          // clamp to >= 0
                          const n = Number(val);
                          const clamped = Number.isNaN(n) ? "" : (n < 0 ? "0" : String(n));
                          updateCell(r.id, { max_grade: clamped });
                        }}
                      />
                    </td>
                    <td className="px-4 py-2 align-top">
                      <input
                        type="number"
                        min="0"
                        className="w-24 bg-white border border-gray-300 rounded-xl px-3 py-2 text-gray-900"
                        value={r.grade}
                        onChange={(e) => {
                          const val = e.target.value;
                          let n = Number(val);
                          if (Number.isNaN(n)) {
                            updateCell(r.id, { grade: "" });
                            return;
                          }
                          if (n < 0) n = 0;
                          // Clamp grade to max if max is numeric
                          const maxN = Number(rows.find((x) => x.id === r.id)?.max_grade);
                          if (!Number.isNaN(maxN)) {
                            if (n > maxN) n = maxN;
                          }
                          updateCell(r.id, { grade: String(n) });
                        }}
                      />
                    </td>
                    <td className="px-4 py-2 align-top">
                      <input
                        type="text"
                        className="w-72 bg-white border border-gray-300 rounded-xl px-3 py-2 text-gray-900"
                        placeholder="Notes"
                        value={r.notes}
                        onChange={(e) => updateCell(r.id, { notes: e.target.value })}
                      />
                    </td>
                    <td className="px-4 py-2 align-top">
                      <button
                        onClick={() => setConfirmDeleteId(r.id)}
                        className="px-3 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors"
                        title="Remove row"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* CWCM: Confirm Clear All */}
        {confirmClearOpen && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-6 w-full max-w-sm">
              <h3 className="text-xl font-extrabold text-gray-900 mb-2">Clear all rows?</h3>
              <p className="text-gray-700 mb-4">This will remove all rows from the table. This does not delete from the database; only unsaved draft rows are removed.</p>
              <div className="mt-2 flex items-center justify-end gap-3">
                <button onClick={() => setConfirmClearOpen(false)} className="px-4 py-2 rounded-xl border border-gray-300 text-gray-800 bg-white hover:bg-gray-50 text-sm">Cancel</button>
                <button
                  onClick={async () => {
                    try {
                      // Delete saved rows from backend first
                      const ids = rows
                        .map((r) => r.id)
                        .filter((id) => /^\d+$/.test(String(id)))
                        .map((id) => Number(id));
                      if (ids.length > 0) {
                        await Promise.allSettled(ids.map((id) => deleteQuizEntry(id)));
                      }
                    } catch {}
                    // Clear table and local storage
                    clearAll();
                    try { localStorage.removeItem("quizEntries.tableRows"); } catch {}
                    setConfirmClearOpen(false);
                    toast.success("All rows cleared");
                    // Optionally reload from server to reflect final state
                    try {
                      const { data } = await listQuizEntries();
                      const studentById = new Map<number, StudentOption>(students.map((s) => [s.id, s]));
                      const courseById = new Map<string, CourseOption>(courses.map((c) => [String(c.id), c]));
                      const mapped: QuizRow[] = Array.isArray(data)
                        ? data.map((q: any) => {
                            const s = studentById.get(Number(q.student_id));
                            const c = q.course_id != null ? courseById.get(String(q.course_id)) : undefined;
                            return {
                              id: String(q.id),
                              student_id: Number(q.student_id),
                              quiz_title: String(q.title || "Quiz"),
                              quiz_date: q.quiz_date ? String(q.quiz_date).slice(0, 10) : new Date().toISOString().slice(0, 10),
                              course_id: q.course_id != null ? String(q.course_id) : "",
                              max_grade: q.max_grade != null ? String(q.max_grade) : "10",
                              grade: q.grade != null ? String(q.grade) : "",
                              notes: q.notes || "",
                              student_name: s?.name,
                              student_number: s?.number,
                              course_name: c?.name,
                              course_code: c?.code,
                            } as QuizRow;
                          })
                        : [];
                      setRows(mapped);
                    } catch {}
                  }}
                  className="px-4 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700 text-sm"
                >
                  Yes, Clear All
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CWCM: Confirm Delete Single Row */}
        {confirmDeleteId && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-6 w-full max-w-sm">
              <h3 className="text-xl font-extrabold text-gray-900 mb-2">Delete this row?</h3>
              <p className="text-gray-700 mb-4">This will remove the selected row from the table. It does not delete from the database.</p>
              <div className="mt-2 flex items-center justify-end gap-3">
                <button onClick={() => setConfirmDeleteId(null)} className="px-4 py-2 rounded-xl border border-gray-300 text-gray-800 bg-white hover:bg-gray-50 text-sm">Cancel</button>
                <button
                  onClick={async () => {
                    try {
                      if (confirmDeleteId) {
                        const row = rows.find((x) => x.id === confirmDeleteId);
                        if (row && /^\d+$/.test(String(row.id))) {
                          await deleteQuizEntry(Number(row.id));
                        }
                        removeRow(confirmDeleteId);
                      }
                      toast.success("Deleted");
                      // Reload from server to ensure state matches DB
                      try {
                        const { data } = await listQuizEntries();
                        const studentById = new Map<number, StudentOption>(students.map((s) => [s.id, s]));
                        const courseById = new Map<string, CourseOption>(courses.map((c) => [String(c.id), c]));
                        const mapped: QuizRow[] = Array.isArray(data)
                          ? data.map((q: any) => {
                              const s = studentById.get(Number(q.student_id));
                              const c = q.course_id != null ? courseById.get(String(q.course_id)) : undefined;
                              return {
                                id: String(q.id),
                                student_id: Number(q.student_id),
                                quiz_title: String(q.title || "Quiz"),
                                quiz_date: q.quiz_date ? String(q.quiz_date).slice(0, 10) : new Date().toISOString().slice(0, 10),
                                course_id: q.course_id != null ? String(q.course_id) : "",
                                max_grade: q.max_grade != null ? String(q.max_grade) : "10",
                                grade: q.grade != null ? String(q.grade) : "",
                                notes: q.notes || "",
                                student_name: s?.name,
                                student_number: s?.number,
                                course_name: c?.name,
                                course_code: c?.code,
                              } as QuizRow;
                            })
                          : [];
                        setRows(mapped);
                      } catch {}
                    } catch (e: any) {
                      toast.error(e?.response?.data?.detail || e?.message || "Failed to delete");
                    } finally {
                      setConfirmDeleteId(null);
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700 text-sm"
                >
                  Yes, Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="mt-6 flex items-center gap-2 text-gray-800">
          <BookOpen className="w-4 h-4" />
          <span className="text-sm">
            Required: Student, Quiz Title. Optional: Course, Notes. Max/Grade accept numbers.
          </span>
        </div>
      </div>
    </div>
  );
}
