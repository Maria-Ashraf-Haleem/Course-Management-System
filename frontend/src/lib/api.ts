// src/lib/api.ts
import axios, {
  type AxiosInstance,
  type AxiosResponse,
  type AxiosError,
} from "axios";
import { getToken, clearToken } from "./auth";

/* ------------------------------- Base URL ------------------------------- */

const rawBase =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  "http://127.0.0.1:8000";
const API_BASE_URL = rawBase.replace(/\/+$/, ""); // strip trailing slash for clean joins

/* ----------------------------- Axios instance --------------------------- */

export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 1800000, // increased timeout to 30 minutes (1,800,000 ms) for long-running AI operations
  withCredentials: false, // we use Bearer token, not cookies
  headers: {
    Accept: "application/json",
  },
});

// Attach Bearer token automatically
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as any).Authorization = `Bearer ${token}`;
    // Log for debugging (only for AI generation endpoint)
    if (config.url?.includes('generate-questions')) {
      console.log("[API Interceptor] Setting Authorization header for AI generation");
      console.log("[API Interceptor] Token exists:", !!token, "Token length:", token.length);
    }
  } else {
    // Log if token is missing (only for AI generation endpoint)
    if (config.url?.includes('generate-questions')) {
      console.warn("[API Interceptor] WARNING: No token found for AI generation request!");
    }
  }
  return config;
});

// Centralized response handling
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    const status = error?.response?.status;
    const code = (error as any)?.code;

    // Network/timeout (backend down) — don't nuke session in dev
    if (!status || code === "ERR_NETWORK" || code === "ECONNABORTED") {
      if (!import.meta.env.PROD) {
        console.warn(
          "[api] Network/timeout error — suppressing sign-out in dev.",
          { code, status }
        );
      }
      return Promise.reject(error);
    }

    // Unauthorized
    if (status === 401) {
      if (!import.meta.env.PROD) {
        console.warn("[api] 401 in dev — NOT redirecting to /signin.");
        return Promise.reject(error);
      }
      clearToken();
      const p = window.location.pathname;
      if (p !== "/signin" && p !== "/signup") {
        window.location.replace("/signin");
      }
      return Promise.reject(error);
    }

    // Forbidden — surface as-is (do NOT redirect)
    if (status === 403 && !import.meta.env.PROD) {
      console.warn("[api] 403 (forbidden)"); // helpful while wiring roles on backend
    }

    return Promise.reject(error);
  }
);

/* ------------------------------- Utilities ------------------------------ */

/** Build absolute URL for downloads — accepts absolute or relative paths. */
export const fileUrl = (path?: string | null): string => {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path; // already absolute
  const clean = String(path).replace(/^\/+/, ""); // drop leading slashes
  return `${API_BASE_URL}/${clean}`;
};

/* ------------------------------- Student Management ------------------------------ */

export const createStudent = async (studentData: any) => {
  const response = await api.post("/student-management/students", studentData);
  return response.data;
};

export const getStudents = async (params?: any) => {
  const response = await api.get("/student-management/students", { 
    params: { limit: 1000, ...params } 
  });
  return response.data;
};

export const updateStudent = async (studentId: number, studentData: any) => {
  const response = await api.put(
    `/student-management/students/${studentId}`,
    studentData
  );
  return response.data;
};

export const deleteStudent = async (studentId: number) => {
  const response = await api.delete(
    `/student-management/students/${studentId}`
  );
  return response.data;
};

// DELETE /student-management/students/delete-all?scope=mine|all
export const deleteAllStudents = async (options?: { scope?: 'mine' | 'all' }) => {
  const scope = options?.scope || 'mine';
  const response = await api.delete(`/student-management/students-bulk-delete`, {
    params: { scope },
  });
  return response.data as { deleted_students: number; deleted_enrollments: number; deleted_submissions: number };
};

export const bulkImportStudents = async (file: File) => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await api.post(
    "/student-management/students/bulk-import",
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }
  );
  return response.data;
};

export const createAssignment = async (assignmentData: {
  title: string;
  description?: string;
  course_id: number; // New field
  deadline: string;
  max_grade: number;
}) => {
  const response = await api.post("/assignments", assignmentData);
  return response.data;
};

