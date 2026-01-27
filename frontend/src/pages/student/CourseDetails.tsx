import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { 
  ArrowLeft, BookOpen, Users, GraduationCap, 
  Calendar, Building, CheckCircle, UserPlus, Download
} from "lucide-react";
import { api, getStudentCourseDetails } from "../../lib/api";

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

interface Enrollment {
  enrollment_id: number;
  course_id: number;
  student_id: number;
  enrolled_at: string;
  status: string;
  grade?: number;
  notes?: string;
}

export default function CourseDetails() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [course, setCourse] = useState<Course | null>(null);
  const [studentView, setStudentView] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);

  useEffect(() => {
    if (courseId) {
      loadCourseDetails();
      checkEnrollmentStatus();
    }
  }, [courseId]);

  const loadCourseDetails = async () => {
    try {
      setIsLoading(true);
      try {
        const sv = await getStudentCourseDetails(courseId!);
        setStudentView(sv.data);
      } catch (e) {
        // if not student or not enrolled, ignore
      }
      const response = await api.get(`/course-management/courses/${courseId}`).catch(() => null as any);
      setCourse(response?.data ?? null);
    } catch (error: any) {
      console.error("Error loading course details:", error);
      alert("Failed to load course details");
    } finally {
      setIsLoading(false);
    }
  };

  const checkEnrollmentStatus = async () => {
    try {
      // Get student profile
      const studentProfileResponse = await api.get('/student-profile/me');
      const student = studentProfileResponse.data;
      
      if (student && student.student_id) {
        // Get student's enrollments
        const enrollmentsResponse = await api.get(`/course-management/enrollments/student/${student.student_id}`);
        const enrollments = enrollmentsResponse.data;
        
        // Check if enrolled or pending in this course
        const courseEnrollment = enrollments.find((e: Enrollment) => 
          e.course_id === parseInt(courseId!)
        );

        if (courseEnrollment) {
          setEnrollment(courseEnrollment);
          if (courseEnrollment.status === "Active") {
            setIsEnrolled(true);
            setIsPending(false);
          } else if (courseEnrollment.status === "Pending") {
            setIsEnrolled(false);
            setIsPending(true);
          } else {
            setIsEnrolled(false);
            setIsPending(false);
          }
        } else {
          setIsEnrolled(false);
          setIsPending(false);
          setEnrollment(null);
        }
      }
    } catch (error: any) {
      console.error("Error checking enrollment status:", error);
    }
  };

  const enrollInCourse = async () => {
    try {
      const response = await api.post('/course-management/enrollments/self', {
        course_id: parseInt(courseId!)
      });
      console.log("Enrollment response:", response.data);

      alert("Request sent. Waiting for instructor approval.");
      await checkEnrollmentStatus(); // Refresh enrollment status (should become Pending)
    } catch (error: any) {
      console.error("Error enrolling in course:", error);
      alert(`Failed to enroll: ${error.response?.data?.detail || error.message}`);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse">
            <BookOpen className="w-8 h-8 text-white" />
          </div>
          <p className="text-gray-800 font-medium">Loading course details...</p>
        </div>
      </div>
    );
  }

  if (!course && !studentView) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <BookOpen className="w-16 h-16 text-gray-700 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-800 mb-2">Course not found</h3>
          <p className="text-gray-600 mb-4">The course you're looking for doesn't exist.</p>
          <button
            onClick={() => navigate("/student/courses")}
            className="bg-blue-700 hover:bg-blue-800 text-white px-6 py-2 rounded-lg transition-colors"
          >
            Back to Courses
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-200 text-gray-900">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate("/student/courses")}
            className="p-2 rounded-lg hover:bg-gray-300/70"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-r from-sky-400 to-sky-600 rounded-xl flex items-center justify-center shadow-lg">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-black bg-gradient-to-r from-gray-800 via-gray-900 to-black bg-clip-text text-transparent">Course Details</h1>
              <p className="text-gray-700">View course information</p>
            </div>
          </div>
        </div>

        {/* Course Card */}
        <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-8 mb-8">
          <div className="flex items-start justify-between mb-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-2xl font-black text-gray-900">{studentView?.title || course?.title}</h2>
                <span className="px-3 py-1 bg-sky-500/20 text-sky-700 rounded-full text-sm font-bold border border-sky-400/30">
                  {studentView?.code || course?.code}
                </span>
                {isEnrolled && (
                  <div className="flex items-center gap-1 bg-emerald-500/20 text-emerald-700 px-3 py-1 rounded-full text-sm font-bold border border-emerald-400/30">
                    <CheckCircle className="w-4 h-4" />
                    Enrolled
                  </div>
                )}
                {isPending && (
                  <div className="flex items-center gap-1 bg-amber-500/20 text-amber-700 px-3 py-1 rounded-full text-sm font-bold border border-amber-400/30">
                    <CheckCircle className="w-4 h-4" />
                    Pending
                  </div>
                )}
              </div>

              <p className="text-gray-800 mb-6 leading-relaxed">
                {studentView?.description || course?.description || "No description available for this course."}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-sky-500/20 rounded-lg flex items-center justify-center border border-sky-400/30">
                    <Users className="w-5 h-5 text-sky-700" />
                  </div>
                  <div>
                    <p className="text-gray-600 text-sm">Enrolled Students</p>
                    <p className="text-gray-900 font-semibold">{studentView?.enrollment_count ?? course?.enrollment_count ?? "-"}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center border border-orange-400/30">
                    <Calendar className="w-5 h-5 text-orange-700" />
                  </div>
                  <div>
                    <p className="text-gray-600 text-sm">Created</p>
                    <p className="text-gray-900 font-semibold">{(studentView?.created_at || course?.created_at) ? new Date(studentView?.created_at || course?.created_at).toLocaleDateString() : "-"}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Enrollment / Attendance Section */}
          <div className="border-t border-gray-300 pt-6">
            {isEnrolled ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-6 h-6 text-emerald-600" />
                  <div>
                    <p className="text-emerald-700 font-semibold">You are enrolled in this course</p>
                    {enrollment && (
                      <p className="text-gray-700 text-sm">
                        Enrolled on: {new Date(enrollment.enrolled_at).toLocaleDateString()}
                      </p>
                    )}
                    {studentView && (
                      <div className="text-gray-700 text-sm mt-2">
                        <div className="flex flex-wrap gap-2">
                          <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Present: {studentView.attendance_present ?? 0}
                          </span>
                          <span className="px-2 py-1 rounded-full bg-red-100 text-red-800 border border-red-200">
                            Absent: {studentView.attendance_absent ?? 0}
                          </span>
                          <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                            Late: {studentView.attendance_late ?? 0}
                          </span>
                          <span className="px-2 py-1 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                            Excused: {studentView.attendance_excused ?? 0}
                          </span>
                          <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-800 border border-gray-200">
                            Total Lectures: {studentView.attendance_total_lectures ?? ((studentView.attendance_present ?? 0) + (studentView.attendance_absent ?? 0) + (studentView.attendance_late ?? 0) + (studentView.attendance_excused ?? 0))}
                          </span>
                          <span className="px-2 py-1 rounded-full bg-sky-100 text-sky-800 border border-sky-200" title="Excused counts as present in percentage">
                            {Number(studentView.attendance_percentage ?? 0).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => navigate("/student/courses")}
                  className="px-4 py-2 rounded-xl bg-sky-600 text-white hover:bg-sky-700"
                >
                  View All Courses
                </button>
              </div>
            ) : isPending ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-6 h-6 text-amber-600" />
                  <div>
                    <p className="text-amber-700 font-semibold">Your enrollment request is pending instructor approval</p>
                    {enrollment && (
                      <p className="text-gray-700 text-sm">
                        Requested on: {new Date(enrollment.enrolled_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => navigate("/student/courses")}
                  className="px-4 py-2 rounded-xl bg-gray-200 text-gray-900 hover:bg-gray-300"
                >
                  Back to Courses
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-900 font-semibold mb-1">Ready to enroll?</p>
                  <p className="text-gray-700 text-sm">
                    Join {course?.enrollment_count ?? '-'} other students in this course
                  </p>
                </div>
                <button
                  onClick={enrollInCourse}
                  className="px-6 py-3 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-2"
                >
                  <UserPlus className="w-5 h-5" />
                  Enroll Now
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Additional Course Information */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-gray-100/70 backdrop-blur-xl rounded-2xl border border-gray-300 p-6">
            <h3 className="text-xl font-black text-gray-900 mb-4">Course Information</h3>
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-gray-600">Course Code:</span>
                <span className="text-gray-900 font-medium">{studentView?.code || course?.code}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Status:</span>
                <span className={`font-medium ${(course?.is_active ?? studentView?.is_active) ? 'text-emerald-700' : 'text-red-600'}`}>
                  {(course?.is_active ?? studentView?.is_active) ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-gray-100/70 backdrop-blur-xl rounded-2xl border border-gray-300 p-6">
            <h3 className="text-xl font-black text-gray-900 mb-4">Enrollment Stats</h3>
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Enrolled:</span>
                <span className="text-gray-900 font-medium">{(studentView?.enrollment_count ?? course?.enrollment_count) ?? '-'} students</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Your Status:</span>
                <span className={`font-medium ${isEnrolled ? 'text-emerald-700' : isPending ? 'text-amber-700' : 'text-orange-700'}`}>
                  {isEnrolled ? 'Enrolled' : isPending ? 'Pending Approval' : 'Not Enrolled'}
                </span>
              </div>
              {enrollment && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Enrollment Date:</span>
                  <span className="text-gray-900 font-medium">
                    {new Date(enrollment.enrolled_at).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {studentView && (
          <div className="mt-8 bg-gray-100/70 backdrop-blur-xl rounded-2xl border border-gray-300 p-6">
            <h3 className="text-xl font-black text-gray-900 mb-4">Your Submissions in this Course</h3>
            {studentView.submissions?.length === 0 ? (
              <p className="text-gray-700">You haven't submitted anything yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm text-gray-900">
                  <thead>
                    <tr className="text-left">
                      <th className="p-2">Assignment</th>
                      <th className="p-2">Submitted At</th>
                      <th className="p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentView.submissions?.map((s:any) => (
                      <tr key={s.submission_id} className="border-t border-gray-300">
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            {s.assignment_title}
                            {s.assignment_has_pdf && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(`/api/assignments/${s.assignment_id}/pdf`, '_blank');
                                }}
                                className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50"
                                title="Download Assignment PDF"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="p-2">{new Date(s.submitted_at).toLocaleString()}</td>
                        <td className="p-2">
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            s.status === 'accepted' ? 'bg-green-100 text-green-800' :
                            s.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            s.status === 'rejected' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
