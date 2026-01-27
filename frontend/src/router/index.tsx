import { createHashRouter, Navigate } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";

/* Auth */
import SignIn from "../pages/auth/SignIn";
import SignUp from "../pages/auth/SignUp";
import RoleLanding from "../pages/auth/RoleLanding";

/* Instructor */
import InstructorDashboard from "../pages/instructor/Dashboard";
import InstructorStudents from "../pages/instructor/Students";
import StudentsList from "../pages/instructor/StudentsList";
import InstructorTasks from "../pages/instructor/Tasks";
import StudentForm from "../pages/instructor/StudentForm"; // Changed from AddStudent
import CreateCourse from "../pages/instructor/CreateCourse";
import Courses from "../pages/instructor/Courses";
import CourseDetail from "../pages/instructor/CourseDetail";
import CourseEdit from "../pages/instructor/CourseEdit";
import CreateAssignment from "../pages/instructor/CreateAssignment";
import Reports from "../pages/instructor/Reports";
import Announcements from "../pages/instructor/Announcements";
import Analytics from "../pages/instructor/Analytics";
import Settings from "../pages/instructor/Settings";
import AccountSettings from "../pages/instructor/AccountSettings";
import InstructorProfile from "../pages/instructor/Profile";
import PendingEnrollments from "../pages/instructor/PendingEnrollments";
import Schedule from "../pages/instructor/Schedule";
import EditEducation from "../pages/instructor/EditEducation";

import InstructorNotifications from "../pages/instructor/Notifications";
import SubmissionView from "../pages/instructor/SubmissionView";
import SubmissionEdit from "../pages/instructor/SubmissionEdit";
import QuizEntry from "../pages/instructor/QuizEntry";

/* Student */
import StudentDashboard from "../pages/student/Dashboard";
import StudentSubmissions from "../pages/student/Submissions";
import SubmissionDetail from "../pages/student/SubmissionDetail";
import StudentNotifications from "../pages/student/Notifications";
import StudentSettings from "../pages/student/Settings";
import StudentGrades from "../pages/student/Grades";
import StudentCourses from "../pages/student/Courses";
import CourseDetails from "../pages/student/CourseDetails";
import StudentAnalysis from "../pages/student/Analysis";