export const getAssignments = async (params?: any) => {
  const response = await api.get("/assignments", { params });
  return response.data;
};

export const generateQuestionsFromPDF = async (
  pdfFile: File,
  numQuestions: number,
  questionTypes: { mcq: boolean; trueFalse: boolean; shortAnswer: boolean },
  includeAnswers: boolean = false
) => {
  console.log("[API] generateQuestionsFromPDF called with:", { numQuestions, questionTypes });
  
  // Check if token exists
  const token = getToken();
  console.log("[API] Token exists:", !!token, "Token length:", token?.length || 0);
  if (!token) {
    throw new Error("Authentication token not found. Please log in again.");
  }
  
  const formData = new FormData();
  formData.append("pdf", pdfFile);
  
  // Verify FormData
  console.log("[API] FormData created:", {
    hasPdf: formData.has("pdf"),
    pdfFile: pdfFile.name,
    pdfSize: pdfFile.size,
    formDataType: formData.constructor.name
  });
  
  // Verify file is actually in FormData
  if (!formData.has("pdf")) {
    throw new Error("PDF file not found in FormData");
  }
  
  // Build query parameters
  const types = [];
  if (questionTypes.mcq) types.push("mcq");
  if (questionTypes.trueFalse) types.push("trueFalse");
  if (questionTypes.shortAnswer) types.push("shortAnswer");
  
  // Use axios params option - this works better with FormData
  console.log("[API] Sending request with params:", {
    num_questions: numQuestions,
    question_types: types.join(",")
  });
  
  // Use standard axios post with params option
  // Let axios automatically set Content-Type with boundary for FormData
  const response = await api.post(
    "/assignments/ai/generate-questions",
    formData,
    {
      timeout: 1800000, // 5 minutes timeout for AI generation
      params: {
        num_questions: numQuestions,
        question_types: types.join(","),
        include_answers: includeAnswers,
      },
      // Don't manually set Content-Type - axios will set it automatically with boundary
      // The interceptor will add Authorization: Bearer <token>
    }
  ).catch((error) => {
    console.error("[API] Request failed - Status:", error?.response?.status);
    console.error("[API] Request failed - Status Text:", error?.response?.statusText);
    console.error("[API] Request failed - Data:", error?.response?.data);
    console.error("[API] Request failed - Error Message:", error?.message);
    console.error("[API] Request failed - Request URL:", error?.config?.url);
    console.error("[API] Request failed - Full URL:", error?.config?.baseURL + error?.config?.url);
    console.error("[API] Request failed - Request Headers:", error?.config?.headers);
    console.error("[API] Request failed - Full Error:", error);
    
    // If it's a 404, provide helpful message
    if (error?.response?.status === 404) {
      console.error("[API] 404 Not Found - Route may not be registered. Please restart the backend server.");
      throw new Error(`Route not found: ${error?.config?.baseURL}${error?.config?.url}. Please ensure the backend server is running and has been restarted after code changes.`);
    }
    
    // If it's a 401, provide more specific error
    if (error?.response?.status === 401) {
      const authHeader = error?.config?.headers?.Authorization || error?.config?.headers?.authorization;
      console.error("[API] 401 Unauthorized - Auth header present:", !!authHeader);
      console.error("[API] 401 Unauthorized - Auth header value:", authHeader ? `${authHeader.substring(0, 20)}...` : "MISSING");
    }
    
    throw error;
  });
  return response.data;
};

/* ------------------------------- Course Management ------------------------------ */

export const createCourse = async (courseData: {
  title: string;
  description?: string;
  code: string;
}) => {
  const response = await api.post("/course-management/courses", courseData);
  return response.data;
};

export const getCourses = async (params?: any) => {
  const response = await api.get<any[]>("/course-management/courses", {
    params,
  });
  return response.data;
};

export const getDetailedCourses = async (params?: any) => {
  const response = await api.get<any[]>("/course-management/courses/detailed", {
    params,
  });
  return response.data;
};

// Course Enrollment APIs
export const enrollInCourse = async (enrollmentData: { course_id: number }) => {
  const response = await api.post(
    "/course-management/enrollments/self",
    enrollmentData
  );
  return response.data;
};

export const adminEnrollStudent = async (enrollmentData: {
  course_id: number;
  student_id: number;
}) => {
  const response = await api.post(
    "/course-management/enrollments",
    enrollmentData
  );
  return response.data;
};

