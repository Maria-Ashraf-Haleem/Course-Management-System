import React, { useEffect, useState } from 'react';
import { getInstructorSubmission, reviewInstructorSubmission, getStudentProfile } from '../../lib/api';
import { BookOpen, ArrowLeft } from 'lucide-react';

export default function SubmissionModal({ id, onClose, onReviewed } : { id: number | null, onClose: () => void, onReviewed?: (updated: any) => void }) {
  const [loading, setLoading] = useState(true);
  const [submission, setSubmission] = useState<Record<string, any> | null>(null);
  const [student, setStudent] = useState<Record<string, any> | null>(null);
  const [grade100, setGrade100] = useState<number | ''>('');
  const [feedback, setFeedback] = useState('');
  const [statusState, setStatusState] = useState<string>('Pending');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const resp = await getInstructorSubmission(String(id)).catch(() => ({ data: null } as any));
        const data = resp && resp.data ? (resp.data.submission || resp.data) : null;
        if (!mounted) return;
  setSubmission(data);
        // feedback may live in resp.data.feedback
        const fb = resp && resp.data && resp.data.feedback ? resp.data.feedback : null;
        const rawGrade = (fb && typeof fb.grade === 'number') ? fb.grade : (data && data.grade != null ? data.grade : null);
        // Use backend grade as-is (assumed 0-100)
        setGrade100(rawGrade != null ? Number(rawGrade) : '');
  setFeedback(fb && fb.text ? fb.text : (data && data.feedback_text ? data.feedback_text : ''));
  // status from backend (use Dataset values: Pending, Accepted, Rejected, NeedsRevision)
  setStatusState((data && (data.status || data.submission_status)) || 'Pending');
        // try fetch student profile
        const studentId = data?.studentId || data?.student_id || data?.student;
        console.log('Student ID found:', studentId);
        console.log('Submission data:', data);
        if (studentId) {
          const sp = await getStudentProfile(studentId as string).catch(() => ({ data: null } as any));
          console.log('Student profile response:', sp);
          if (sp && sp.data) {
            console.log('Setting student data:', sp.data);
            setStudent(sp.data);
          }
        }
      } catch (err) {
        console.error('load submission failed', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [id]);

  

  const handleSave = async () => {
    // Save grade/feedback without changing status
    if (!submission) return;
    setSaving(true);
    try {
  const payload: Record<string, any> = {};
  if (grade100 !== '' && grade100 != null) payload.grade = Number(grade100);
  if (feedback && feedback.trim()) payload.feedback_text = feedback.trim();
  // use selected statusState when saving (keeps dataset values)
  const status = statusState || submission.status || 'Pending';
  await reviewInstructorSubmission(submission.id, { status, ...payload });
  // inform parent
  const updatedSubmission = { id: submission.id, grade: payload.grade != null ? payload.grade : submission.grade, feedback: payload.feedback_text ?? submission.feedback_text ?? null, status };
      if (onReviewed) onReviewed(updatedSubmission);
      alert('Saved');
    } catch (err) {
      console.error('save failed', err);
      alert('Save failed');
    } finally { setSaving(false); }
  };

  if (!id) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="w-full max-w-2xl text-white rounded-2xl shadow-2xl max-h-[90vh] overflow-auto">
        <div className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={onClose}
              className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-all"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-r from-purple-500 to-blue-600 rounded-xl">
                <BookOpen className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">Submission Review</h1>
                <p className="text-white/60">Review and grade student submission</p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="text-white/70">Loading...</div>
          ) : (
            <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
              <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-300 mb-2">Title</label>
                    <input type="text" readOnly value={submission?.title || ''} className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Student</label>
                    <input type="text" readOnly value={student?.full_name || submission?.student_full_name || submission?.studentUsername || `#${submission?.studentId || ''}`} className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Student ID</label>
                    <input type="text" readOnly value={submission?.student_number || student?.student_number || student?.id || submission?.studentId || ''} className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-300 mb-2">Submitted At</label>
                    <input type="text" readOnly value={submission?.submittedAt ? new Date(submission.submittedAt).toLocaleString() : ''} className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Grade (0-100)</label>
                    <input type="number" min={0} max={100} value={grade100 as any} onChange={(e) => setGrade100(e.target.value === '' ? '' : Number(e.target.value))} className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Status</label>
                    <select value={statusState} onChange={(e) => setStatusState(e.target.value)} className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent backdrop-blur-xl">
                      <option value="Pending" style={{backgroundColor: 'rgb(51, 65, 85)', color: 'white'}}>Pending</option>
                      <option value="Accepted" style={{backgroundColor: 'rgb(51, 65, 85)', color: 'white'}}>Accepted</option>
                      <option value="Rejected" style={{backgroundColor: 'rgb(51, 65, 85)', color: 'white'}}>Rejected</option>
                      <option value="NeedsRevision" style={{backgroundColor: 'rgb(51, 65, 85)', color: 'white'}}>Needs Revision</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-300 mb-2">Feedback</label>
                    <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={4} className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white resize-none placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
                  </div>
                </div>

                <div className="mt-4 flex gap-4">
                  <button type="submit" disabled={saving} className="flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-purple-500 to-blue-600 text-white rounded-lg hover:from-purple-600 hover:to-blue-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed">Save</button>
                  <button type="button" onClick={onClose} className="px-8 py-4 bg-white/10 border border-white/20 text-white rounded-lg hover:bg-white/15 transition-all">Cancel</button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
