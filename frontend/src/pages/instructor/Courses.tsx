import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Plus,
  Users,
  BookOpen,
  Eye,
  Edit,
  Trash2,
  ArrowLeft,
  GraduationCap,
} from "lucide-react";
import { api, getDetailedCourses } from "../../lib/api";
import toast from "react-hot-toast";

interface Course {
  course_id: number;
  title: string;
  description?: string;
  code: string;
  instructor_name: string;
  is_active: number;
  created_at: string;
  enrollment_count: number;
}

export default function Courses() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [confirmDlg, setConfirmDlg] = useState<{ open: boolean; title?: string; message?: string; onConfirm?: () => Promise<void> | void }>({ open: false });

  

  useEffect(() => {
    loadCourses();
  }, []);

  const loadCourses = async () => {
    try {
      setIsLoading(true);
      const response = await getDetailedCourses();
      setCourses(response);
    } catch (error) {
      console.error("Failed to load courses:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const doDeleteCourse = async (courseId: number) => {
    try {
      await api.delete(`/course-management/courses/${courseId}`);
      toast.success("Course deleted successfully");
      await loadCourses();
    } catch (error: any) {
      console.error("Failed to delete course:", error);
      const msg = error?.response?.data?.detail || error?.message || "Failed to delete course";
      toast.error(msg);
    }
  };

  const handleDeleteCourse = (courseId: number, title?: string) => {
    setConfirmDlg({
      open: true,
      title: "Delete Course",
      message: `Are you sure you want to delete${title ? ` "${title}"` : " this course"}? This action cannot be undone.`,
      onConfirm: async () => {
        setConfirmDlg({ open: false });
        await doDeleteCourse(courseId);
      },
    });
  };

  const filteredCourses = courses.filter((course) => {
    const matchesSearch =
      course.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      course.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (course.description || "")
        .toLowerCase()
        .includes(searchTerm.toLowerCase());

    // const matchesDepartment =
    //   selectedDepartment === "all" ||
    //   course.department_name === selectedDepartment;

    return matchesSearch; // Removed matchesDepartment
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-200 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-sky-400 to-sky-600 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse">
            <BookOpen className="w-8 h-8 text-white" />
          </div>
          <p className="text-gray-800 font-medium">Loading courses...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-200 text-gray-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate("/instructor/dashboard")}
            className="p-2 text-gray-800 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-300/70"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-r from-sky-500 to-sky-600 rounded-xl flex items-center justify-center shadow-lg">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-gray-900">
                Course Management
              </h1>
              <p className="text-gray-800">Manage and view all courses</p>
            </div>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-6 mb-8">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 w-5 h-5" />
              <input
                type="text"
                placeholder="Search courses by title, code, or description..."
                className="w-full bg-gray-50 border border-gray-300 rounded-2xl py-2 pl-10 pr-4 text-gray-900 placeholder-gray-500 focus:outline-none focus:border-sky-500 focus:bg-gray-200/70 transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {/* Removed department filter dropdown */}
            <button
              onClick={() => navigate("/instructor/courses/create")}
              className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-sky-500 to-sky-600 text-white rounded-2xl hover:from-sky-600 hover:to-sky-700 transition-all duration-300 shadow-lg w-full md:w-auto justify-center"
            >
              <Plus className="w-5 h-5" />
              Create Course
            </button>
          </div>
        </div>

        {/* Courses Grid */}
        {isLoading ? (
          <div className="text-center py-10 text-gray-700">
            Loading courses...
          </div>
        ) : filteredCourses.length === 0 ? (
          <div className="text-center py-10 text-gray-700">
            No courses found.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCourses.map((course) => (
              <div
                key={course.course_id}
                className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-6 flex flex-col justify-between shadow-xl hover:shadow-sky-500/20 transition-all duration-300 hover:-translate-y-1"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-black text-gray-900">
                      {course.title}
                    </h3>
                    <span className="bg-sky-100 text-sky-800 text-xs font-semibold px-3 py-1 rounded-full">
                      {course.code}
                    </span>
                  </div>
                  <p className="text-gray-700 text-sm mb-4">
                    {course.description || "No description provided."}
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-4 text-gray-800 text-sm mb-4">
                    <div className="flex items-center gap-1">
                      <GraduationCap className="w-4 h-4 text-gray-600" />
                      <span>
                        Status: {course.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Users className="w-4 h-4 text-gray-600" />
                      <span>{course.enrollment_count} enrolled</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
                    <span>
                      Instructor: {course.instructor_name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span>
                      Created:{" "}
                      {new Date(course.created_at).toLocaleDateString()}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          navigate(`/instructor/courses/${course.course_id}`)
                        }
                        className="p-2 text-sky-600 hover:text-sky-700 transition-colors rounded-lg hover:bg-sky-100/50"
                        title="View Course Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() =>
                          navigate(
                            `/instructor/courses/${course.course_id}/edit`
                          )
                        }
                        className="p-2 text-amber-600 hover:text-amber-700 transition-colors rounded-lg hover:bg-amber-100/50"
                        title="Edit Course"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteCourse(course.course_id, course.title)}
                        className="p-2 text-red-600 hover:text-red-700 transition-colors rounded-lg hover:bg-red-100/50"
                        title="Delete Course"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
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
    </div>
  );
}