export const getStudentEnrollments = async (studentId: number) => {
  const response = await api.get(
    `/course-management/enrollments/student/${studentId}`
  );
  return response.data;
};

export const getCourseEnrollments = async (courseId: number) => {
  const response = await api.get(
    `/course-management/enrollments/course/${courseId}`
  );
  return response.data;
};

// Enrollment requests (approval flow)
export const listPendingEnrollmentRequests = () =>
  api.get("/course-management/enrollments/pending");

export const approveEnrollmentRequest = (enrollmentId: number) =>
  api.post(`/course-management/enrollments/${enrollmentId}/approve`);

export const rejectEnrollmentRequest = (enrollmentId: number) =>
  api.post(`/course-management/enrollments/${enrollmentId}/reject`);

/* ------------------------------- Lectures & Attendance ------------------------------ */

// POST /course-management/courses/{course_id}/lectures
export const createLecture = (courseId: number, payload: {
  date: string; // ISO datetime string
  topic?: string;
  duration_minutes?: number;
}) => api.post(`/course-management/courses/${courseId}/lectures`, payload);

// GET /course-management/courses/{course_id}/lectures
export const listLectures = (courseId: number) =>
  api.get(`/course-management/courses/${courseId}/lectures`);

// POST /course-management/lectures/{lecture_id}/attendance
export const markLectureAttendance = (
  lectureId: number,
  marks: Array<{ student_id: number; status: string; notes?: string }>
) => api.post(`/course-management/lectures/${lectureId}/attendance`, { marks });

// GET /course-management/courses/{course_id}/attendance/summary
export const getCourseAttendanceSummary = (courseId: number) =>
  api.get(`/course-management/courses/${courseId}/attendance/summary`);

// GET /course-management/lectures/{lecture_id}/attendance
export const getLectureAttendance = (lectureId: number) =>
  api.get(`/course-management/lectures/${lectureId}/attendance`);

// PUT /course-management/lectures/{lecture_id}/attendance/{student_id}
export const setStudentAttendance = (
  lectureId: number,
  studentId: number,
  payload: { status: string; notes?: string }
) => api.put(`/course-management/lectures/${lectureId}/attendance/${studentId}`, payload);

// GET student-focused course details
export const getStudentCourseDetails = (courseId: number | string) =>
  api.get(`/course-management/courses/${courseId}/student-view`);

/* ------------------------------- Reports & Analytics ------------------------------ */

export const generateReport = async (reportData: any) => {
  const response = await api.post("/reports/generate", reportData);
  return response.data;
};

export const getAnalytics = async (period: string = "month", course_id?: number | string) => {
  const params: Record<string, any> = { period };
  if (course_id !== undefined && course_id !== null && String(course_id).length > 0) {
    params.course_id = course_id;
  }
  const response = await api.get("/instructor/analytics", { params });
  return response.data;
};

/* ------------------------------- Announcements ------------------------------ */

export const createAnnouncement = async (announcementData: any) => {
  const response = await api.post("/announcements", announcementData);
  return response.data;
};

export const getAnnouncements = async (params?: any) => {
  const response = await api.get("/announcements", { params });
  return response.data;
};

export const updateAnnouncement = async (id: number, announcementData: any) => {
  const response = await api.put(`/announcements/${id}`, announcementData);
  return response.data;
};

export const deleteAnnouncement = async (id: number) => {
  const response = await api.delete(`/announcements/${id}`);
  return response.data;
};

/** Small helper for x-www-form-urlencoded bodies */
const formBody = (
  data: Record<string, string | number | boolean | null | undefined>
) => {
  const u = new URLSearchParams();
  Object.entries(data).forEach(([k, v]) => {
    if (v !== undefined && v !== null) u.append(k, String(v));
  });
  return u;
};

/* --------------------------------- Types -------------------------------- */

export interface ApiResponse<T = any> {
  data: T;
}

export interface AuthTokenResponse {
  access_token: string;
  token_type?: string;
  // Optional extras if your backend returns them
  expires_in?: number;
  user?: any;
}

export interface UserResponse {
  id: number;
  username: string;
  email: string;
  full_name?: string;
  role: string; // "student" | "doctor" | "admin" (if any)
  created_at?: string;
}

