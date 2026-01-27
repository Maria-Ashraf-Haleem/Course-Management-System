import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft, FileText, Calendar, Clock, CheckCircle, XCircle,
  AlertTriangle, MessageCircle, Star, Upload,
  Eye, BookOpen, Target
} from "lucide-react";
import { api } from "../../lib/api";

interface SubmissionDetail {
  id: number;
  title: string;
  course?: string;
  submittedAt: string;
  status: string;
  grade?: number;
  maxGrade?: number | null;
  feedback?: string;
  fileName?: string;
  filePath?: string;
  fileType?: string;
  notes?: string;
  assignmentId: number;
  studentId: number;
}

export default function SubmissionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [isAnimated, setIsAnimated] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsAnimated(true), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (id) {
      loadSubmissionDetail();
    }
  }, [id]);

  const loadSubmissionDetail = async () => {
    if (!id) return;
    
    setLoading(true);
    setError("");
    
    try {
      const response = await api.get(`/student/submissions/${id}`);
      setSubmission(response.data);
    } catch (err: any) {
      console.error("Error loading submission detail:", err);
      setError(err?.response?.data?.detail || err?.message || "Failed to load submission details");
      
      if (err.response?.status === 401) {
        localStorage.removeItem('token');
        navigate('/signin');
      }
    } finally {
      setLoading(false);
    }
  };


  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'accepted': 
      case 'approved': 
        return 'text-emerald-400 bg-emerald-500/20 border-emerald-400/30';
      case 'pending': 
        return 'text-amber-400 bg-amber-500/20 border-amber-400/30';
      case 'rejected': 
        return 'text-red-400 bg-red-500/20 border-red-400/30';
      case 'needsrevision':
        return 'text-orange-400 bg-orange-500/20 border-orange-400/30';
      default: 
        return 'text-gray-400 bg-gray-500/20 border-gray-400/30';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'accepted':
      case 'approved': 
        return CheckCircle;
      case 'pending': 
        return Clock;
      case 'rejected': 
        return XCircle;
      case 'needsrevision':
        return AlertTriangle;
      default: 
        return FileText;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-sky-500 to-sky-600 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse">
            <BookOpen className="w-8 h-8 text-white" />
          </div>
          <p className="text-gray-600 font-medium">Loading submission details...</p>
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
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => navigate('/student/dashboard')}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors"
            >
              Back to Dashboard
            </button>
            <button
              onClick={loadSubmissionDetail}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg transition-colors border border-gray-200"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-700 font-medium">Submission not found</p>
          <button
            onClick={() => navigate('/student/dashboard')}
            className="mt-4 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const StatusIcon = getStatusIcon(submission.status);

  return (
    <div className="min-h-screen relative overflow-hidden bg-white">

      {/* Header */}
      <div className="relative z-10 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                to="/student/dashboard"
                className="group flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 transition-all duration-300"
              >
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                <span>Back to Dashboard</span>
              </Link>
              
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-r from-sky-500 to-sky-600 rounded-2xl flex items-center justify-center">
                  <FileText className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-black text-gray-900">
                    Submission Details
                  </h1>
                  <p className="text-sm text-gray-600">View your submission status and feedback</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 max-w-4xl mx-auto px-6 py-8">
        <div className={`transform transition-all duration-1000 ${isAnimated ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}>
          {/* Submission Header */}
          <div className="bg-white rounded-3xl border border-gray-200 p-8 mb-8 shadow-sm">
            <div className="flex items-start justify-between mb-6">
              <div className="flex-1">
                <h2 className="text-3xl font-black text-gray-900 mb-2">{submission.title}</h2>
                {submission.course && (
                  <p className="text-gray-600 text-lg mb-4">{submission.course}</p>
                )}
                
                <div className="flex items-center gap-6 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>Submitted: {new Date(submission.submittedAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    <span>ID: {submission.id}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    <span>Assignment: {submission.assignmentId}</span>
                  </div>
                </div>
              </div>

              <div className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-bold ${getStatusColor(submission.status)}`}>
                <StatusIcon className="w-4 h-4" />
                <span className="capitalize">{submission.status.replace(/([A-Z])/g, ' $1').trim()}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-4">
              <Link
                to="/student/submissions"
                className="flex items-center gap-2 px-6 py-3 bg-white hover:bg-gray-50 border border-gray-200 text-gray-800 font-medium rounded-xl transition-all duration-300"
              >
                <Eye className="w-4 h-4" />
                <span>View All Submissions</span>
              </Link>
            </div>
          </div>

          {/* Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-8">
              {/* File Information */}
              {submission.fileName && (
                <div className="bg-white rounded-3xl border border-gray-200 p-8 shadow-sm">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-gradient-to-r from-sky-500 to-sky-600 rounded-xl flex items-center justify-center">
                      <Upload className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-xl font-black text-gray-900">File Information</h3>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-sky-600" />
                        <div>
                          <p className="font-medium text-gray-900">{submission.fileName}</p>
                          <p className="text-gray-600 text-sm">{submission.fileType || 'Unknown type'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Student Notes */}
              {submission.notes && (
                <div className="bg-white rounded-3xl border border-gray-200 p-8 shadow-sm">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-600 rounded-xl flex items-center justify-center">
                      <MessageCircle className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-xl font-black text-gray-900">Your Notes</h3>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                    <p className="text-gray-800 leading-relaxed">{submission.notes}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-8">
              {/* Grade */}
              {submission.grade !== undefined && submission.grade !== null && (
                <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 bg-gradient-to-r from-yellow-500 to-orange-600 rounded-lg flex items-center justify-center">
                      <Star className="w-4 h-4 text-white" />
                    </div>
                    <h3 className="text-lg font-black text-gray-900">Grade</h3>
                  </div>

                  <div className="text-center">
                    <div className="text-4xl font-black text-yellow-600 mb-2">
                      {submission.grade}{submission.maxGrade ? `/${submission.maxGrade}` : ""}
                    </div>
                    <p className="text-gray-600 text-sm">Final Score</p>
                  </div>
                </div>
              )}

              {/* Feedback */}
              {submission.feedback && (
                <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 bg-gradient-to-r from-emerald-500 to-green-600 rounded-lg flex items-center justify-center">
                      <MessageCircle className="w-4 h-4 text-white" />
                    </div>
                    <h3 className="text-lg font-black text-gray-900">Feedback</h3>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                    <p className="text-gray-800 text-sm leading-relaxed italic">
                      "{submission.feedback}"
                    </p>
                  </div>
                </div>
              )}

              {/* Status Timeline */}
              <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                    <Clock className="w-4 h-4 text-white" />
                  </div>
                  <h3 className="text-lg font-black text-gray-900">Status</h3>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <div className="w-2 h-2 bg-sky-500 rounded-full"></div>
                    <div className="flex-1">
                      <p className="text-gray-900 text-sm font-medium">Submitted</p>
                      <p className="text-gray-600 text-xs">{new Date(submission.submittedAt).toLocaleString()}</p>
                    </div>
                  </div>
                  
                  {submission.status.toLowerCase() !== 'pending' && (
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                      <div className={`w-2 h-2 rounded-full ${
                        submission.status.toLowerCase() === 'accepted' || submission.status.toLowerCase() === 'approved'
                          ? 'bg-emerald-500'
                          : 'bg-red-500'
                      }`}></div>
                      <div className="flex-1">
                        <p className="text-gray-900 text-sm font-medium capitalize">
                          {submission.status.replace(/([A-Z])/g, ' $1').trim()}
                        </p>
                        <p className="text-gray-600 text-xs">Reviewed by instructor</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
