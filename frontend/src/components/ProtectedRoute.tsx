import { Navigate, useLocation } from "react-router-dom";
import { isAuthed, getRole, type UserRole } from "../lib/auth";

type Props = { children: React.ReactElement; allowedRoles?: UserRole[] };

const roleHome: Record<UserRole, string> = {
  student: "/student/dashboard",
  doctor: "/doctor/dashboard",
  admin: "/admin/dashboard",
  instructor: "/instructor/dashboard",
};

export default function ProtectedRoute({ children, allowedRoles }: Props) {
  const location = useLocation();

  if (!isAuthed()) {
    return <Navigate to="/signin" replace state={{ from: location }} />;
  }

  if (allowedRoles?.length) {
    const role = getRole();
    if (!role || !allowedRoles.includes(role)) {
      return <Navigate to={role ? roleHome[role] : "/signin"} replace />;
    }
  }

  return children;
}