export interface SignUpData {
  username: string;
  password: string;
  email: string;
  role: string; // "student" | "doctor" | "admin"
}

export interface SignInData {
  username: string;
  password: string;
}

/* --------------------------------- Auth --------------------------------- */

// POST /auth/login (form)
export const signIn = (payload: SignInData) =>
  api.post<AuthTokenResponse>(
    "/auth/login",
    formBody({
      username: payload.username,
      password: payload.password,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

// POST /auth/register (json)
export const signUp = (payload: SignUpData) =>
  api.post<UserResponse>("/auth/register", payload);

// GET /auth/me
export const getMe = () => api.get<UserResponse>("/auth/me");

// GET /auth/verify-token
export const verifyToken = () => api.get<UserResponse>("/auth/verify-token");

// POST /auth/refresh-token
export const refreshToken = () =>
  api.post<AuthTokenResponse>("/auth/refresh-token");

// Update current user basic profile (username/email). Does not touch doctor profile fields.
export const updateMe = (
  payload: Partial<{ username: string; email: string; full_name: string }>
) => api.put<UserResponse>("/auth/me", payload);

// Change password for current user
export const changePassword = (payload: {
  current_password: string;
  new_password: string;
}) => api.post("/auth/change-password", payload);

// Change password for current student user
export const changeMyPassword = (payload: {
  current_password: string;
  new_password: string;
}) => api.post("/student-profile/me/change-password", payload);

/* ------------------------------- Students -------------------------------- */

// NOTE: There is no `/students` router in the backend. Student-facing APIs live under `/student/*`.
// The previously declared `/students` helpers were removed to prevent accidental calls to non-existent routes.

/* ------------------------- Assignments / Tasks --------------------------- */

// ---- Assignments / Tasks (Doctor) ----
export const listAssignments = (params?: {
  status?: string;
  department?: string;
  q?: string;
}) => api.get("/assignments", { params });

// normalize fields to typical backend shapes
function buildAssignmentPayload(p: {
  title: string;
  description?: string;
  type_id?: number | string;
  department_id?: number | string;
  deadline?: string; // ISO datetime string expected by backend
  is_active?: boolean;
}) {
  const out: any = {};
  if (p.title) out.title = p.title;
  if (p.description != null) out.description = p.description;

  // backend expects numeric foreign keys: type_id, department_id
  if (p.type_id != null) out.type_id = Number(p.type_id);
  if (p.department_id != null) out.department_id = Number(p.department_id);

  // deadline field name matches backend
  if (p.deadline != null) out.deadline = p.deadline;

  if (p.is_active != null) out.is_active = p.is_active;
  return out;
}

export const updateAssignment = (
  id: number | string,
  payload: Partial<{
    title: string;
    description: string;
    department_id: number | string;
    type_id: number | string;
    deadline: string; // ISO datetime
    instructions: string;
    max_file_size_mb: number;
    is_active: boolean;
  }>
) => api.put(`/assignments/${id}`, buildAssignmentPayload(payload as any));

export const deleteAssignment = (id: number | string) =>
  api.delete(`/assignments/${id}`);
// Doctor: list all submissions for a given assignment
export const listAssignmentSubmissions = (
  assignment_id: number | string,
  extraParams: Record<string, any> = {}
) => {
  return api.get("/instructor/submissions", {
    params: { assignment_id, ...extraParams },
  });
};

/* --------------------------- Instructor / Reviews ---------------------------- */

// GET /instructor/submissions (with optional filters)
export const listInstructorSubmissions = (params?: {
  status_filter?: "Pending" | "Accepted" | "Rejected" | "NeedsRevision";
  student_id?: number | string;
  search?: string;
  include_feedback?: boolean;
  mine_only?: boolean;
}) => api.get("/instructor/submissions", { params });

// GET /instructor/submissions/{id}
export const getInstructorSubmission = (id: number | string) =>
  api.get(`/instructor/submissions/${id}`);

// POST /instructor/submissions/{id}/review
export const reviewInstructorSubmission = (
  id: number | string,
  payload: {
    status: "Accepted" | "Rejected" | "NeedsRevision";
    grade?: number;
    feedback_text?: string;
  }
) => api.post(`/instructor/submissions/${id}/review`, payload);

/* ----------------------------- Student side ------------------------------ */

// GET /student/submissions
export const fetchMySubmissions = () => api.get("/student/submissions");

// GET /student/submissions/{id}
export const fetchSubmissionById = (id: number | string) =>
  api.get(`/student/submissions/${id}`);

// POST /student/submissions  (FormData or JSON depending on backend)
export const createSubmission = (payload: FormData | any) =>
  api.post("/student/submissions", payload);

/* ------------------------------- Dashboard -------------------------------- */

// GET /dashboard/summary (role-aware)
export const getDashboardSummary = (params?: {
  from_date?: string;
  to_date?: string;
}) => api.get("/dashboard/summary", { params });

// GET /dashboard/recent/submissions
export const getDashboardRecentSubmissions = (params?: {
  mine_only?: boolean;
  limit?: number;
  offset?: number;
  search?: string;
}) => {
  const safeParams = { ...(params || {}) } as any;
  if (typeof safeParams.limit === "number") {
    safeParams.limit = Math.min(200, Math.max(1, safeParams.limit));
  }
  return api.get("/dashboard/recent/submissions", { params: safeParams });
};

// GET /submissions/{id}/file (admin/doctor) — use for downloads
export const downloadSubmissionFile = (
  submission_id: number | string,
  inline = false
) =>
  api.get(`/submissions/${submission_id}/file`, {
    params: { inline },
    responseType: "blob",
  });

/* --------------------------- Student endpoints ---------------------------- */

// GET /announcements/my (get announcements for students)
export const getStudentAnnouncements = (params?: {
  limit?: number;
  offset?: number;
}) => api.get("/announcements/my", { params });

// POST /announcements/{id}/mark-read (mark announcement as read)
export const markAnnouncementAsRead = (announcementId: number) => 
  api.post(`/announcements/${announcementId}/mark-read`);

// POST /announcements/mark-all-read (mark all announcements as read)
export const markAllAnnouncementsAsRead = () => 
  api.post("/announcements/mark-all-read");

/* --------------------------- Student Profile ---------------------------- */

// GET /student-profile/{student_id} or /student-profile/me
// Note: Use "me" to get the current student's profile
export const getStudentProfile = (studentId: number | string) =>
  api.get(`/student-profile/${studentId}`);

// PUT /student-profile/{student_id} or /student-profile/me
// Note: Use "me" to update the current student's profile
export const updateStudentProfile = (studentId: number | string, data: any) =>
  api.put(`/student-profile/${studentId}`, data);

/* --------------------------- Instructor Profile ---------------------------- */

// GET /instructor-profile/{instructor_id} or /instructor-profile/me for current instructor
export const getInstructorProfile = (instructorId?: number | string) =>
  api.get(
    instructorId
      ? `/instructor/profile/${instructorId}`
      : `/instructor/profile/me`
  );

// PUT /instructor-profile/{instructor_id} or /instructor-profile/me for current instructor
export const updateInstructorProfile = (
  data: any,
  instructorId?: number | string
) =>
  api.put(
    instructorId
      ? `/instructor/profile/${instructorId}`
      : `/instructor/profile/me`,
    data
  );

/* --------------------------- Departments (for selects) --------------------------- */
export const listDepartments = (params?: { include_inactive?: boolean }) =>
  api.get("/departments", { params }).then((response) => {
    // Ensure the response data is always an array, even if the backend returns a single item
    return Array.isArray(response.data) ? response.data : [response.data];
  });

// GET /instructor/stats - Get instructor statistics (students, courses, etc.)
export const getInstructorStats = () => api.get("/instructor/stats");

// GET /instructor/recent-activity - Get recent activity for instructor
export const getInstructorRecentActivity = () =>
  api.get("/instructor/recent-activity");

// GET /student-profile/{student_id}/academic-info
export const getStudentAcademicInfo = (studentId: number | string) =>
  api.get(`/student-profile/${studentId}/academic-info`);

// POST /student-profile/{student_id}/update-gpa
export const updateStudentGpa = (studentId: number | string, gpa: number) =>
  api.post(`/student-profile/${studentId}/update-gpa`, { gpa });

/* --------------------------- Student Attendance ---------------------------- */

// GET /student-profile/{student_id}/attendance
export const getStudentAttendance = (studentId: number | string) =>
  api.get(`/student-profile/${studentId}/attendance`);

// GET /student-profile/{student_id}/rank?period=month
export const getStudentRank = (studentId: number | string, period: string = "month") =>
  api.get(`/student-profile/${studentId}/rank`, { params: { period } });

/* --------------------------- Data Export ---------------------------- */

// GET /instructor/export/students - Export students data to Excel/CSV
export const exportStudentsData = (params?: {
  format?: "csv" | "excel";
  include_grades?: boolean;
  include_assignments?: boolean;
  course_id?: number | string; // optional filter to export a single course's students
}) => {
  const searchParams = new URLSearchParams();
  if (params?.format) searchParams.append("format", params.format);
  if (params?.include_grades !== undefined) searchParams.append("include_grades", params.include_grades.toString());
  if (params?.include_assignments !== undefined) searchParams.append("include_assignments", params.include_assignments.toString());
  if (params?.course_id !== undefined && params?.course_id !== null) searchParams.append("course_id", String(params.course_id));
  
  return api.get(`/instructor/export/students?${searchParams.toString()}`, {
    responseType: "blob",
    // Override default Accept header for binary
    headers: { Accept: "*/*" },
  });
};

// GET /instructor/export/assignments - Export assignments data to Excel/CSV
export const exportAssignmentsData = (params?: {
  format?: "csv" | "excel";
  include_submissions?: boolean;
}) => {
  const searchParams = new URLSearchParams();
  if (params?.format) searchParams.append("format", params.format);
  if (params?.include_submissions !== undefined) searchParams.append("include_submissions", params.include_submissions.toString());
  
  return api.get(`/instructor/export/assignments?${searchParams.toString()}`, {
    responseType: "blob",
  });
};

/* --------------------------- Instructor Schedule ---------------------------- */

export type ScheduleType = "class" | "office_hours" | "meeting" | "exam";
export type ScheduleStatus = "scheduled" | "completed" | "cancelled";

export interface ScheduleItem {
  id: number;
  title: string;
  type: ScheduleType;
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
  date: string;      // ISO string
  location: string;
  description?: string;
  attendees?: number;
  status: ScheduleStatus;
}

// GET /instructor/schedule?date=YYYY-MM-DD
export const listInstructorSchedule = (params?: { date?: string }) =>
  api.get<ScheduleItem[]>("/instructor/schedule", { params });

// POST /instructor/schedule
export const createInstructorSchedule = (payload: {
  title: string;
  type: ScheduleType;
  date: string; // ISO datetime string, e.g., 2025-09-18T00:00:00
  startTime: string;
  endTime: string;
  location: string;
  description?: string;
  attendees?: number;
  status?: ScheduleStatus;
}) => api.post<ScheduleItem>("/instructor/schedule", payload);

// PUT /instructor/schedule/{id}
export const updateInstructorSchedule = (
  id: number,
  payload: Partial<{
    title: string;
    type: ScheduleType;
    date: string; // ISO datetime string
    startTime: string;
    endTime: string;
    location: string;
    description?: string;
    attendees?: number;
    status?: ScheduleStatus;
  }>
) => api.put<ScheduleItem>(`/instructor/schedule/${id}`, payload);

// DELETE /instructor/schedule/{id}
export const deleteInstructorSchedule = (id: number) =>
  api.delete<{ ok: boolean }>(`/instructor/schedule/${id}`);

/* --------------------------- Instructor Quiz Entries ---------------------------- */

// POST /instructor/quiz-entries
export const createQuizEntry = (payload: {
  student_id: number;
  title: string;
  quiz_date?: string; // ISO string e.g. 2025-10-03
  course_id?: number | string;
  max_grade?: number;
  grade?: number;
  notes?: string;
}) => api.post("/instructor/quiz-entries", payload);

// GET /instructor/quiz-entries
export const listQuizEntries = (params?: { student_id?: number | string; course_id?: number | string }) =>
  api.get("/instructor/quiz-entries", { params });

// DELETE /instructor/quiz-entries/{id}
export const deleteQuizEntry = (id: number | string) =>
  api.delete(`/instructor/quiz-entries/${id}`);
