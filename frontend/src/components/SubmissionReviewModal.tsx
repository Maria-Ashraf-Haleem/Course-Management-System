import { useState, useEffect } from "react";
import { BookOpen, ArrowLeft } from "lucide-react";
import {
  reviewInstructorSubmission,
  getInstructorSubmission,
  getStudentProfile,
} from "../lib/api";

interface SubmissionReviewModalProps {
  submissionId: number;
  onClose: () => void;
  onSaved: (updatedSubmission: any) => void;
}

interface SubmissionData {
  id: number;
  title: string;
  studentName: string;
  studentId: string;
  submittedAt: string;
  grade: number | null;
  status: string;
  feedback: string;
  maxGrade?: number | null;
}

export default function SubmissionReviewModal({
  submissionId,
  onClose,
  onSaved,
}: SubmissionReviewModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submission, setSubmission] = useState<SubmissionData | null>(null);
  const [formData, setFormData] = useState({
    grade: "",
    status: "Pending",
    feedback: "",
  });
  const [maxGrade, setMaxGrade] = useState<number>(100);

  useEffect(() => {
    loadSubmission();
  }, [submissionId]);

  const loadSubmission = async () => {
    try {
      setLoading(true);
      const response = await getInstructorSubmission(submissionId);
      const data = response.data;

      // Handle the actual API response structure
      const submission = data.submission || data;
      const feedback = data.feedback;

      const submissionData: SubmissionData = {
        id: submission.id || submission.submission_id,
        title: submission.title || submission.assignment_title || "Assignment",
        studentName:
          submission.studentName ||
          submission.student_name ||
          `Student #${submission.studentId || submission.student_id}`,
        studentId:
          (submission.studentId || submission.student_id)?.toString() || "",
        submittedAt: submission.submittedAt || submission.submitted_at || "",
        grade: submission.grade || feedback?.grade || null,
        status: submission.status || "Pending",
        feedback:
          feedback?.text || feedback?.feedback_text || submission.notes || "",
        maxGrade: submission.maxGrade ?? submission.max_grade ?? null,
      };

      // If the name is missing or a placeholder, try to fetch the real name from student profile
      let finalSubmission = submissionData;
      const looksLikePlaceholder =
        !submissionData.studentName || /^(Student\s*#)/i.test(submissionData.studentName);
      if (looksLikePlaceholder && submissionData.studentId) {
        try {
          const profileRes = await getStudentProfile(submissionData.studentId);
          const profile = profileRes?.data || {};
          const realName =
            profile.full_name ||
            profile.name ||
            [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
            profile.username ||
            "";
          if (realName) {
            finalSubmission = { ...submissionData, studentName: realName };
          }
        } catch (e) {
          // Non-fatal: keep placeholder if profile fetch fails
          console.warn("Could not fetch student profile for name fallback", e);
        }
      }

      setSubmission(finalSubmission);
      setFormData({
        grade: finalSubmission.grade?.toString() || "",
        status: finalSubmission.status,
        feedback: finalSubmission.feedback,
      });
      const mg = Number(finalSubmission.maxGrade ?? submission.maxGrade ?? submission.max_grade ?? 100);
      setMaxGrade(Number.isFinite(mg) && mg > 0 ? mg : 100);
    } catch (error) {
      console.error("Failed to load submission:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!submission) return;

    try {
      setSaving(true);

      // Map status values to backend expected format
      const statusMap: Record<string, string> = {
        Pending: "Pending",
        Accepted: "Accepted",
        Rejected: "Rejected",
        NeedsRevision: "NeedsRevision",
      };

      const mappedStatus = statusMap[formData.status] || "Accepted";

      const payload: any = {
        status: mappedStatus,
      };

      // Add grade if provided (no scaling; backend validates against assignment max)
      if (formData.grade && formData.grade.trim()) {
        const gradeValue = parseFloat(formData.grade);
        if (!isNaN(gradeValue)) {
          if (gradeValue < 0 || gradeValue > maxGrade) {
            alert(`Grade must be between 0 and ${maxGrade}.`);
            return;
          }
          payload.grade = gradeValue;
        }
      }

      // Add feedback if provided
      if (formData.feedback && formData.feedback.trim()) {
        payload.feedback_text = formData.feedback;
      }

      // Backend validation: grade required for Accepted status
      if (mappedStatus === "Accepted" && (payload.grade == null || payload.grade === "")) {
        alert("Grade is required when accepting a submission.");
        return;
      }

      // Backend validation: feedback required for NeedsRevision status
      if (mappedStatus === "NeedsRevision" && !payload.feedback_text) {
        alert(
          "Feedback is required when marking submission as needs revision."
        );
        return;
      }

      await reviewInstructorSubmission(submissionId, payload);

      const updatedSubmission = {
        ...submission,
        grade: payload.grade ?? null,
        status: mappedStatus,
        feedback: formData.feedback,
      };

      onSaved(updatedSubmission);
      onClose();
    } catch (error) {
      console.error("Failed to save submission:", error);
      alert("Failed to save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gray-800/20 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-gray-100/95 backdrop-blur-xl rounded-3xl border border-gray-300 p-8">
          <div className="text-gray-800 text-center">Loading submission...</div>
        </div>
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="fixed inset-0 bg-gray-800/20 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-gray-100/95 backdrop-blur-xl rounded-3xl border border-gray-300 p-8">
          <div className="text-gray-800 text-center">Submission not found</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-800/20 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-gray-100/95 backdrop-blur-xl rounded-3xl border border-gray-300 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center gap-4 p-6 border-b border-gray-300">
          <button
            onClick={onClose}
            className="p-2 text-gray-700 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-12 h-12 bg-gradient-to-r from-sky-400 to-sky-600 rounded-2xl flex items-center justify-center">
            <BookOpen className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Submission Review
            </h2>
            <p className="text-gray-700">Review and grade student submission</p>
          </div>
        </div>

        {/* Form Content */}
        <div className="p-6 space-y-6">
          {/* Title */}
          <div>
            <label className="block text-gray-800 font-medium mb-2">
              Title
            </label>
            <div className="w-full p-3 bg-gray-200/70 border border-gray-300 rounded-xl text-gray-900">
              {submission.title}
            </div>
          </div>

          {/* Student Info Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-800 font-medium mb-2">
                Student
              </label>
              <div className="w-full p-3 bg-gray-200/70 border border-gray-300 rounded-xl text-gray-900">
                {submission.studentName}
              </div>
            </div>
            <div>
              <label className="block text-gray-800 font-medium mb-2">
                Student ID
              </label>
              <div className="w-full p-3 bg-gray-200/70 border border-gray-300 rounded-xl text-gray-900">
                {submission.studentId}
              </div>
            </div>
          </div>

          {/* Submitted At */}
          <div>
            <label className="block text-gray-800 font-medium mb-2">
              Submitted At
            </label>
            <div className="w-full p-3 bg-gray-200/70 border border-gray-300 rounded-xl text-gray-900">
              {submission.submittedAt
                ? new Date(submission.submittedAt).toLocaleString()
                : "Not available"}
            </div>
          </div>
          {/* Grade and Status Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-800 font-medium mb-2">
                Grade (0-{maxGrade})
              </label>
              <input
                type="number"
                min={0}
                max={maxGrade}
                value={formData.grade}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, grade: e.target.value }))
                }
                placeholder="Enter grade..."
                className="w-full p-3 bg-gray-200/70 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-gray-800 font-medium mb-2">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, status: e.target.value }))
                }
                className="w-full p-3 bg-gray-200/70 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:border-sky-500"
              >
                <option
                  value="Pending"
                  style={{
                    backgroundColor: "rgb(243 244 246)",
                    color: "rgb(17 24 39)",
                  }}
                >
                  Pending
                </option>
                <option
                  value="Accepted"
                  style={{
                    backgroundColor: "rgb(243 244 246)",
                    color: "rgb(17 24 39)",
                  }}
                >
                  Accepted
                </option>
                <option
                  value="Rejected"
                  style={{
                    backgroundColor: "rgb(243 244 246)",
                    color: "rgb(17 24 39)",
                  }}
                >
                  Rejected
                </option>
                <option
                  value="NeedsRevision"
                  style={{
                    backgroundColor: "rgb(243 244 246)",
                    color: "rgb(17 24 39)",
                  }}
                >
                  Needs Revision
                </option>
              </select>
            </div>
          </div>

          {/* Feedback */}
          <div>
            <label className="block text-gray-800 font-medium mb-2">
              Feedback
            </label>
            <textarea
              value={formData.feedback}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, feedback: e.target.value }))
              }
              placeholder="Enter feedback for the student..."
              rows={6}
              className="w-full p-3 bg-gray-200/70 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:border-sky-500 resize-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 pt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-3 bg-gradient-to-r from-sky-500 to-sky-600 text-white rounded-xl hover:from-sky-600 hover:to-sky-700 transition-all disabled:opacity-60 font-medium"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={onClose}
              disabled={saving}
              className="px-6 py-3 bg-gray-200/50 text-gray-800 rounded-xl hover:bg-gray-300/70 transition-colors disabled:opacity-60 font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
