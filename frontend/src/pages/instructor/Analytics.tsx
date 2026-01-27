import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  TrendingUp,
  Users,
  FileText,
  Award,
  BarChart3,
  PieChart,
  Activity,
  AlertCircle,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { getAnalytics, getDashboardSummary } from "../../lib/api";

export default function Analytics() {
  const navigate = useNavigate();
  const [selectedPeriod, setSelectedPeriod] = useState("month");
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [analyticsData, setAnalyticsData] = useState<any>({
    overview: {
      totalStudents: 0,
      activeAssignments: 0,
      totalSubmissions: 0,
      averageGrade: 0,
    },
    submissions: {
      labels: [],
      data: [],
    },
    grades: {
      excellent: 0,
      good: 0,
      average: 0,
      below: 0,
    },
    performance: {
      labels: [],
      data: [],
    },
    topStudents: [],
    submissionTrends: [],
    gradeDistribution: [],
    coursePerformance: [],
    studentProgress: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [instructorCourses, setInstructorCourses] = useState<any[]>([]);

  // Display-friendly labels for grade buckets (robust against backend variants)
  const gradeLabel = (name?: string) => {
    const raw = String(name || "");
    const key = raw.toLowerCase();
    if (key.includes("excellent")) return "Excellent (90-100%)";
    if (key.includes("good")) return "Good (70-89%)";
    if (key.includes("average") && !key.includes("below")) return "Average (60-69%)";
    if (key.includes("below")) return "Below (<60%)";
    return raw || "Unknown";
  };

  useEffect(() => {
    loadAnalytics();
  }, [selectedPeriod, selectedCourseId]);

  // Load instructor courses for right-side navbar
  useEffect(() => {
    const loadCourses = async () => {
      try {
        const { data: summary } = await getDashboardSummary().catch(() => ({ data: null } as any));
        const details = summary?.cards?.my_courses_summary?.courses_details;
        if (Array.isArray(details)) setInstructorCourses(details);
      } catch (_) {}
    };
    loadCourses();
  }, []);

  const loadAnalytics = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await getAnalytics(selectedPeriod, selectedCourseId ?? undefined);
      console.log("Analytics API response:", response);

      // Start with raw pieces
      const rawOverview = response?.overview || {
        totalStudents: 0,
        activeAssignments: 0,
        totalSubmissions: 0,
        averageGrade: 0,
      };
      const rawGradeDist = Array.isArray(response?.gradeDistribution)
        ? response.gradeDistribution
        : [];
      const top = Array.isArray(response?.topStudents) ? response.topStudents : [];

      // Derive Grade Distribution from Top Performers grades when available
      const toPercent = (g: any): number => {
        let p: number;
        if (typeof g === 'number') p = g <= 10 ? g * 10 : g;
        else {
          const s = String(g).trim();
          if (s.endsWith('%')) p = Number(s.replace('%', '').trim()) || 0;
          else {
            const n = Number(s);
            p = !Number.isNaN(n) ? (n <= 10 ? n * 10 : n) : 0;
          }
        }
        if (!Number.isFinite(p)) p = 0;
        // Clamp to 0-100 to avoid stray values
        p = Math.max(0, Math.min(100, p));
        // Floor to avoid float edge cases (e.g., 69.999 -> 69)
        return Math.floor(p);
      };
      let derivedGradeDist: any[] = rawGradeDist.map((e: any) => ({ ...e }));
      if (top.length > 0) {
        let buckets = {
          excellent: 0,
          good: 0,
          average: 0,
          below: 0,
        };
        for (const s of top) {
          const p = toPercent((s as any)?.grade);
          if (p >= 90) buckets.excellent += 1;
          else if (p >= 70) buckets.good += 1;
          else if (p >= 60) buckets.average += 1;
          else buckets.below += 1;
        }
        // Build chart-friendly array with colors
        derivedGradeDist = [
          { name: 'Excellent', value: buckets.excellent, color: '#22c55e' },
          { name: 'Good', value: buckets.good, color: '#3b82f6' },
          { name: 'Average', value: buckets.average, color: '#f59e0b' },
          { name: 'Below', value: buckets.below, color: '#ef4444' },
        ];
      }

      const safeData = {
        overview: {
          ...rawOverview,
          // Ensure averageGrade is an integer percent for display
          averageGrade: Math.round(Number(rawOverview.averageGrade || 0)),
        },
        submissionTrends: response?.submissionTrends || [],
        gradeDistribution: derivedGradeDist,
        coursePerformance: response?.coursePerformance || [],
        topStudents: response?.topStudents || [],
        // Legacy format for compatibility
        submissions: { labels: [], data: [] },
        grades: { excellent: 0, good: 0, average: 0, below: 0 },
        performance: { labels: [], data: [] },
      };

      setAnalyticsData(safeData);
    } catch (err) {
      console.error("Error loading analytics:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load analytics data";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };


  const periods = [
    { value: "week", label: "This Week" },
    { value: "month", label: "This Month" },
    { value: "quarter", label: "This Quarter" },
    { value: "year", label: "This Year" },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-200 text-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500 mx-auto mb-4"></div>
          <p className="text-gray-800">Loading analytics...</p>
        </div>
      </div>
    );
  }

  // Note: Grade Distribution shows counts; labels are normalized to 0–100% ranges via gradeLabel()

  return (
    <div className="min-h-screen bg-gray-200 text-gray-900">
      {/* Top Course Navigation Bar */}
      <div className="bg-gray-100/90 backdrop-blur-xl border-b border-gray-300 shadow-lg sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate("/instructor/dashboard")}
                className="p-2 text-gray-800 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-300/70"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
            <div>
              <h1 className="text-3xl font-black text-gray-900">Analytics Dashboard</h1>
              <p className="text-gray-800">
                {selectedCourseId 
                  ? `Analytics for ${instructorCourses.find(c => Number(c.course_id) === selectedCourseId)?.title || 'Selected Course'}`
                  : 'Comprehensive insights into your courses and students'
                }
              </p>
            </div>
            </div>

            {/* Period Selector */}
            <div className="flex bg-gray-100/70 rounded-xl p-1 border border-gray-300">
              {periods.map((period) => (
                <button
                  key={period.value}
                  onClick={() => setSelectedPeriod(period.value)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                    selectedPeriod === period.value
                      ? "bg-sky-500 text-white shadow-md"
                      : "text-gray-800 hover:text-gray-900 hover:bg-gray-200/70"
                  }`}
                >
                  {period.label}
                </button>
              ))}
            </div>
          </div>

          {/* Course Navigation */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
            <div className="text-sm font-bold text-gray-900 mr-4 flex-shrink-0 hidden sm:block">Courses:</div>
            <div className="flex gap-2 min-w-max">
              <button
                onClick={() => setSelectedCourseId(null)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 whitespace-nowrap ${
                  selectedCourseId == null
                    ? "bg-gradient-to-r from-sky-500 to-sky-600 text-white shadow-lg transform scale-105"
                    : "bg-gray-200/70 text-gray-800 hover:text-gray-900 hover:bg-gray-300/70 hover:shadow-md"
                }`}
                title="All courses"
              >
                📊 Main Analytics
              </button>
              {instructorCourses.map((c) => (
                <button
                  key={c.course_id}
                  onClick={() => setSelectedCourseId(Number(c.course_id))}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 whitespace-nowrap ${
                    selectedCourseId === Number(c.course_id)
                      ? "bg-gradient-to-r from-sky-500 to-sky-600 text-white shadow-lg transform scale-105"
                      : "bg-gray-200/70 text-gray-800 hover:text-gray-900 hover:bg-gray-300/70 hover:shadow-md"
                  }`}
                  title={`${c.title} (${c.code})`}
                >
                  📚 {(c.code || c.title) ?? `Course ${c.course_id}`}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">

        {/* Error Display */}
        {error && (
          <div className="mb-8 bg-red-100 border border-red-400 rounded-2xl p-6 flex items-center gap-4">
            <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0" />
            <div>
              <h3 className="text-red-800 font-semibold">
                Error Loading Analytics
              </h3>
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          </div>
        )}

        {/* Course Filter Indicator */}
        {selectedCourseId && (
          <div className="mb-6 bg-gradient-to-r from-sky-100 to-blue-100 border border-sky-300 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-8 h-8 bg-sky-500 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-bold">📚</span>
            </div>
            <div>
              <h3 className="text-sky-800 font-bold">
                Showing data for: {instructorCourses.find(c => Number(c.course_id) === selectedCourseId)?.title}
              </h3>
              <p className="text-sky-700 text-sm">
                Course Code: {instructorCourses.find(c => Number(c.course_id) === selectedCourseId)?.code}
              </p>
            </div>
          </div>
        )}

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 mt-6">
          <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-700 text-sm">
                  {selectedCourseId ? 'Course Students' : 'Total Students'}
                </p>
                <p className="text-3xl font-black text-gray-900">
                  {analyticsData.overview.totalStudents}
                </p>
              </div>
              <div className="w-12 h-12 bg-sky-100 rounded-xl flex items-center justify-center shadow-lg">
                <Users className="w-6 h-6 text-sky-600" />
              </div>
            </div>
          </div>

          <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-700 text-sm">
                  {selectedCourseId ? 'Course Assignments' : 'Active Assignments'}
                </p>
                <p className="text-3xl font-black text-gray-900">
                  {analyticsData.overview.activeAssignments}
                </p>
              </div>
              <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center shadow-lg">
                <FileText className="w-6 h-6 text-emerald-600" />
              </div>
            </div>
          </div>

          <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-700 text-sm">
                  {selectedCourseId ? 'Course Submissions' : 'Total Submissions'}
                </p>
                <p className="text-3xl font-black text-gray-900">
                  {analyticsData.overview.totalSubmissions}
                </p>
              </div>
              <div className="w-12 h-12 bg-sky-100 rounded-xl flex items-center justify-center shadow-lg">
                <Activity className="w-6 h-6 text-sky-600" />
              </div>
            </div>
          </div>

          <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-700 text-sm">
                  {selectedCourseId ? 'Course Avg Grade' : 'Average Grade'}
                </p>
                <p className="text-3xl font-black text-gray-900">
                  {analyticsData.overview.averageGrade}
                </p>
              </div>
              <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center shadow-lg">
                <Award className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Submission Trends Chart */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <TrendingUp className="h-5 w-5 mr-2 text-blue-600" />
              {selectedCourseId ? 'Course Submission & Review Trends' : 'Submission & Review Trends'}
            </h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analyticsData.submissionTrends}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="submissions" 
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    name="Submissions"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="reviews" 
                    stroke="#10b981" 
                    strokeWidth={2}
                    name="Reviews"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Student Engagement Overview */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Users className="h-5 w-5 mr-2 text-purple-600" />
              {selectedCourseId ? 'Course Student Engagement' : 'Student Engagement'}
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <Users className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Active Students</p>
                    <p className="text-sm text-gray-600">Students with submissions</p>
                  </div>
                </div>
                <span className="text-2xl font-bold text-blue-600">
                  {analyticsData.topStudents.length}
                </span>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <FileText className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Avg Submissions</p>
                    <p className="text-sm text-gray-600">Per active student</p>
                  </div>
                </div>
                <span className="text-2xl font-bold text-green-600">
                  {analyticsData.topStudents.length > 0 
                    ? Math.round(analyticsData.topStudents.reduce((sum: number, student: any) => sum + student.submissions, 0) / analyticsData.topStudents.length)
                    : 0
                  }
                </span>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                    <Award className="w-5 h-5 text-yellow-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Completion Rate</p>
                    <p className="text-sm text-gray-600">Students participating</p>
                  </div>
                </div>
                <span className="text-2xl font-bold text-yellow-600">
                  {analyticsData.overview.totalStudents > 0 
                    ? Math.round((analyticsData.topStudents.length / analyticsData.overview.totalStudents) * 100)
                    : 0
                  }%
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Grade Distribution */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <PieChart className="h-5 w-5 mr-2 text-green-600" />
              {selectedCourseId ? 'Course Grade Distribution' : 'Grade Distribution'}
            </h3>
            {/* Button-style legend with counts */}
            <div className="flex flex-wrap gap-2 mb-4">
              {Array.isArray(analyticsData.gradeDistribution) && analyticsData.gradeDistribution.map((entry: any, idx: number) => (
                <span
                  key={idx}
                  className="px-3 py-1.5 rounded-full text-sm font-medium border"
                  style={{
                    borderColor: entry.color || '#94a3b8',
                    background: '#f8fafc',
                    color: '#0f172a',
                  }}
                  title={`${gradeLabel(entry.name)}: ${entry.value}`}
                >
                  {gradeLabel(entry.name)}: {entry.value}
                </span>
              ))}
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={analyticsData.gradeDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={false}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {analyticsData.gradeDistribution.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any, name: any) => {
                    const num = typeof value === 'number' ? value : Number(value);
                    return [num, gradeLabel(String(name))];
                  }} />
                </RechartsPieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Course Performance */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <BarChart3 className="h-5 w-5 mr-2 text-purple-600" />
              {selectedCourseId ? 'Course Performance Details' : 'Course Performance'}
            </h3>
            <div className="h-96" style={{ height: '28rem' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analyticsData.coursePerformance} margin={{ bottom: 120, left: 10, right: 10, top: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="course"
                    interval={0}
                    angle={-30}
                    textAnchor="end"
                    height={120}
                    tick={{ fontSize: 12 }}
                    tickMargin={12}
                  />
                  <YAxis
                    yAxisId="left"
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="avgGrade" fill="#8b5cf6" name="Avg Grade %" />
                  <Bar yAxisId="right" dataKey="completion" fill="#10b981" name="Completion %" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-1 gap-8">
          {/* Top Performers */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Award className="h-5 w-5 mr-2 text-yellow-600" />
              {selectedCourseId ? 'Course Top Performers' : 'Top Performers'}
            </h3>
            <div className="space-y-4">
              {analyticsData.topStudents.length > 0 ? (
                analyticsData.topStudents.map((student: any, index: number) => (
                  <div
                    key={student.name}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          index === 0
                            ? "bg-yellow-500 text-black"
                            : index === 1
                            ? "bg-gray-400 text-black"
                            : index === 2
                            ? "bg-amber-600 text-white"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{student.name}</p>
                        <p className="text-xs text-gray-700">
                          {student.submissions} submissions
                        </p>
                      </div>
                    </div>
                    <span className="text-lg font-bold text-sky-600">
                      {typeof student.grade === 'number'
                        ? `${student.grade}%`
                        : (String(student.grade).trim().endsWith('%')
                            ? String(student.grade)
                            : `${student.grade}%`)
                      }
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-700">
                  <Award className="w-12 h-12 mx-auto mb-2 opacity-50 text-gray-600" />
                  <p>No student performance data available</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
