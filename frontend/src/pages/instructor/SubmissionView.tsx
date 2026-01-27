import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getInstructorSubmission,
  reviewInstructorSubmission,
  downloadSubmissionFile,
  getStudentProfile,
  fileUrl,
} from "../../lib/api";

export default function SubmissionView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submission, setSubmission] = useState<any>(null);
  const [studentProfile, setStudentProfile] = useState<any>(null);
  const [grade, setGrade] = useState<number | undefined>(undefined);
  const [maxGrade, setMaxGrade] = useState<number>(100);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const resp = await getInstructorSubmission(id as string).catch(
          () => ({ data: null } as any)
        );
        if (resp && resp.data) {
          // backend returns { submission: {...}, feedback: {...} }
          const s = resp.data.submission || resp.data;
          setSubmission(s);
          const mg = Number(s.maxGrade ?? s.max_grade ?? 100);
          setMaxGrade(Number.isFinite(mg) && mg > 0 ? mg : 100);
          // feedback may be in resp.data.feedback
          setGrade(
            (resp.data.feedback && resp.data.feedback.grade) ??
              s.grade ??
              undefined
          );
          setFeedback(
            (resp.data.feedback && resp.data.feedback.text) ??
              s.feedback_text ??
              ""
          );

          // fetch student profile if possible
          const studentId =
            s.studentId || s.student_id || s.student?.id || s.studentId;
          if (studentId) {
            try {
              const sp = await getStudentProfile(studentId as string).catch(
                () => ({ data: null } as any)
              );
              if (sp && sp.data) setStudentProfile(sp.data);
            } catch (e) {
              // ignore profile fetch errors
            }
          }
        } else {
          console.warn("getInstructorSubmission returned empty", resp);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const handleDownload = async () => {
    if (!submission) return;
    try {
      // backend returns a blob via API helper; if the submission includes a direct file path, fall back to that
      const res = await downloadSubmissionFile(submission.id).catch(
        () => null as any
      );
      if (res && res.data) {
        const blob = new Blob([res.data]);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = submission.filename || `submission-${submission.id}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        return;
      }

      // fallback: if submission provides a file path/url
      if (submission.file_path || submission.fileUrl || submission.file_url) {
        const link =
          submission.file_path || submission.fileUrl || submission.file_url;
        const full = fileUrl(link);
        window.open(full, "_blank");
        return;
      }
    } catch (err) {
      console.error("Download failed", err);
      alert("Download failed. See console for details.");
    }
  };

  const handleReview = async (status: "Accepted" | "NeedsRevision") => {
    if (!submission) return;
    try {
      const payload: any = { status };
      if (grade != null) {
        const g = Number(grade);
        if (g < 0 || g > maxGrade) {
          alert(`Grade must be between 0 and ${maxGrade}.`);
          return;
        }
        payload.grade = g;
      }
      if (feedback) payload.feedback_text = feedback;
      await reviewInstructorSubmission(submission.id, payload);
      alert("Review submitted successfully");
      navigate("/instructor/dashboard");
    } catch (err) {
      console.error("Review failed", err);
      alert("Failed to submit review. See console for details.");
    }
  };

  const handleSaveOnly = async () => {
    if (!submission) return;
    try {
      const payload: any = {};
      if (grade != null) {
        const g = Number(grade);
        if (g < 0 || g > maxGrade) {
          alert(`Grade must be between 0 and ${maxGrade}.`);
          return;
        }
        payload.grade = g;
      }
      if (feedback) payload.feedback_text = feedback;
      // use current status to avoid changing it
      const status = submission.status || "Pending";
      await reviewInstructorSubmission(submission.id, { status, ...payload });
      alert("Saved grade/feedback");
      // refresh
      const resp = await getInstructorSubmission(submission.id as string).catch(
        () => ({ data: null } as any)
      );
      if (resp && resp.data) setSubmission(resp.data.submission || resp.data);
    } catch (err) {
      console.error("Save failed", err);
      alert("Save failed. See console for details.");
    }
  };

  if (loading) return <div className="p-6">Loading...</div>;
  if (!submission) return <div className="p-6">Submission not found</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Submission #{submission.id}</h2>
      <p className="mb-2">
        <strong>Title:</strong> {submission.title}
      </p>
      <p className="mb-2">
        <strong>Student:</strong>{" "}
        {studentProfile?.full_name ||
          submission.student_full_name ||
          submission.studentUsername ||
          `#${submission.studentId}`}
      </p>
      {studentProfile && (
        <div className="mb-2 text-sm text-white/70">
          <div>
            <strong>Email:</strong> {studentProfile.email}
          </div>
          <div>
            <strong>University ID:</strong>{" "}
            {studentProfile.student_number || studentProfile.id}
          </div>
        </div>
      )}
      <p className="mb-2">
        <strong>Submitted At:</strong>{" "}
        {new Date(submission.submittedAt).toLocaleString()}
      </p>
      <p className="mb-2">
        <strong>Status:</strong> {submission.status}
      </p>
      <div className="my-4">
        <button
          onClick={handleDownload}
          className="mr-2 px-4 py-2 bg-blue-600 text-white rounded"
        >
          Download File
        </button>
        <button
          onClick={() =>
            navigate(`/instructor/submissions/${submission.id}/edit`)
          }
          className="px-4 py-2 bg-gray-600 text-white rounded"
        >
          Edit / Grade
        </button>
      </div>

      <div className="mt-6 bg-white/5 p-4 rounded">
        <label className="block mb-2 font-bold">Grade (0-{maxGrade})</label>
        <input
          type="number"
          min={0}
          max={maxGrade}
          value={grade ?? ""}
          onChange={(e) =>
            setGrade(e.target.value === "" ? undefined : Number(e.target.value))
          }
          className="w-24 p-2 rounded bg-white/10 border"
        />
        <label className="block mt-4 mb-2 font-bold">Feedback</label>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          className="w-full p-2 rounded bg-white/10 border h-32"
        />
        <div className="mt-4 flex gap-2">
          <button
            onClick={handleSaveOnly}
            className="px-4 py-2 bg-cyan-600 text-white rounded"
          >
            Save
          </button>
          <button
            onClick={() => handleReview("Accepted")}
            className="px-4 py-2 bg-green-600 text-white rounded"
          >
            Accept
          </button>
          <button
            onClick={() => handleReview("NeedsRevision")}
            className="px-4 py-2 bg-red-600 text-white rounded"
          >
            Request Revision
          </button>
        </div>
      </div>
    </div>
  );
}
