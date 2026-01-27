import { useState, useEffect } from "react";
import {
  Trophy, ArrowLeft, Star, TrendingUp, BarChart3,
  Calendar, Award, Target, Activity, CheckCircle, XCircle, Clock, AlertCircle
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";

interface Grade {
  id: number;
  assignmentId: number;
  assignmentTitle: string;
  course: string;
  grade: number;
  maxGrade: number;
  percentage: number;
  status: 'accepted' | 'pending' | 'rejected' | 'needs_revision';
  submittedAt: string;
  gradedAt?: string;
  feedback?: string;
}

interface GradeStats {
  totalAssignments: number;
  completedAssignments: number;
  averageGrade: number;
  highestGrade: number;
  lowestGrade: number;
  completionRate: number;
}

export default function Grades() {
  const [grades, setGrades] = useState<Grade[]>([]);
  const [stats, setStats] = useState<GradeStats>({
    totalAssignments: 0,
    completedAssignments: 0,
    averageGrade: 0,
    highestGrade: 0,
    lowestGrade: 0,
    completionRate: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const navigate = useNavigate();

  useEffect(() => {
    loadGrades();
  }, []);

  const loadGrades = async () => {
    try {
      setIsLoading(true);
      setError("");

      // Load submissions with grades (now includes grade data directly)
      const response = await api.get("/student/submissions");
      const submissions = response.data;

      // Helper: normalize backend status variations to our union
      const normalizeStatus = (raw: any): Grade["status"] => {
        const s = String(raw || "").toLowerCase();
        if (s === "approved") return "accepted";
        if (s === "needsrevision") return "needs_revision";
        if (s === "needs_revision") return "needs_revision";
        if (s === "accepted") return "accepted";
        if (s === "pending") return "pending";
        if (s === "rejected") return "rejected";
        return "pending";
      };

      // Transform submissions into grades with proper grade data
      const gradesData: Grade[] = submissions.map((sub: any) => {
        const maxG = Number(sub.maxGrade ?? sub.max_grade ?? 0);
        const gradeVal = Number(sub.grade || 0);
        return {
        id: sub.id,
        assignmentId: sub.assignmentId,
        assignmentTitle: sub.title || `Assignment ${sub.assignmentId}`,
        course: sub.course || "Dental Course",
        grade: gradeVal,
        maxGrade: maxG,
        percentage: maxG > 0 ? (gradeVal / maxG) * 100 : 0,
        status: normalizeStatus(sub.status),
        submittedAt: sub.submittedAt,
        gradedAt: sub.gradedAt,
        feedback: sub.feedback
      }});

      setGrades(gradesData);

      // Calculate stats with proper normalization
      // Use equal-weight average of per-submission percentages to avoid scale bias (40/50 vs 40/100)
      const gradedSubmissions = gradesData.filter(g => g.maxGrade > 0 && g.grade !== null && g.grade !== undefined);
      const acceptedSubmissions = gradesData.filter(g => g.status === 'accepted');
      const totalAssignments = gradesData.length;
      const completedAssignments = acceptedSubmissions.length;
      
      const percentages = gradedSubmissions.map(g => g.percentage);
      const averageGrade = percentages.length > 0
        ? percentages.reduce((a, b) => a + b, 0) / percentages.length
        : 0;
      const highestGrade = gradedSubmissions.length > 0
        ? Math.max(...gradedSubmissions.map(g => g.percentage))
        : 0;
      const lowestGrade = gradedSubmissions.length > 0
        ? Math.min(...gradedSubmissions.map(g => g.percentage))
        : 0;
      const completionRate = totalAssignments > 0
        ? (completedAssignments / totalAssignments) * 100
        : 0;

      setStats({
        totalAssignments,
        completedAssignments,
        averageGrade: Math.round(averageGrade),
        highestGrade: Math.round(highestGrade),
        lowestGrade: Math.round(lowestGrade),
        completionRate: Math.round(completionRate)
      });

    } catch (error: any) {
      console.error("Error loading grades:", error);
      setError("Failed to load grades. Please try again.");
      
      if (error.response?.status === 401) {
        localStorage.removeItem('token');
        navigate('/signin');
        return;
      }
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted':
        return 'text-emerald-400 bg-emerald-500/20 border-emerald-400/30';
      case 'pending':
        return 'text-amber-400 bg-amber-500/20 border-amber-400/30';
      case 'rejected':
        return 'text-red-400 bg-red-500/20 border-red-400/30';
      case 'needs_revision':
        return 'text-orange-400 bg-orange-500/20 border-orange-400/30';
      default:
        return 'text-gray-400 bg-gray-500/20 border-gray-400/30';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'accepted':
        return CheckCircle;
      case 'pending':
        return Clock;
      case 'rejected':
        return XCircle;
      case 'needs_revision':
        return AlertCircle;
      default:
        return Clock;
    }
  };

  const getGradeColor = (percentage: number) => {
    if (percentage >= 90) return 'text-emerald-500'; // Darker emerald for contrast
    if (percentage >= 80) return 'text-sky-600';     // Darker sky for contrast
    if (percentage >= 70) return 'text-yellow-600';   // Darker yellow for contrast
    if (percentage >= 60) return 'text-orange-600';   // Darker orange for contrast
    return 'text-red-600';                        // Darker red for contrast
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-200 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-sky-400 to-sky-600 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Trophy className="w-8 h-8 text-white" />
          </div>
          <p className="text-gray-800 font-medium">Loading grades...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-200 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-red-400 to-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-white" />
          </div>
          <p className="text-gray-800 font-medium mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-200">
      {/* Header */}
      <div className="bg-gray-200/10 backdrop-blur-md border-b border-gray-300">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/student/dashboard')}
                className="p-2 text-gray-800 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-300/70"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-sky-500 to-sky-600 rounded-xl flex items-center justify-center">
                  <Trophy className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-black text-gray-900">Academic Grades</h1>
                  <p className="text-sm text-gray-800">Track your academic performance</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-sky-500 to-sky-600 rounded-xl flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-white" />
              </div>
              <TrendingUp className="w-5 h-5 text-sky-500" />
            </div>
            <h3 className="text-2xl font-black text-gray-900 mb-1">{stats.averageGrade}%</h3>
            <p className="text-gray-800 text-sm font-medium">Average Grade</p>
            <div className="mt-3 flex items-center gap-2">
              <div className="w-2 h-2 bg-sky-500 rounded-full animate-pulse" />
              <span className="text-xs text-sky-400">Overall performance</span>
            </div>
          </div>

          <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-sky-500 to-sky-600 rounded-xl flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-white" />
              </div>
              <Award className="w-5 h-5 text-sky-500" />
            </div>
            <h3 className="text-2xl font-black text-gray-900 mb-1">{stats.completedAssignments}</h3>
            <p className="text-gray-800 text-sm font-medium">Completed</p>
            <div className="mt-3 flex items-center gap-2">
              <div className="w-2 h-2 bg-sky-500 rounded-full animate-pulse" />
              <span className="text-xs text-sky-400">Out of {stats.totalAssignments}</span>
            </div>
          </div>

          <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-sky-500 to-sky-600 rounded-xl flex items-center justify-center">
                <Star className="w-6 h-6 text-white" />
              </div>
              <TrendingUp className="w-5 h-5 text-sky-500" />
            </div>
            <h3 className="text-2xl font-black text-gray-900 mb-1">{stats.highestGrade}%</h3>
            <p className="text-gray-800 text-sm font-medium">Highest Grade</p>
            <div className="mt-3 flex items-center gap-2">
              <div className="w-2 h-2 bg-sky-500 rounded-full animate-pulse" />
              <span className="text-xs text-sky-400">Best performance</span>
            </div>
          </div>

          <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-sky-500 to-sky-600 rounded-xl flex items-center justify-center">
                <Target className="w-6 h-6 text-white" />
              </div>
              <Activity className="w-5 h-5 text-sky-500" />
            </div>
            <h3 className="text-2xl font-black text-gray-900 mb-1">{stats.completionRate}%</h3>
            <p className="text-gray-800 text-sm font-medium">Completion Rate</p>
            <div className="mt-3 flex items-center gap-2">
              <div className="w-2 h-2 bg-sky-500 rounded-full animate-pulse" />
              <span className="text-xs text-sky-400">Assignment progress</span>
            </div>
          </div>
        </div>

        {/* Grades List */}
        <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-r from-sky-500 to-sky-600 rounded-xl flex items-center justify-center">
                <Trophy className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-xl font-black text-gray-900">Assignment Grades</h2>
            </div>
          </div>

          {grades.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-24 h-24 bg-gray-300 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <Trophy className="w-12 h-12 text-gray-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">No grades yet</h3>
              <p className="text-gray-700">Submit assignments to see your grades</p>
            </div>
          ) : (
            <div className="space-y-4">
              {grades.map((grade) => {
                const StatusIcon = getStatusIcon(grade.status);
                return (
                  <div
                    key={grade.id}
                    className="bg-gray-100/70 backdrop-blur-sm rounded-2xl border border-gray-300 p-6 hover:bg-gray-200/70 transition-all duration-300 hover:scale-[1.02]"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900 mb-1">{grade.assignmentTitle}</h3>
                        <p className="text-gray-800 text-sm">{grade.course}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold ${getStatusColor(grade.status)}`}>
                          <StatusIcon className="w-3 h-3" />
                          <span className="capitalize">{grade.status.replace(/([A-Z])/g, ' $1').trim()}</span>
                        </div>
                        {grade.grade > 0 && (
                          <div className={`text-right ${getGradeColor(grade.percentage)}`}>
                            <div className="text-2xl font-black">{grade.grade}/{grade.maxGrade}</div>
                            <div className="text-xs opacity-75">{Math.round(grade.percentage)}%</div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 text-gray-700">
                          <Calendar className="w-4 h-4" />
                          <span>Submitted: {new Date(grade.submittedAt).toLocaleDateString()}</span>
                        </div>
                        {grade.gradedAt && (
                          <div className="flex items-center gap-2 text-gray-700">
                            <Star className="w-4 h-4" />
                            <span>Graded: {new Date(grade.gradedAt).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {grade.feedback && (
                      <div className="mt-4 p-4 bg-gray-100/50 rounded-xl border border-gray-300">
                        <p className="text-gray-800 text-sm italic">"{grade.feedback}"</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
