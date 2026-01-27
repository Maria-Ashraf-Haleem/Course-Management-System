import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getInstructorSubmission, reviewInstructorSubmission, downloadSubmissionFile } from '../../lib/api';

export default function SubmissionEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submission, setSubmission] = useState<any>(null);
  const [grade, setGrade] = useState<number | undefined>(undefined);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const resp = await getInstructorSubmission(id as string).catch(() => ({ data: null } as any));
        if (resp && resp.data) {
          setSubmission(resp.data);
          setGrade(resp.data.grade ?? undefined);
          setFeedback(resp.data.feedback_text ?? '');
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const handleSave = async () => {
    if (!submission) return;
    try {
      const payload: any = {};
      if (grade != null) payload.grade = Number(grade);
      if (feedback) payload.feedback_text = feedback;
      // keep status unchanged when saving edits; provide Accept/NeedsRevision via separate actions
      await reviewInstructorSubmission(submission.id, { status: submission.status || 'Pending', ...payload });
      navigate(`/instructor/submissions/${submission.id}`);
    } catch (err) {
      console.error('Save failed', err);
    }
  };

  const handleDownload = async () => {
    if (!submission) return;
    try {
      const res = await downloadSubmissionFile(submission.id);
      const blob = new Blob([res.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = submission.filename || `submission-${submission.id}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed', err);
    }
  };

  if (loading) return <div className="p-6">Loading...</div>;
  if (!submission) return <div className="p-6">Submission not found</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Edit Submission #{submission.id}</h2>
      <div className="mb-4">
        <button onClick={handleDownload} className="mr-2 px-4 py-2 bg-blue-600 text-white rounded">Download File</button>
        <button onClick={() => navigate(-1)} className="px-4 py-2 bg-gray-600 text-white rounded">Back</button>
      </div>

      <div className="mt-6 bg-white/5 p-4 rounded">
        <label className="block mb-2 font-bold">Grade (0-10)</label>
        <input type="number" min={0} max={10} value={grade ?? ''} onChange={(e) => setGrade(e.target.value === '' ? undefined : Number(e.target.value))} className="w-24 p-2 rounded bg-white/10 border" />
        <label className="block mt-4 mb-2 font-bold">Feedback</label>
        <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} className="w-full p-2 rounded bg-white/10 border h-32" />
        <div className="mt-4 flex gap-2">
          <button onClick={handleSave} className="px-4 py-2 bg-cyan-600 text-white rounded">Save Changes</button>
          <button onClick={() => navigate(`/instructor/submissions/${submission.id}`)} className="px-4 py-2 bg-gray-600 text-white rounded">Cancel</button>
        </div>
      </div>
    </div>
  );
}
