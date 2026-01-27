import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";

async function getMe() {
  try {
    const { data } = await api.get("/auth/me");
    return data;
  } catch {
    return null;
  }
}

export default function RoleLanding() {
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      // unify token lookup: prefer 'token', fallback to 'access_token' for legacy
      const token =
        localStorage.getItem("token") || localStorage.getItem("access_token");
      if (!token) return navigate("/signin", { replace: true });

      const me = await getMe();
      if (!me) return navigate("/signin", { replace: true });

      const role = String(me.role || "").toLowerCase();

      if (role === "admin")
        return navigate("/instructor/dashboard", { replace: true });
      if (role === "instructor" || role === "teacher" || role === "professor")
        return navigate("/instructor/dashboard", { replace: true });
      if (role === "student")
        return navigate("/student/dashboard", { replace: true });

      // fallback
      return navigate("/signin", { replace: true });
    })();
  }, [navigate]);

  return null;
}