const router = createHashRouter([
  { path: "/", element: <Navigate to="/signin" replace /> },
  { path: "/signin", element: <SignIn /> },
  { path: "/signup", element: <SignUp /> },
  { path: "/role", element: <RoleLanding /> },

  {
    path: "/instructor/dashboard",
    element: (
      <ProtectedRoute allowedRoles={["instructor", "admin"]}>
        <InstructorDashboard />
      </ProtectedRoute>
    ),
  },
  {
    path: "/instructor/students",
    element: (
      <ProtectedRoute allowedRoles={["instructor", "admin"]}>
        <StudentsList />
      </ProtectedRoute>
    ),
  },
  {
    path: "/instructor/student",
    element: (
      <ProtectedRoute allowedRoles={["instructor", "admin"]}>
        <InstructorStudents />
      </ProtectedRoute>
    ),
  },
  {
    path: "/instructor/tasks",
    element: (
      <ProtectedRoute allowedRoles={["instructor", "admin"]}>
        <InstructorTasks />
      </ProtectedRoute>
    ),
  },
  {
    path: "/instructor/students/new", // Changed path for adding new student
    element: (
      <ProtectedRoute allowedRoles={["instructor", "admin"]}>
        <StudentForm />
      </ProtectedRoute>
    ),
  },
  {
    path: "/instructor/students/edit/:studentId", // New path for editing student
    element: (
      <ProtectedRoute allowedRoles={["instructor", "admin"]}>
        <StudentForm />
      </ProtectedRoute>
    ),
  },
  {
    path: "/instructor/courses",
    element: (
      <ProtectedRoute allowedRoles={["instructor", "admin"]}>
        <Courses />
      </ProtectedRoute>
    ),
  },
  {
    path: "/instructor/courses/create",
    element: (
      <ProtectedRoute allowedRoles={["instructor", "admin"]}>
        <CreateCourse />
      </ProtectedRoute>
    ),
  },
  {
    path: "/instructor/courses/:courseId",
    element: (
      <ProtectedRoute allowedRoles={["instructor", "admin"]}>
        <CourseDetail />
      </ProtectedRoute>
    ),
  },
  {
    path: "/instructor/courses/:courseId/edit",
    element: (
      <ProtectedRoute allowedRoles={["instructor", "admin"]}>
        <CourseEdit />
      </ProtectedRoute>
    ),
  },
  {
    path: "/instructor/create-assignment",
    element: (
      <ProtectedRoute allowedRoles={["instructor", "admin"]}>
        <CreateAssignment />
      </ProtectedRoute>
    ),
  },
  {
    path: "/instructor/quiz-entry",
    element: (
      <ProtectedRoute allowedRoles={["instructor", "admin"]}>
        <QuizEntry />
      </ProtectedRoute>
    ),
  },
  {
    path: "/instructor/reports",
    element: (
      <ProtectedRoute allowedRoles={["instructor", "admin"]}>
        <Reports />
      </ProtectedRoute>
    ),
  },
  {
    path: "/instructor/announcements",
    element: (
      <ProtectedRoute allowedRoles={["instructor", "admin"]}>
        <Announcements />
      </ProtectedRoute>
    ),
  },
  {
    path: "/instructor/pending-enrollments",
    element: (
      <ProtectedRoute allowedRoles={["instructor", "admin"]}>
        <PendingEnrollments />
      </ProtectedRoute>
    ),
  },
  {
    path: "/instructor/schedule",
    element: (
      <ProtectedRoute allowedRoles={["instructor", "admin"]}>
        <Schedule />
      </ProtectedRoute>
    ),
  },
  {
    path: "/instructor/edit-education",
    element: (
      <ProtectedRoute allowedRoles={["instructor", "admin"]}>
        <EditEducation />
      </ProtectedRoute>
    ),
  },

  {
    path: "/instructor/notifications",
    element: (
      <ProtectedRoute allowedRoles={["instructor", "admin"]}>
        <InstructorNotifications />
      </ProtectedRoute>
    ),
  },
  {
    path: "/instructor/analytics",
    element: (
      <ProtectedRoute allowedRoles={["instructor", "admin"]}>
        <Analytics />
      </ProtectedRoute>
    ),
  },
  {
    path: "/instructor/settings",
    element: (
      <ProtectedRoute allowedRoles={["instructor", "admin"]}>
        <Settings />
      </ProtectedRoute>
    ),
  },
  {
    path: "/instructor/account-settings",
    element: (
      <ProtectedRoute allowedRoles={["instructor", "admin"]}>
        <AccountSettings />
      </ProtectedRoute>
    ),
  },
  {
    path: "/instructor/profile",
    element: (
      <ProtectedRoute allowedRoles={["instructor", "admin"]}>
        <InstructorProfile />
      </ProtectedRoute>
    ),
  },
  {
    path: "/instructor/submissions/:id",
    element: (
      <ProtectedRoute allowedRoles={["instructor", "admin"]}>
        <SubmissionView />
      </ProtectedRoute>
    ),
  },
  {
    path: "/instructor/submissions/:id/edit",
    element: (
      <ProtectedRoute allowedRoles={["instructor", "admin"]}>
        <SubmissionEdit />
      </ProtectedRoute>
    ),
  },

  {
    path: "/student/dashboard",
    element: (
      <ProtectedRoute allowedRoles={["student"]}>
        <StudentDashboard />
      </ProtectedRoute>
    ),
  },
  {
    path: "/student/submissions",
    element: (
      <ProtectedRoute allowedRoles={["student"]}>
        <StudentSubmissions />
      </ProtectedRoute>
    ),
  },
  {
    path: "/student/submissions/:id",
    element: (
      <ProtectedRoute allowedRoles={["student"]}>
        <SubmissionDetail />
      </ProtectedRoute>
    ),
  },
  {
    path: "/student/notifications",
    element: (
      <ProtectedRoute allowedRoles={["student"]}>
        <StudentNotifications />
      </ProtectedRoute>
    ),
  },
  {
    path: "/student/settings",
    element: (
      <ProtectedRoute allowedRoles={["student"]}>
        <StudentSettings />
      </ProtectedRoute>
    ),
  },
  {
    path: "/student/grades",
    element: (
      <ProtectedRoute allowedRoles={["student"]}>
        <StudentGrades />
      </ProtectedRoute>
    ),
  },
  {
    path: "/student/analysis",
    element: (
      <ProtectedRoute allowedRoles={["student"]}>
        <StudentAnalysis />
      </ProtectedRoute>
    ),
  },
  {
    path: "/student/courses",
    element: (
      <ProtectedRoute allowedRoles={["student"]}>
        <StudentCourses />
      </ProtectedRoute>
    ),
  },
  {
    path: "/student/courses/:courseId",
    element: (
      <ProtectedRoute allowedRoles={["student"]}>
        <CourseDetails />
      </ProtectedRoute>
    ),
  },

  { path: "*", element: <div style={{ padding: 24 }}>404</div> },
]);

export default router;
