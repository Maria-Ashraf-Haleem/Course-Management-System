import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-hot-toast";
import {
  ArrowLeft,
  UserPlus,
  Search,
  Filter,
  Eye,
  Edit,
  Trash2,
  RefreshCw,
  Users,
  Mail,
  Phone,
  X,
  Upload,
  MessageSquare,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getStudents, deleteStudent, getCourses, createAnnouncement, getStudentEnrollments, deleteAllStudents } from "../../lib/api";
import { api } from "../../lib/api";

export default function StudentsList() {
  const navigate = useNavigate();
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCourse, setFilterCourse] = useState("all");
  const [courses, setCourses] = useState<any[]>([]);
  const [studentCoursesMap, setStudentCoursesMap] = useState<Record<number, any[]>>({});
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: number;
    errors: any[];
  } | null>(null);

  const [confirmDeleteAllOpen, setConfirmDeleteAllOpen] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const [targetStudent, setTargetStudent] = useState<any | null>(null);
  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [msgPriority, setMsgPriority] = useState("normal");
  const [sendingMsg, setSendingMsg] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);

  const loadStudents = async () => {
    setLoading(true);
    try {
      const [studentsData, coursesData] = await Promise.all([
        getStudents(),
        getCourses(),
      ]);
      console.log("[StudentsList] Fetched students data:", studentsData);
      console.log("[StudentsList] Fetched courses data:", coursesData);
      setStudents(studentsData || []);
      setCourses(coursesData || []);
      try {
        const list = Array.isArray(studentsData) ? studentsData : [];
        const ids: number[] = list
          .map((s: any) => Number(s?.student_id))
          .filter((n: any) => Number.isFinite(n));
        const missing = ids.filter((id) => studentCoursesMap[id] == null);
        if (missing.length > 0) {
          const batchSize = 10;
          const newMap: Record<number, any[]> = {};
          for (let i = 0; i < missing.length; i += batchSize) {
            const slice = missing.slice(i, i + batchSize);
            const results = await Promise.all(
              slice.map(async (id) => {
                try {
                  const enrolls = await getStudentEnrollments(id);
                  return { id, courses: Array.isArray(enrolls) ? enrolls : [] };
                } catch (e) {
                  console.warn("Failed to load enrollments for student", id, e);
                  return { id, courses: [] };
                }
              })
            );
            results.forEach(({ id, courses }) => {
              newMap[id] = courses;
            });
            setStudentCoursesMap((prev) => ({ ...prev, ...newMap }));
          }
        }
      } catch (e) {
        console.warn("[StudentsList] Failed to load student enrollments map", e);
      }
    } catch (error: any) {
      console.error("Error loading students:", error);
      if (error.response?.status === 401) {
        localStorage.removeItem("token");
        navigate("/signin");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAllStudents = () => {
    setConfirmDeleteAllOpen(true);
  };

  const confirmBulkDelete = async () => {
    try {
      setDeletingAll(true);
      const loadingId = toast.loading("Deleting all students...");
      const res = await deleteAllStudents({ scope: 'mine' });
      toast.success(
        `Deleted ${res?.deleted_students ?? 0} students` +
          (res?.deleted_enrollments != null ? `, ${res.deleted_enrollments} enrollments` : "") +
          (res?.deleted_submissions != null ? `, ${res.deleted_submissions} submissions` : ""),
        { id: loadingId }
      );
      setConfirmDeleteAllOpen(false);
      await loadStudents();
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.message || "Failed to delete all students";
      toast.error(msg);
    } finally {
      setDeletingAll(false);
    }
  };

  useEffect(() => {
    loadStudents();
  }, []);

  const filteredStudents = students.filter((student) => {
    const matchesSearch =
      student.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.student_number
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      student.email?.toLowerCase().includes(searchTerm.toLowerCase());
    let matchesCourse = filterCourse === "all";
    if (!matchesCourse) {
      const list = studentCoursesMap[Number(student.student_id)] || [];
      matchesCourse = list.some(
        (enr: any) => String(enr.course_id) === String(filterCourse) && (enr.status === "Active" || enr.status === "Enrolled")
      );
      if (!matchesCourse) {
        matchesCourse =
          student.course_id?.toString() === filterCourse ||
          student.course_name === filterCourse;
      }
    }
    return matchesSearch && matchesCourse;
  });

  const handleViewStudent = (student: any) => {
    const fullName = `${student.full_name} ${student.student_number}`;
    navigate(
      `/instructor/student?id=${student.student_id}&name=${encodeURIComponent(
        fullName
      )}`
    );
  };

  const handleEditStudent = (student: any) => {
    navigate(`/instructor/students/edit/${student.student_id}`);
  };

  const handleOpenMessage = (student: any) => {
    setTargetStudent(student);
    setMsgTitle("");
    setMsgBody("");
    setMsgPriority("normal");
    setSendSuccess(false);
    setMessageModalOpen(true);
    toast("Compose a message to " + (student.full_name || "student"));
  };

  const handleSendMessage = async () => {
    if (!targetStudent) return;
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
        target_audience: `student:${targetStudent.student_id}`,
        priority: msgPriority,
      });
      toast.success("Message sent successfully", { id: loadingId });
      setSendSuccess(true);
      setTimeout(() => {
        setMessageModalOpen(false);
        setTargetStudent(null);
        setSendSuccess(false);
      }, 1200);
    } catch (e: any) {
      const msg =
        e?.response?.data?.detail ||
        e?.response?.data?.message ||
        e?.message ||
        "Failed to send message.";
      toast.error(msg, { id: undefined });
    } finally {
      setSendingMsg(false);
    }
  };

  const handleDeleteStudent = async (
    studentId: number,
    studentName: string
  ) => {
    if (
      window.confirm(
        `Are you sure you want to delete ${studentName}? This action cannot be undone.`
      )
    ) {
      try {
        console.log("Attempting to delete student ID:", studentId);
        await deleteStudent(studentId);
        alert("Student deleted successfully!");
        loadStudents();
      } catch (error: any) {
        console.error("Error deleting student:", error);
        console.error("Student ID that failed:", studentId);
        console.error("Error response:", error.response);

        if (error.response?.status === 401) {
          alert("Unauthorized - please login again");
          localStorage.removeItem("token");
          navigate("/signin");
        } else if (error.response?.status === 404) {
          alert(
            `Student not found. The student may have already been deleted. Refreshing the list...`
          );
          loadStudents();
        } else {
          const errorMsg =
            error.response?.data?.detail || error.message || "Unknown error";
          alert(`Failed to delete student: ${errorMsg}`);
        }
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleImportSubmit = async () => {
    if (!selectedFile) return;

    setImporting(true);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await api.post(
        "/student-management/students/bulk-import",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      setImportResult({
        success: response.data.imported || 0,
        errors: response.data.errors || [],
      });

      if (response.data.imported > 0) {
        await loadStudents();
      }
    } catch (error: any) {
      console.error("Error importing students:", error);
      let errorMessage = "An error occurred during import. Please try again.";

      if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }

      setImportResult({
        success: 0,
        errors: [{ message: errorMessage }],
      });
    } finally {
      setImporting(false);
    }
  };

  const resetImport = () => {
    setSelectedFile(null);
    setImportResult(null);
  };

  return (
    <div className="min-h-screen bg-gray-200 text-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/instructor/dashboard")}
              className="p-2 text-gray-800 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-300/70"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-3xl font-black text-gray-900">
                Students Management
              </h1>
              <p className="text-gray-800">Manage and view all students</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/instructor/students/new")}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-sky-500 to-sky-600 text-white rounded-xl hover:from-sky-600 hover:to-sky-700 transition-all duration-300 shadow-lg"
            >
              <UserPlus className="w-5 h-5" />
              Add Student
            </button>

            <button
              onClick={() => navigate("/instructor/quiz-entry")}
              className="flex items-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all duration-300 shadow-lg"
              title="Quickly enter quiz rows and export CSV"
            >
              Quiz Entry
            </button>

            <button
              onClick={() => setImportModalOpen(true)}
              className="flex items-center gap-2 px-4 py-3 bg-gray-100/70 border border-gray-300 text-gray-800 rounded-xl hover:bg-gray-200/70 transition-all"
            >
              <Upload className="w-4 h-4 text-gray-800" />
              Bulk Import
            </button>

            <button
              onClick={handleDeleteAllStudents}
              className="flex items-center gap-2 px-4 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all duration-300 shadow-lg"
              title="Delete all students (in your courses)"
            >
              <Trash2 className="w-4 h-4" />
              Delete All
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-r from-sky-500 to-sky-600 rounded-xl flex items-center justify-center shadow-lg">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-2xl font-black text-gray-900">
                {students.length}
              </h3>
              <p className="text-gray-800 text-sm">Total Students</p>
            </div>
          </div>
          <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-r from-sky-500 to-sky-600 rounded-xl flex items-center justify-center shadow-lg">
              <Filter className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-2xl font-black text-gray-900">
                {filteredStudents.length}
              </h3>
              <p className="text-gray-800 text-sm">Filtered</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-6 mb-8 flex flex-col sm:flex-row items-center gap-4">
          <div className="flex-1 relative w-full">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 w-5 h-5" />
            <input
              type="text"
              placeholder="Search students by name, number, or email..."
              className="w-full bg-gray-100/70 border border-gray-300 rounded-2xl py-2 pl-10 pr-4 text-gray-900 placeholder-gray-500 focus:outline-none focus:border-sky-500 focus:bg-gray-200/70 transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            className="bg-gray-100/70 border border-gray-300 rounded-2xl px-4 py-2 text-gray-900 focus:outline-none focus:border-sky-500 focus:bg-gray-200/70 transition-all backdrop-blur-xl w-full sm:w-auto"
            value={filterCourse}
            onChange={(e) => setFilterCourse(e.target.value)}
          >
            <option value="all">All Courses</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>
          <button
            onClick={loadStudents}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100/70 border border-gray-300 text-gray-800 rounded-2xl hover:bg-gray-200/70 transition-all w-full sm:w-auto justify-center"
          >
            <RefreshCw className="w-5 h-5" />
            Refresh
          </button>
        </div>

        <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-300">
              <thead className="bg-gray-200/70">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-black text-gray-800 uppercase tracking-wider">
                    Student Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-black text-gray-800 uppercase tracking-wider">
                    Student Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-black text-gray-800 uppercase tracking-wider">
                    Course
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-black text-gray-800 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-black text-gray-800 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-gray-700">
                      Loading students...
                    </td>
                  </tr>
                ) : filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-gray-700">
                      No students found.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((student) => (
                    <tr
                      key={student.student_id}
                      className="hover:bg-gray-100/50 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-sky-500 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                            {student.full_name
                              .split(" ")
                              .map((n: string) => n[0])
                              .join("")
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {student.full_name}
                            </div>
                            <div className="text-xs text-gray-600">
                              ID: {student.student_id}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                        {student.student_number}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                        {(() => {
                          const enrolledAll = studentCoursesMap[Number(student.student_id)] || [];
                          const enrolled = enrolledAll.filter((e: any) => e.status === "Active" || e.status === "Enrolled");
                          if (enrolled.length > 0) {
                            return (
                              <div className="flex flex-wrap gap-1 max-w-[28rem]">
                                {enrolled.map((c: any) => (
                                  <span key={`${student.student_id}-${c.course_id}`}
                                    className="px-2 py-0.5 bg-gray-200/70 border border-gray-300 rounded-full text-xs text-gray-800">
                                    {c.course_code || c.code || ""}{c.course_code || c.code ? " • " : ""}{c.course_title || c.name || "Course"}
                                  </span>
                                ))}
                              </div>
                            );
                          }
                          return student.course_name || "No courses";
                        })()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                        <div className="flex items-center gap-1">
                          <Mail className="w-4 h-4 text-gray-600" />
                          <span>{student.email}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Phone className="w-4 h-4 text-gray-600" />
                          <span>{student.phone}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleViewStudent(student)}
                            className="p-2 text-sky-600 hover:text-sky-700 transition-colors rounded-lg hover:bg-sky-100/50"
                            title="View Student"
                          >
                            <Eye className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleOpenMessage(student)}
                            className="p-2 text-emerald-600 hover:text-emerald-700 transition-colors rounded-lg hover:bg-emerald-100/50"
                            title="Send Message"
                          >
                            <MessageSquare className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleEditStudent(student)}
                            className="p-2 text-amber-600 hover:text-amber-700 transition-colors rounded-lg hover:bg-amber-100/50"
                            title="Edit Student"
                          >
                            <Edit className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() =>
                              handleDeleteStudent(
                                student.student_id,
                                `${student.full_name} ${student.student_number}`
                              )
                            }
                            className="p-2 text-red-600 hover:text-red-700 transition-colors rounded-lg hover:bg-red-100/50"
                            title="Delete Student"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {confirmDeleteAllOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] p-4">
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl border border-gray-200 shadow-xl p-8 w-[90vw] max-w-md max-h-[80vh] overflow-auto">
            <h3 className="text-2xl font-extrabold text-gray-900 mb-4">Delete all students?</h3>
            <p className="text-base text-gray-700 mb-6">This will permanently remove all students in your courses, including their enrollments and submissions. This action cannot be undone.</p>
            <div className="mt-2 flex items-center justify-end gap-4">
              <button onClick={() => setConfirmDeleteAllOpen(false)} className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-800 bg-white hover:bg-gray-50 transition-colors text-sm" disabled={deletingAll}>Cancel</button>
              <button onClick={confirmBulkDelete} className="px-5 py-2.5 rounded-xl bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-60 text-sm" disabled={deletingAll}>{deletingAll ? 'Deleting...' : 'Yes, Delete All'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {importModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-100 rounded-3xl p-8 w-full max-w-lg shadow-xl border border-gray-300">
            <h2 className="text-2xl font-black text-gray-900 mb-6">
              Bulk Import Students
            </h2>
            {importResult && (
              <div
                className={`p-4 rounded-xl mb-4 border ${
                  importResult.errors.length > 0
                    ? "bg-red-100 border-red-400 text-red-800"
                    : "bg-emerald-100 border-emerald-400 text-emerald-800"
                }`}
              >
                <p className="font-bold mb-2">Import Summary:</p>
                <p>{importResult.success} students imported successfully.</p>
                {importResult.errors.length > 0 && (
                  <div className="mt-2">
                    <p className="font-bold">Errors:</p>
                    <ul className="list-disc list-inside">
                      {importResult.errors.map((err, index) => (
                        <li key={index}>
                          {typeof err === "string"
                            ? err
                            : err.message || "Unknown error"}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <button
                  onClick={resetImport}
                  className="mt-4 px-4 py-2 bg-gray-200 text-gray-800 rounded-xl hover:bg-gray-300 transition-colors shadow-md"
                >
                  Clear Summary
                </button>
              </div>
            )}
            <div
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:bg-gray-50 transition-colors mb-6"
              onClick={() => document.getElementById("fileInput")?.click()}
            >
              <input
                type="file"
                id="fileInput"
                className="hidden"
                accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                onChange={handleFileChange}
              />
              <Upload className="w-12 h-12 text-gray-500 mx-auto mb-3" />
              <p className="text-gray-700 font-medium">
                Drag & Drop your CSV/Excel file here, or click to browse
              </p>
              {selectedFile && (
                <p className="mt-2 text-gray-900">
                  Selected file:{" "}
                  <span className="font-semibold">{selectedFile.name}</span>
                </p>
              )}
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setImportModalOpen(false);
                  resetImport();
                }}
                className="px-6 py-2 bg-gray-200 text-gray-800 rounded-xl hover:bg-gray-300 transition-colors shadow-md"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImportSubmit}
                className={`px-6 py-2 bg-sky-500 text-white rounded-xl hover:bg-sky-600 transition-colors shadow-md ${
                  !selectedFile || importing
                    ? "opacity-50 cursor-not-allowed"
                    : ""
                }`}
                disabled={!selectedFile || importing}
              >
                {importing ? "Importing..." : "Import Students"}
              </button>
            </div>
          </div>
        </div>
      )}

      {messageModalOpen && targetStudent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-100 rounded-3xl p-8 w-full max-w-lg shadow-xl border border-gray-300">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-black text-gray-900">Send Message</h2>
              <button
                onClick={() => setMessageModalOpen(false)}
                className="p-2 text-gray-600 hover:text-gray-800"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {sendSuccess && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-800 animate-[fadeIn_150ms_ease-out]">
                <svg className="w-5 h-5 text-emerald-600" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-7.25 7.25a1 1 0 01-1.414 0l-3-3a1 1 0 111.414-1.414l2.293 2.293 6.543-6.543a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                <span className="font-semibold">Message sent successfully</span>
              </div>
            )}
            <p className="text-sm text-gray-700 mb-4">
              To: <span className="font-semibold">{targetStudent.full_name}</span> (#{targetStudent.student_number})
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-1">Title</label>
                <input
                  type="text"
                  value={msgTitle}
                  onChange={(e) => setMsgTitle(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:border-sky-500"
                  placeholder="Enter title"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-1">Message</label>
                <textarea
                  rows={4}
                  value={msgBody}
                  onChange={(e) => setMsgBody(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:border-sky-500"
                  placeholder="Write your message to the student"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-1">Priority</label>
                <select
                  value={msgPriority}
                  onChange={(e) => setMsgPriority(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:border-sky-500"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setMessageModalOpen(false)}
                className="px-6 py-2 bg-gray-200 text-gray-800 rounded-xl hover:bg-gray-300 transition-colors shadow-md"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={sendingMsg}
                onClick={handleSendMessage}
                className={`px-6 py-2 bg-sky-500 text-white rounded-xl hover:bg-sky-600 transition-colors shadow-md ${sendingMsg ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {sendingMsg ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
