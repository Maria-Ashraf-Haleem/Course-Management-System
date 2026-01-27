import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Download, FileText, BarChart3, Users, Calendar, TrendingUp, Filter } from "lucide-react";
import { generateReport } from "../../lib/api";

export default function Reports() {
  const navigate = useNavigate();
  const [selectedReport, setSelectedReport] = useState("");
  const [filters, setFilters] = useState({
    dateFrom: "",
    dateTo: "",
    department: "",
    yearLevel: "",
    status: ""
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [reports, setReports] = useState<any[]>([]);

  useEffect(() => {
    // TODO: Load existing reports from API
    setReports([
      {
        id: 1,
        name: "Student Performance Report",
        type: "performance",
        generatedAt: "2024-01-15",
        status: "completed",
        downloadUrl: "#"
      },
      {
        id: 2,
        name: "Submission Statistics",
        type: "statistics",
        generatedAt: "2024-01-10",
        status: "completed",
        downloadUrl: "#"
      }
    ]);
  }, []);

  const reportTypes = [
    {
      id: "performance",
      name: "Student Performance Report",
      description: "Comprehensive analysis of student grades and progress",
      icon: TrendingUp
    },
    {
      id: "submissions",
      name: "Submission Statistics",
      description: "Overview of assignment submissions and completion rates",
      icon: FileText
    },
    {
      id: "attendance",
      name: "Attendance Report",
      description: "Student attendance and participation tracking",
      icon: Users
    },
    {
      id: "deadlines",
      name: "Deadline Analysis",
      description: "Assignment deadlines and submission patterns",
      icon: Calendar
    }
  ];

  const handleGenerateReport = async () => {
    if (!selectedReport) return;
    
    setIsGenerating(true);
    
    try {
      // Call API to generate report
      const reportData = {
        report_type: selectedReport,
        date_from: filters.dateFrom || null,
        date_to: filters.dateTo || null,
        department_id: filters.department || null,
        year_level: filters.yearLevel || null
      };
      
      const result = await generateReport(reportData);
      
      // Add new report to list
      const newReport = {
        id: Date.now(),
        name: reportTypes.find(r => r.id === selectedReport)?.name || "Custom Report",
        type: selectedReport,
        generatedAt: new Date().toISOString().split('T')[0],
        status: "completed",
        downloadUrl: "#"
      };
      
      setReports(prev => [newReport, ...prev]);
      setSelectedReport("");
    } catch (error) {
      console.error("Error generating report:", error);
      alert("Failed to generate report. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = (reportId: number) => {
    // TODO: Implement actual download functionality
    console.log("Downloading report:", reportId);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate("/instructor/dashboard")}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-3xl font-bold">Reports & Analytics</h1>
            <p className="text-gray-300">Generate and manage comprehensive reports</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Report Generation Panel */}
          <div className="lg:col-span-2">
            <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-6">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Generate New Report
              </h2>

              {/* Report Type Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {reportTypes.map((type) => (
                  <div
                    key={type.id}
                    onClick={() => setSelectedReport(type.id)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all duration-300 ${
                      selectedReport === type.id
                        ? "border-purple-500 bg-purple-500/20"
                        : "border-white/20 hover:border-white/40 hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <type.icon className="w-5 h-5 text-purple-400" />
                      <div>
                        <h3 className="font-semibold">{type.name}</h3>
                        <p className="text-sm text-gray-400">{type.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Filters */}
              {selectedReport && (
                <div className="space-y-4">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Filter className="w-4 h-4" />
                    Report Filters
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Date From
                      </label>
                      <input
                        type="date"
                        value={filters.dateFrom}
                        onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                        className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Date To
                      </label>
                      <input
                        type="date"
                        value={filters.dateTo}
                        onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                        className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleGenerateReport}
                    disabled={isGenerating}
                    className="w-full bg-gradient-to-r from-purple-500 to-blue-600 text-white py-3 px-6 rounded-lg hover:from-purple-600 hover:to-blue-700 transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <BarChart3 className="w-4 h-4" />
                    {isGenerating ? "Generating Report..." : "Generate Report"}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Recent Reports */}
          <div className="lg:col-span-1">
            <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-6">
              <h2 className="text-xl font-bold mb-6">Recent Reports</h2>
              
              <div className="space-y-4">
                {reports.map((report) => (
                  <div key={report.id} className="p-4 bg-white/5 rounded-lg border border-white/10">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-sm">{report.name}</h3>
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        report.status === 'completed' 
                          ? 'bg-green-500/20 text-green-400' 
                          : 'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {report.status}
                      </span>
                    </div>
                    
                    <p className="text-xs text-gray-400 mb-3">
                      Generated: {report.generatedAt}
                    </p>
                    
                    <button
                      onClick={() => handleDownload(report.id)}
                      className="w-full bg-white/10 hover:bg-white/20 text-white py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                      <Download className="w-3 h-3" />
                      Download
                    </button>
                  </div>
                ))}
                
                {reports.length === 0 && (
                  <p className="text-gray-400 text-center py-8">No reports generated yet</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
