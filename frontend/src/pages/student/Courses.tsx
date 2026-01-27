import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, BookOpen, Search, Users,
  GraduationCap, Eye, UserPlus, CheckCircle
} from "lucide-react";
import { getDetailedCourses, api } from "../../lib/api";

interface Course {
  course_id: number;
  title: string;
  description?: string;
  code: string;
  instructor_name?: string;
  is_active: number;
  created_at: string;
  enrollment_count: number;
  // Optional legacy fields if backend adds them later
  credits?: number;
  department_id?: number;
  department_name?: string;
}

interface Enrollment {
  enrollment_id: number;
  course_id: number;
  student_id: number;
  enrolled_at: string;
  status: string;
  grade?: number;
  notes?: string;
  course_title: string;
  course_code: string;
  course_credits: number;
  department_name: string;
}

export default function StudentCourses() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"available" | "enrolled" | "pending">("available");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      console.log("Loading courses and enrollments...");
      const [coursesData, enrollmentsData] = await Promise.all([
        getDetailedCourses(),
        loadEnrollments()
      ]);
      console.log("Courses loaded:", coursesData);
      console.log("Enrollments loaded:", enrollmentsData);
      console.log("Number of courses:", coursesData?.length);
      console.log("Number of enrollments:", enrollmentsData?.length);
      
      setCourses(coursesData);
      setEnrollments(enrollmentsData || []);
      
      // Debug: Log enrolled course IDs
      if (enrollmentsData && enrollmentsData.length > 0) {
        const enrolledIds = enrollmentsData.map((e: any) => e.course_id);
        console.log("Enrolled course IDs:", enrolledIds);
        
        // Check if any courses match the enrolled IDs
        const matchingCourses = coursesData.filter((course: any) => enrolledIds.includes(course.course_id));
        console.log("Matching enrolled courses:", matchingCourses);
      }
    } catch (error: any) {
      console.error("Error loading data:", error);
      console.error("Error details:", error.response?.data);
    } finally {
      setIsLoading(false);
    }
  };

  const loadEnrollments = async () => {
    try {
      // Get student profile using "me" endpoint (students can access their own profile)
      console.log("Getting student profile...");
      const studentProfileResponse = await api.get('/student-profile/me');
      const student = studentProfileResponse.data;
      console.log("Student profile:", student);
      
      if (student && student.student_id) {
        console.log(`Getting enrollments for student ID: ${student.student_id}`);
        const enrollmentsResponse = await api.get(`/course-management/enrollments/student/${student.student_id}`);
        console.log("Enrollments response:", enrollmentsResponse.data);
        setEnrollments(enrollmentsResponse.data);
        return enrollmentsResponse.data;
      } else {
        console.log("No student profile found for current user");
      }
      return [];
    } catch (error: any) {
      console.error("Error loading enrollments:", error);
      console.error("Error details:", error.response?.data);
      return [];
    }
  };

  const enrollInCourse = async (courseId: number) => {
    try {
      console.log("Requesting enrollment (pending approval):", courseId);
      const response = await api.post('/course-management/enrollments/self', {
        course_id: courseId
      });
      console.log("Enrollment response:", response.data);

      alert("Request sent. Waiting for instructor approval.");
      await loadData(); // Reload data and wait for it to complete
    } catch (error: any) {
      console.error("Error enrolling in course:", error);
      console.error("Full error:", error.response);
      alert(`Failed to request enrollment: ${error.response?.data?.detail || error.message}`);
    }
  };

  const viewCourse = (course: Course) => {
    // Navigate to course details page
    navigate(`/student/courses/${course.course_id}`);
  };

  const filteredCourses = courses.filter(course => {
    const matchesSearch = course.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         course.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         course.description?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const pendingCourseIds = enrollments.filter(e => e.status === "Pending").map(e => e.course_id);
  const activeCourseIds = enrollments.filter(e => e.status === "Active").map(e => e.course_id);

  // Available = not in either active or pending
  const availableCourses = filteredCourses.filter(course => !activeCourseIds.includes(course.course_id) && !pendingCourseIds.includes(course.course_id));
  const enrolledCourses = filteredCourses.filter(course => activeCourseIds.includes(course.course_id));
  const pendingCourses = filteredCourses.filter(course => pendingCourseIds.includes(course.course_id));

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
            onClick={() => navigate("/student/dashboard")}
            className="p-2 text-gray-800 hover:bg-gray-300/70 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-r from-sky-500 to-sky-600 rounded-xl flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Course Catalog</h1>
              <p className="text-gray-800">Browse and enroll in courses</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8">
          <button
            onClick={() => setActiveTab("available")}
            className={`px-6 py-3 rounded-lg font-medium transition-all ${
              activeTab === "available"
                ? "bg-sky-500 text-white"
                : "bg-gray-100/70 text-gray-800 hover:bg-gray-200/70"
            }`}
          >
            Available Courses ({availableCourses.length})
          </button>
          <button
            onClick={() => setActiveTab("pending")}
            className={`px-6 py-3 rounded-lg font-medium transition-all ${
              activeTab === "pending"
                ? "bg-amber-500 text-white"
                : "bg-gray-100/70 text-gray-800 hover:bg-gray-200/70"
            }`}
          >
            Pending ({pendingCourses.length})
          </button>
          <button
            onClick={() => setActiveTab("enrolled")}
            className={`px-6 py-3 rounded-lg font-medium transition-all ${
              activeTab === "enrolled"
                ? "bg-sky-500 text-white"
                : "bg-gray-100/70 text-gray-800 hover:bg-gray-200/70"
            }`}
          >
            My Courses ({enrolledCourses.length})
          </button>
        </div>

        {/* Search and Filter */}
        <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-6 mb-8">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 w-4 h-4" />
              <input
                type="text"
                placeholder="Search courses by title, code, or description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-gray-100/70 border border-gray-300 rounded-2xl px-10 py-3 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500 hover:border-gray-400"
              />
            </div>
          </div>
        </div>

        {/* Courses Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {(activeTab === "available" ? availableCourses : activeTab === "pending" ? pendingCourses : enrolledCourses).map((course) => {
            const enrollment = enrollments.find(e => e.course_id === course.course_id);
            const isEnrolled = !!enrollment && enrollment.status === "Active";
            const isPending = !!enrollment && enrollment.status === "Pending";
            
            return (
              <div
                key={course.course_id}
                className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-6 hover:bg-gray-200/70 transition-all duration-300 group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-lg font-bold text-gray-900 group-hover:text-sky-700 transition-colors">
                        {course.title}
                      </h3>
                      <span className="bg-sky-100/50 text-sky-800 px-2 py-1 rounded-lg text-xs font-medium">
                        {course.code}
                      </span>
                      {isEnrolled && (
                        <CheckCircle className="w-5 h-5 text-sky-500" />
                      )}
                    </div>
                    <p className="text-gray-800 text-sm mb-3 line-clamp-2">
                      {course.description || "No description available"}
                    </p>
                    <div className="flex items-center gap-4 text-sm text-gray-700">
                      {course.credits != null && (
                        <div className="flex items-center gap-1">
                          <GraduationCap className="w-4 h-4" />
                          <span>{course.credits} credits</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        <span>{course.enrollment_count} enrolled</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    <p>{course.department_name || course.instructor_name || ""}</p>
                    <p>{new Date(course.created_at).toLocaleDateString()}</p>
                    {isPending && (
                      <p className="text-amber-600 font-medium">Pending approval</p>
                    )}
                    {isEnrolled && enrollment && (
                      <p className="text-sky-500 font-medium">
                        Enrolled: {new Date(enrollment.enrolled_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => viewCourse(course)}
                      className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-200/50 rounded-lg transition-colors"
                      title="View Course"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    {!isEnrolled && !isPending && (
                      <button
                        onClick={() => enrollInCourse(course.course_id)}
                        className="bg-sky-500 hover:bg-sky-600 text-white font-bold py-2 px-4 rounded-xl transition-all duration-300 flex items-center gap-2"
                      >
                        <UserPlus className="w-4 h-4" />
                        Enroll
                      </button>
                    )}
                    {isPending && (
                      <span className="text-sm text-gray-700">Request sent</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {(activeTab === "available" ? availableCourses : activeTab === "pending" ? pendingCourses : enrolledCourses).length === 0 && (
          <div className="text-center py-12">
            <BookOpen className="w-16 h-16 text-gray-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              {activeTab === "available" ? "No available courses" : activeTab === "pending" ? "No pending requests" : "No enrolled courses"}
            </h3>
            <p className="text-gray-700">
              {activeTab === "available"
                ? "No courses match your search criteria"
                : activeTab === "pending"
                  ? "You have no pending enrollment requests"
                  : "You haven't enrolled in any courses yet"
              }
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
