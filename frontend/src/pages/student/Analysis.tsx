import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import {
  ArrowLeft,
  BookOpen,
  BarChart3,
  PieChart,
  TrendingUp,
  Star,
  FileText,
} from "lucide-react";

interface Submission {
  id: number;
  title: string;
  course?: string;
  submittedAt: string;
  status: string; // pending | accepted | rejected | needsrevision | approved
  grade?: number | null;
  maxGrade?: number | null;
}

export default function StudentAnalysis() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  // Plotly containers
  const lineRef = useRef<HTMLDivElement | null>(null);
  const pieRef = useRef<HTMLDivElement | null>(null);
  const barCourseRef = useRef<HTMLDivElement | null>(null);
  const barAvgRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        setError("");
        const res = await api.get("/student/submissions");
        const mapped: Submission[] = (res.data || []).map((s: any) => ({
          id: s.id,
          title: s.title || `Assignment ${s.assignmentId}`,
          course: s.course || "Course",
          submittedAt: s.submittedAt,
          status: String(s.status || "pending").toLowerCase(),
          grade: s.grade ?? null,
          maxGrade: s.maxGrade ?? s.max_grade ?? null,
        }));
        setSubmissions(mapped);
      } catch (e: any) {
        console.error(e);
        setError(e?.response?.data?.detail || e?.message || "Failed to load analysis");
        if (e?.response?.status === 401) {
          localStorage.removeItem('token');
          navigate('/signin');
          return;
        }
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [navigate]);

  // Derived metrics
  const perSubmissionPercent = useMemo(() => {
    return submissions
      .filter(s => s.grade != null && s.maxGrade != null && (s.maxGrade as number) > 0)
      .map(s => ({
        date: new Date(s.submittedAt),
        pct: (s.grade! / (s.maxGrade as number)) * 100,
        course: s.course || "Course",
        title: s.title,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [submissions]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of submissions) {
      counts[s.status] = (counts[s.status] || 0) + 1;
    }
    return counts;
  }, [submissions]);

  const submissionsPerCourse = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of submissions) {
      const c = s.course || "Course";
      counts[c] = (counts[c] || 0) + 1;
    }
    return counts;
  }, [submissions]);

  const avgPctPerCourse = useMemo(() => {
    const sums: Record<string, { earned: number; possible: number }> = {};
    for (const s of submissions) {
      if (s.grade != null && s.maxGrade != null && s.maxGrade > 0) {
        const c = s.course || "Course";
        if (!sums[c]) sums[c] = { earned: 0, possible: 0 };
        sums[c].earned += s.grade;
        sums[c].possible += s.maxGrade;
      }
    }
    const out: Record<string, number> = {};
    Object.entries(sums).forEach(([k, v]) => {
      out[k] = v.possible > 0 ? (v.earned / v.possible) * 100 : 0;
    });
    return out;
  }, [submissions]);

  // Simple color palette
  const palette = [
    "#0ea5e9", // sky-500
    "#22c55e", // green-500
    "#f59e0b", // amber-500
    "#ef4444", // red-500
    "#8b5cf6", // violet-500
    "#06b6d4", // cyan-500
    "#e11d48", // rose-600
    "#84cc16", // lime-500
  ];

  // Helpers for charts
  const formatDate = (d: Date) => d.toLocaleDateString();

  // No early return — hooks must run on every render

  const statusEntries = Object.entries(statusCounts);
  const totalStatus = statusEntries.reduce((a, [, v]) => a + v, 0);
  const courseEntries = Object.entries(submissionsPerCourse);
  const avgEntries = Object.entries(avgPctPerCourse);

  // Render Plotly charts
  useEffect(() => {
    const Plotly = (window as any).Plotly;
    if (!Plotly) return;

    // Line: Grades over time (show days on x-axis)
    if (lineRef.current) {
      // Use date-only (YYYY-MM-DD) to avoid hours on axis
      const x = perSubmissionPercent.map(p => {
        const d = p.date;
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`; // ISO date only
      });
      const y = perSubmissionPercent.map(p => Math.round(p.pct));
      const text = perSubmissionPercent.map(p => `${p.title} • ${p.course}`);
      // compute axis start = first submission date - 1 day, end = last submission date + 1 day
      const firstISO = x.length ? x[0] : undefined;
      const lastISO = x.length ? x[x.length - 1] : undefined;
      let startISO = firstISO;
      let endISO = lastISO;
      if (firstISO) {
        const d0 = new Date(firstISO + 'T00:00:00');
        d0.setDate(d0.getDate() - 1);
        const yyyy0 = d0.getFullYear();
        const mm0 = String(d0.getMonth() + 1).padStart(2, '0');
        const dd0 = String(d0.getDate()).padStart(2, '0');
        startISO = `${yyyy0}-${mm0}-${dd0}`;
      }
      if (lastISO) {
        const d1 = new Date(lastISO + 'T00:00:00');
        d1.setDate(d1.getDate() + 1);
        const yyyy1 = d1.getFullYear();
        const mm1 = String(d1.getMonth() + 1).padStart(2, '0');
        const dd1 = String(d1.getDate()).padStart(2, '0');
        endISO = `${yyyy1}-${mm1}-${dd1}`;
      }

      const trace = {
        x,
        y,
        text,
        mode: 'lines+markers',
        line: { color: '#0ea5e9', width: 3 },
        marker: { size: 7 },
        hovertemplate: '%{text}<br>%{x|%b %d, %Y}<br><b>%{y:.0f}%</b><extra></extra>'
      };
      const layout = {
        margin: { l: 80, r: 32, t: 10, b: 90 },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        xaxis: { title: '', type: 'date', tickformat: '%b %d', dtick: 'D1', gridcolor: '#e5e7eb', range: x.length ? [startISO, endISO] : undefined, automargin: true, tickpadding: 22, tickangle: -30, tickfont: { size: 11 }, ticks: 'outside', ticklen: 8, tickcolor: '#9ca3af' },
        yaxis: { title: '', range: [0, 105], ticksuffix: '%', gridcolor: '#e5e7eb', automargin: true, tickpadding: 20, tickfont: { size: 11 }, ticks: 'outside', ticklen: 8, tickcolor: '#9ca3af' },
        height: 360,
        showlegend: false,
        responsive: true,
      } as Partial<any>;
      Plotly.newPlot(lineRef.current, [trace], layout, { displayModeBar: false });
    }

    // Pie: Status distribution
    if (pieRef.current) {
      const labels = statusEntries.map(([k]) => k);
      const values = statusEntries.map(([, v]) => v);
      const trace = {
        type: 'pie',
        labels,
        values,
        hole: 0.4,
        marker: { colors: palette },
        hovertemplate: '%{label}: <b>%{value}</b> (%{percent})<extra></extra>'
      } as any;
      const layout = {
        margin: { l: 10, r: 10, t: 10, b: 10 },
        height: 300,
        showlegend: true,
        legend: { orientation: 'h' },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)'
      } as Partial<any>;
      Plotly.newPlot(pieRef.current, [trace], layout, { displayModeBar: false });
    }

    // Bar: Submissions per course
    if (barCourseRef.current) {
      const labels = courseEntries.map(([name]) => name);
      const values = courseEntries.map(([, v]) => v);
      const trace = {
        type: 'bar',
        x: labels,
        y: values,
        marker: { color: '#0ea5e9' },
        hovertemplate: '<b>%{x}</b><br>Submissions: %{y:.0f}<extra></extra>'
      } as any;
      const layout = {
        margin: { l: 40, r: 20, t: 10, b: 100 },
        height: 280,
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        xaxis: { tickangle: -45, automargin: true, tickfont: { size: 10 } },
        yaxis: { rangemode: 'tozero', dtick: 1, tickformat: 'd' },
        showlegend: false,
      } as Partial<any>;
      Plotly.newPlot(barCourseRef.current, [trace], layout, { displayModeBar: false });
    }

    // Bar: Average % per course
    if (barAvgRef.current) {
      const labels = avgEntries.map(([name]) => name);
      const values = avgEntries.map(([, v]) => Math.round(v));
      const trace = {
        type: 'bar',
        x: labels,
        y: values,
        marker: { color: '#f59e0b' },
        hovertemplate: '<b>%{x}</b><br>Avg: %{y:.0f}%<extra></extra>'
      } as any;
      const layout = {
        margin: { l: 40, r: 20, t: 10, b: 100 },
        height: 280,
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        xaxis: { tickangle: -45, automargin: true, tickfont: { size: 10 } },
        yaxis: { range: [0, 100], ticksuffix: '%' },
        showlegend: false,
      } as Partial<any>;
      Plotly.newPlot(barAvgRef.current, [trace], layout, { displayModeBar: false });
    }

    const onResize = () => {
      try {
        if (lineRef.current) (window as any).Plotly.Plots.resize(lineRef.current);
        if (pieRef.current) (window as any).Plotly.Plots.resize(pieRef.current);
        if (barCourseRef.current) (window as any).Plotly.Plots.resize(barCourseRef.current);
        if (barAvgRef.current) (window as any).Plotly.Plots.resize(barAvgRef.current);
      } catch {}
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [perSubmissionPercent, statusEntries, courseEntries, avgEntries]);

  return (
    <div className="min-h-screen relative overflow-hidden bg-white">
      {/* Header */}
      <div className="relative z-10 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/student/dashboard')}
                className="group flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 transition-all duration-300"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Dashboard</span>
              </button>

              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-r from-sky-500 to-sky-600 rounded-2xl flex items-center justify-center">
                  <BarChart3 className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-black text-gray-900">Analysis</h1>
                  <p className="text-sm text-gray-600">Interactive overview of your performance</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 py-8">
        {isLoading ? (
          <div className="min-h-[50vh] bg-gray-50 flex items-center justify-center rounded-3xl border border-gray-200">
            <div className="text-center p-8">
              <div className="w-16 h-16 bg-gradient-to-r from-sky-500 to-sky-600 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse">
                <BookOpen className="w-8 h-8 text-white" />
              </div>
              <p className="text-gray-600 font-medium">Loading analysis...</p>
            </div>
          </div>
        ) : error ? (
          <div className="min-h-[50vh] bg-gray-50 flex items-center justify-center rounded-3xl border border-gray-200">
            <div className="text-center p-8">
              <div className="w-16 h-16 bg-gradient-to-r from-red-500 to-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 text-white" />
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
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Line Chart: Grades over time */}
          <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-gradient-to-r from-sky-500 to-sky-600 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-lg font-black text-gray-900">Grades Over Time</h3>
            </div>
            {perSubmissionPercent.length === 0 ? (
              <div className="text-gray-600 text-sm flex items-center gap-2"><FileText className="w-4 h-4"/> No graded submissions yet</div>
            ) : (
              <div ref={lineRef} />
            )}
          </div>

          {/* Pie chart: Status distribution */}
          <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-gradient-to-r from-emerald-500 to-green-600 rounded-lg flex items-center justify-center">
                <PieChart className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-lg font-black text-gray-900">Status Distribution</h3>
            </div>
            {totalStatus === 0 ? (
              <div className="text-gray-600 text-sm flex items-center gap-2"><FileText className="w-4 h-4"/> No submissions yet</div>
            ) : (
              <div ref={pieRef} />
            )}
          </div>

          {/* Bars: Submissions per course */}
          <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-lg font-black text-gray-900">Submissions per Course</h3>
            </div>
            {courseEntries.length === 0 ? (
              <div className="text-gray-600 text-sm flex items-center gap-2"><FileText className="w-4 h-4"/> No submissions yet</div>
            ) : (
              <div ref={barCourseRef} />
            )}
          </div>

          {/* Bars: Average % per course */}
          <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-gradient-to-r from-yellow-500 to-orange-600 rounded-lg flex items-center justify-center">
                <Star className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-lg font-black text-gray-900">Average Grade per Course</h3>
            </div>
            {avgEntries.length === 0 ? (
              <div className="text-gray-600 text-sm flex items-center gap-2"><FileText className="w-4 h-4"/> No graded submissions yet</div>
            ) : (
              <div ref={barAvgRef} />
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
