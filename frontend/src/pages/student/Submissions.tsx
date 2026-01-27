import { useState, useEffect, useRef } from "react";
import { 
  Calendar, Clock, Eye, Search,
  AlertCircle, SortAsc, SortDesc, ArrowLeft, MessageCircle,
  CheckCircle, XCircle, FileText, LogOut,
  Sparkles, Star, RefreshCw, BookOpen, Upload
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api, getStudentEnrollments, getStudentProfile } from "../../lib/api";

interface User {
  id: number;
  username: string;
  email: string;
  fullName: string;
  role: string;
}

interface Submission {
  id: number;
  assignmentId: number;
  assignmentTitle: string;
  course: string;
  description: string;
  submittedAt: string;
  dueDate: string | null;
  status: string;
  grade: number | null;
  maxGrade?: number | null;
  feedback: string | null;
  files: string[];
  priority: string;
}

export default function StudentSubmissions() {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [filteredSubmissions, setFilteredSubmissions] = useState<Submission[]>([]);
  const [user, setUser] = useState<User | null>({
    id: 1,
    username: 'student1',
    email: 'student@example.com',
    fullName: 'John Doe',
    role: 'student'
  });
  const [isAnimated, setIsAnimated] = useState(false);
  const [error, setError] = useState<string>("");
  const navigate = useNavigate();
  
  // Filters and search
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedCourse, setSelectedCourse] = useState<string>("All Courses");
  const [selectedStatus, setSelectedStatus] = useState<string>("All Statuses");
  const [sortBy, setSortBy] = useState<string>("submittedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [showFilters, setShowFilters] = useState(false);
  
  // State for enrolled courses
  const [enrolledCourses, setEnrolledCourses] = useState<string[]>(["All Courses"]);
  
  // Pagination
  const [showAll, setShowAll] = useState<boolean>(false);
  const [displayedSubmissions, setDisplayedSubmissions] = useState<Submission[]>([]);
  
  const searchRef = useRef<HTMLInputElement>(null);
  const resubmitInputRef = useRef<HTMLInputElement>(null);
  const [resubmitTargetId, setResubmitTargetId] = useState<number | null>(null);

  // Mock data for filters
  const mockStatuses = ["All Statuses", "pending", "accepted", "rejected", "needsrevision"];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError("");

      // Load user info
      const userResponse = await api.get("/auth/me");
      const userData = userResponse.data;
      setUser(userData);

      let studentId: number | undefined;
      if (userData?.id) {
        try {
          // If the user is a student, use the "me" endpoint to fetch their profile.
          // Otherwise, use the user ID as the student ID (e.g., for admin/instructor views, if applicable).
          const profileId = userData.role === "student" ? "me" : userData.id;
          const studentProfile = await getStudentProfile(profileId); // Use "me" for students
          studentId = studentProfile.data.student_id; // Get the actual student_id
        } catch (profileError: any) {
          console.error("Error fetching student profile:", profileError);
          // Handle error, maybe log out or show a critical error message
          setError("Failed to retrieve student profile. Please log in again.");
          if (profileError.response?.status === 401) {
            localStorage.removeItem('token');
            navigate('/signin');
            return;
          }
          setIsLoading(false);
          return; // Stop further execution if student profile cannot be fetched
        }
      }

      // Fetch enrolled courses for the student
      if (studentId) {
        try {
          const enrollments = await getStudentEnrollments(studentId);
          const courseNames = enrollments.map((enrollment: any) => enrollment.course_title);
          setEnrolledCourses(["All Courses", ...courseNames]);
        } catch (enrollmentError: any) {
          console.error("Error fetching enrolled courses:", enrollmentError);
          // Decide how to handle this error: maybe set default courses or display a specific message
          // For now, let's proceed with an empty list of enrolled courses if this fails
          setEnrolledCourses(["All Courses"]); 
        }
      }

      // Load submissions
      try {
        const submissionsResponse = await api.get("/student/submissions");
        const submissionsData = submissionsResponse.data;

        // Transform API data to match our interface
        const transformedSubmissions: Submission[] = submissionsData.map((sub: any) => ({
          id: sub.id,
          assignmentId: sub.assignmentId,
          assignmentTitle: sub.title || `Assignment ${sub.assignmentId}`,
          course: sub.course || "Dental Course", // Use course from API or default
          description: sub.notes || "No description provided",
          submittedAt: sub.submittedAt,
          dueDate: sub.assignment_deadline || null,
          status: sub.status.toLowerCase(),
          grade: sub.grade || null,
          maxGrade: sub.maxGrade ?? sub.max_grade ?? null,
          feedback: sub.feedback || null,
          files: sub.fileUrl ? [sub.fileUrl] : [],
          priority: sub.status === 'accepted' ? 'completed' : 
                   sub.status === 'pending' ? 'review' : 'revision'
        }));

        setSubmissions(transformedSubmissions);
        setFilteredSubmissions(transformedSubmissions);
      } catch (submissionError: any) {
        console.error("Error loading submissions:", submissionError);
        setError("Failed to load submissions. Please try again.");
        
        if (submissionError.response?.status === 401) {
          localStorage.removeItem('token');
          navigate('/signin');
          return;
        }
      }
    } catch (error: any) {
      console.error("Error loading data:", error);
      setError("Failed to load submissions. Please try again.");
      
      if (error.response?.status === 401) {
        localStorage.removeItem('token');
        navigate('/signin');
        return;
      }
    } finally {
      setIsLoading(false);
      setTimeout(() => setIsAnimated(true), 100);
    }
  };

  // Resubmit (replace file) workflow
  const triggerResubmit = (submissionId: number) => {
    setResubmitTargetId(submissionId);
    // trigger hidden file input
    resubmitInputRef.current?.click();
  };

  const handleResubmitFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !resubmitTargetId) return;
    try {
      const form = new FormData();
      form.append("file", file);
      await api.patch(`/student/submissions/${resubmitTargetId}/file`, form);
      // reload list
      await loadData();
    } catch (err: any) {
      console.error("Resubmit failed", err);
      alert(err?.response?.data?.detail || err.message || "Failed to resubmit");
    } finally {
      // reset input
      if (resubmitInputRef.current) resubmitInputRef.current.value = "";
      setResubmitTargetId(null);
    }
  };

  useEffect(() => {
    let filtered = [...submissions];

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(sub => 
        sub.assignmentTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sub.course.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sub.description.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Course filter
    if (selectedCourse !== "All Courses") {
      filtered = filtered.filter(sub => sub.course === selectedCourse);
    }

    // Status filter
    if (selectedStatus !== "All Statuses") {
      filtered = filtered.filter(sub => sub.status === selectedStatus);
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal, bVal;
      
      switch (sortBy) {
        case "title":
          aVal = a.assignmentTitle.toLowerCase();
          bVal = b.assignmentTitle.toLowerCase();
          break;
        case "course":
          aVal = a.course.toLowerCase();
          bVal = b.course.toLowerCase();
          break;
        case "grade":
          aVal = a.grade || 0;
          bVal = b.grade || 0;
          break;
        case "submittedAt":
        default:
          aVal = new Date(a.submittedAt).getTime();
          bVal = new Date(b.submittedAt).getTime();
          break;
      }

      if (sortOrder === "asc") {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    setFilteredSubmissions(filtered);
    
    // Update displayed submissions based on showAll state
    if (showAll) {
      setDisplayedSubmissions(filtered);
    } else {
      setDisplayedSubmissions(filtered.slice(0, 3));
    }
  }, [submissions, searchTerm, selectedCourse, selectedStatus, sortBy, sortOrder, showAll]);

  const handleSignOut = () => {
    localStorage.removeItem('token');
    window.location.href = '/signin';
  };

  // Removed delete functionality per requirements

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted': return 'text-emerald-400 bg-emerald-500/20 border-emerald-400/30';
      case 'pending': return 'text-amber-400 bg-amber-500/20 border-amber-400/30';
      case 'rejected': return 'text-red-400 bg-red-500/20 border-red-400/30';
      default: return 'text-gray-400 bg-gray-500/20 border-gray-400/30';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'accepted': return CheckCircle;
      case 'pending': return Clock;
      case 'rejected': return XCircle;
      default: return FileText;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'completed': return 'text-emerald-400';
      case 'review': return 'text-amber-400';
      case 'revision': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getGradeColor = (grade: number) => {
    if (grade >= 9) return 'text-emerald-400';
    if (grade >= 8) return 'text-blue-400';
    if (grade >= 7) return 'text-yellow-400';
    if (grade >= 6) return 'text-orange-400';
    return 'text-red-400';
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-sky-500 to-sky-600 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse">
            <FileText className="w-8 h-8 text-white" />
          </div>
          <p className="text-gray-600 font-medium">Loading your submissions...</p>
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
          <div className="absolute top-40 right-40 w-96 h-96 bg-gradient-to-r from-gray-300/20 to-gray-400/20 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1000ms'}} />
          <div className="absolute bottom-20 left-1/3 w-80 h-80 bg-gradient-to-r from-sky-300/25 to-sky-400/25 rounded-full blur-3xl animate-pulse" style={{animationDelay: '500ms'}} />
        </div>
        {/* Floating Particles */}
        <div className="absolute inset-0">
          {[...Array(25)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-gray-400/40 rounded-full animate-pulse"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${2 + Math.random() * 2}s`
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
                <div className="w-14 h-14 bg-gradient-to-r from-sky-400 to-sky-600 rounded-2xl flex items-center justify-center shadow-2xl transform transition-all duration-300 group-hover:scale-110 group-hover:rotate-6">
                  <BookOpen className="w-8 h-8 text-white" />
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-r from-sky-400 to-sky-600 rounded-full animate-ping" />
              </div>
              <div>
                <h1 className="text-2xl font-black bg-gradient-to-r from-gray-800 via-gray-900 to-black bg-clip-text text-transparent">
                  Course Management System
                </h1>
                <p className="text-sm text-gray-800 font-medium">My Submissions</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
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
        {/* Header Section */}
        <div className={`mb-8 transform transition-all duration-1000 ${isAnimated ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}>
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => navigate('/student/dashboard')}
              className="group p-3 bg-gray-200/50 backdrop-blur-md border border-gray-300 rounded-2xl text-gray-800 hover:bg-gray-300/70 transition-all duration-300 hover:scale-110 hover:-translate-x-1"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-6 h-6 group-hover:scale-110 transition-transform" />
            </button>
            <div className="relative">
              <div className="w-16 h-16 bg-gradient-to-r from-sky-500 to-sky-600 rounded-2xl flex items-center justify-center shadow-2xl">
                <FileText className="w-8 h-8 text-white" />
              </div>
              <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-yellow-300 animate-pulse" />
            </div>
            <div>
              <h2 className="text-3xl font-black bg-gradient-to-r from-gray-800 via-gray-900 to-black bg-clip-text text-transparent">
                My Submissions
              </h2>
              <p className="text-gray-800 text-lg">Manage and track your academic work</p>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
            <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-4 transform transition-all duration-500 hover:scale-105">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-sky-500 to-sky-600 rounded-xl flex items-center justify-center">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-black text-gray-900">{submissions.length}</p>
                  <p className="text-gray-800 text-sm">Total Submissions</p>
                </div>
              </div>
            </div>

            <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-4 transform transition-all duration-500 hover:scale-105">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl flex items-center justify-center">
                  <Clock className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-black text-gray-900">{submissions.filter(s => s.status === 'pending').length}</p>
                  <p className="text-gray-800 text-sm">Pending</p>
                </div>
              </div>
            </div>

            <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-4 transform transition-all duration-500 hover:scale-105">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-sky-500 to-sky-600 rounded-xl flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-black text-gray-900">{submissions.filter(s => s.status === 'accepted').length}</p>
                  <p className="text-gray-800 text-sm">Accepted</p>
                </div>
              </div>
            </div>

            <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-4 transform transition-all duration-500 hover:scale-105">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-red-500 to-rose-500 rounded-xl flex items-center justify-center">
                  <XCircle className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-black text-gray-900">{submissions.filter(s => s.status === 'rejected').length}</p>
                  <p className="text-gray-800 text-sm">Rejected</p>
                </div>
              </div>
            </div>

            <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-4 transform transition-all duration-500 hover:scale-105">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-sky-500 to-sky-600 rounded-xl flex items-center justify-center">
                  <Star className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-black text-gray-900">
                    {(() => {
                      const graded = submissions.filter(s => s.grade != null && s.maxGrade != null && s.maxGrade! > 0);
                      if (graded.length === 0) return '0%';
                      const avgPct = Math.round(
                        (graded.reduce((acc, s) => acc + ((s.grade! / (s.maxGrade as number)) * 100), 0) / graded.length)
                      );
                      return `${avgPct}%`;
                    })()}
                  </p>
                  <p className="text-gray-800 text-sm">Avg. Grade</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filters and Search */}
        <div className={`mb-8 transform transition-all duration-1000 ${isAnimated ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`} style={{transitionDelay: '200ms'}}>
          <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-6">
            <div className="flex flex-col lg:flex-row gap-4">
              {/* Search */}
              <div className="flex-1 relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2">
                  <Search className="w-5 h-5 text-gray-600" />
                </div>
                <input
                  ref={searchRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-gray-100/70 backdrop-blur-sm border border-gray-300 rounded-2xl text-gray-900 placeholder-gray-500 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-sky-500 hover:border-gray-400 transform hover:scale-[1.02] focus:scale-[1.02]"
                  placeholder="Search submissions..."
                />
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-sky-400/0 via-sky-400/0 to-sky-400/0 group-hover:from-sky-400/10 group-hover:via-sky-400/10 group-hover:to-sky-400/10 transition-all duration-500 pointer-events-none" />
              </div>

              {/* Filters */}
              <div className="flex gap-3">
                <select
                  value={selectedCourse}
                  onChange={(e) => setSelectedCourse(e.target.value)}
                  className="px-4 py-3 bg-gray-100/70 backdrop-blur-sm border border-gray-300 rounded-2xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all duration-300 hover:bg-gray-200/70 cursor-pointer"
                >
                  {enrolledCourses.map(course => (
                    <option key={course} value={course} className="bg-gray-100 text-gray-900">
                      {course}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="px-4 py-3 bg-gray-100/70 backdrop-blur-sm border border-gray-300 rounded-2xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all duration-300 hover:bg-gray-200/70 cursor-pointer capitalize"
                >
                  {mockStatuses.map(status => (
                    <option key={status} value={status} className="bg-gray-100 text-gray-900 capitalize">
                      {status}
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-2">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="px-4 py-3 bg-gray-100/70 backdrop-blur-sm border border-gray-300 rounded-2xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all duration-300 hover:bg-gray-200/70 cursor-pointer"
                  >
                    <option value="submittedAt" className="bg-gray-100">Date</option>
                    <option value="title" className="bg-gray-100">Title</option>
                    <option value="course" className="bg-gray-100">Course</option>
                    <option value="grade" className="bg-gray-100">Grade</option>
                  </select>
                  
                  <button
                    onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                    className="p-3 bg-gray-100/70 backdrop-blur-sm border border-gray-300 rounded-2xl text-gray-800 hover:bg-gray-200/70 transition-all duration-300 hover:scale-110"
                  >
                    {sortOrder === 'asc' ? <SortAsc className="w-5 h-5" /> : <SortDesc className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>
            
            <div className="mt-4 flex items-center justify-between">
              <p className="text-gray-700 text-sm">
                Showing {filteredSubmissions.length} of {submissions.length} submissions
              </p>
              <button
                onClick={() => {
                  setSearchTerm("");
                  setSelectedCourse("All Courses");
                  setSelectedStatus("All Statuses");
                  setSortBy("submittedAt");
                  setSortOrder("desc");
                }}
                className="text-sky-600 hover:text-sky-700 text-sm font-medium transition-colors flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Reset Filters
              </button>
            </div>
          </div>
        </div>

        {/* Submissions List */}
        {displayedSubmissions.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-16 h-16 text-gray-500 mx-auto mb-4" />
            <p className="text-gray-700 text-lg mb-2">No submissions found</p>
            <p className="text-gray-500">Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="space-y-4">
            {displayedSubmissions.map((submission, index) => {
              const StatusIcon = getStatusIcon(submission.status);
              return (
                <div
                  key={submission.id}
                  className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-8 group hover:bg-gray-200/70 transition-all duration-500 hover:scale-[1.02] transform"
                  style={{animationDelay: `${index * 100}ms`}}
                >
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-bold text-gray-900 group-hover:text-sky-700 transition-colors">
                          {submission.assignmentTitle}
                        </h3>
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold ${getStatusColor(submission.status)}`}>
                          <StatusIcon className="w-3 h-3" />
                          <span className="capitalize">{submission.status}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4 mb-3">
                        <div className="flex items-center gap-2 text-gray-700">
                          <BookOpen className="w-4 h-4" />
                          <span className="font-medium">{submission.course}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <Calendar className="w-4 h-4" />
                          <span className="text-sm">
                            Submitted {new Date(submission.submittedAt).toLocaleDateString()}
                          </span>
                        </div>
                        {submission.grade != null && submission.maxGrade != null && (
                          <div className="flex items-center gap-2">
                            <Star className="w-4 h-4 text-yellow-400" />
                            <span className={`font-bold ${getGradeColor(submission.grade)}`}>
                              {submission.grade}/{submission.maxGrade}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      <p className="text-gray-800 mb-4">{submission.description}</p>
                      
                      {submission.files && submission.files.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-4">
                          {submission.files.map((file, idx) => (
                            <div key={idx} className="flex items-center gap-2 px-3 py-1.5 bg-gray-100/50 border border-gray-300 rounded-lg text-xs text-gray-700">
                              <FileText className="w-3 h-3" />
                              {file}
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {submission.feedback && (
                        <div className="mt-4 p-4 bg-gray-100/50 border border-gray-300 rounded-2xl">
                          <div className="flex items-center gap-2 mb-2">
                            <MessageCircle className="w-4 h-4 text-sky-500" />
                            <span className="text-sm font-bold text-sky-500">Instructor Feedback</span>
                          </div>
                          <p className="text-gray-800 text-sm italic">"{submission.feedback}"</p>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => navigate(`/student/submissions/${submission.id}`)}
                        className="p-2 text-gray-600 hover:text-gray-800 transition-colors rounded-xl hover:bg-gray-200/50 transform hover:scale-110"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {(submission.status === 'rejected' || submission.status === 'needsrevision') && (
                        <button
                          onClick={() => triggerResubmit(submission.id)}
                          className="p-2 text-amber-600 hover:text-amber-700 transition-colors rounded-xl hover:bg-amber-100/50 transform hover:scale-110"
                          title="Resubmit (replace file)"
                        >
                          <Upload className="w-4 h-4" />
                        </button>
                      )}
                      {submission.feedback && (
                        <button 
                          onClick={() => navigate(`/student/submissions/${submission.id}#feedback`)}
                          className="p-2 text-gray-600 hover:text-gray-800 transition-colors rounded-xl hover:bg-gray-200/50 transform hover:scale-110"
                          title="View Feedback"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {/* Due Date Warning */}
                  {submission.dueDate && new Date(submission.dueDate) < new Date() && submission.status === 'pending' && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-red-500/20 border border-red-400/30 rounded-xl mb-4">
                      <AlertCircle className="w-4 h-4 text-red-400" />
                      <span className="text-red-300 text-sm font-medium">Past due date</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination or Load More */}
        {filteredSubmissions.length > 3 && (
          <div className={`mt-8 text-center transform transition-all duration-1000 ${isAnimated ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`} style={{transitionDelay: '600ms'}}>
            <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-6">
              <p className="text-gray-700 mb-4">
                Showing {displayedSubmissions.length} of {filteredSubmissions.length} submissions
              </p>
              <button 
                onClick={() => setShowAll(!showAll)}
                className="group bg-gray-200/50 border border-gray-300 hover:bg-gray-300/70 text-gray-800 font-medium py-3 px-6 rounded-2xl transition-all duration-300 transform hover:scale-105 flex items-center gap-3 mx-auto"
              >
                <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                <span>{showAll ? 'Show Less' : 'Load More'}</span>
              </button>
            </div>
          </div>
        )}
        {/* Hidden input for resubmit */}
        <input
          ref={resubmitInputRef}
          type="file"
          className="hidden"
          onChange={handleResubmitFileChange}
          accept="*/*"
        />
      </div>
    </div>
  );
}