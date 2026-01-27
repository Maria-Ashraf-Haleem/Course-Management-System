import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Send,
  Bell,
  Users,
  Target,
  X,
  Edit,
  Trash2,
} from "lucide-react";
import {
  createAnnouncement,
  getAnnouncements,
  updateAnnouncement,
  deleteAnnouncement,
} from "../../lib/api";
import { api } from "../../lib/api";
import toast from "react-hot-toast";

export default function Announcements() {
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    message: "",
    targetAudience: "all_students",
    selectedCourseId: "",
    priority: "normal",
    scheduledFor: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDlg, setConfirmDlg] = useState<{ open: boolean; title?: string; message?: string; onConfirm?: () => Promise<void> | void }>({ open: false });

  useEffect(() => {
    loadAnnouncements();
    loadCourses();
    loadStudents();
  }, []);

  const loadAnnouncements = async () => {
    try {
      const data = await getAnnouncements();
      setAnnouncements(data);
    } catch (error) {
      console.error("Error loading announcements:", error);
      // Fallback to mock data if API fails
      setAnnouncements([
        {
          id: 1,
          title: "Important: Assignment Deadline Extended",
          message:
            "Due to technical difficulties, the deadline for Research Paper has been extended to Friday.",
          target_audience: "all_students",
          priority: "high",
          scheduled_for: "2024-01-15T10:00",
          sent_at: "2024-01-15T09:30",
          status: "sent",
        },
        {
          id: 2,
          title: "Welcome to New Semester",
          message:
            "Welcome back everyone! I hope you had a great break. Let's make this semester productive.",
          target_audience: "all_students",
          priority: "normal",
          scheduled_for: "2024-01-10T08:00",
          sent_at: "2024-01-10T08:00",
          status: "sent",
        },
      ]);
    }
  };

  const loadCourses = async () => {
    try {
      const response = await api.get('/course-management/courses');
      setCourses(response.data);
    } catch (error) {
      console.error("Error loading courses:", error);
      setCourses([]);
    }
  };

  const loadStudents = async () => {
    try {
      const response = await api.get('/student-management/students');
      setStudents(response.data);
    } catch (error) {
      console.error("Error loading students:", error);
      setStudents([]);
    }
  };

  const targetAudiences = [
    { value: "all_students", label: "All Students", icon: Users },
    ...courses.map(course => ({
      value: `course:${course.id}`,
      label: `${course.name} (${course.code})`,
      icon: Target
    }))
  ];

  const priorities = [
    { value: "low", label: "Low", color: "text-blue-400" },
    { value: "normal", label: "Normal", color: "text-green-400" },
    { value: "high", label: "High", color: "text-yellow-400" },
    { value: "urgent", label: "Urgent", color: "text-red-400" },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Basic validation in case browser 'required' is bypassed
      if (!formData.title.trim() || !formData.message.trim()) {
        toast.error("Please fill in title and message");
        return;
      }
      // Prepare the data for submission
      const submissionData = {
        ...formData,
        targetAudience: formData.targetAudience, // Already in correct format
      };

      if (editingId) {
        // Update existing announcement with clear loading/success/error feedback
        await toast.promise(
          updateAnnouncement(editingId, submissionData),
          {
            loading: "Updating announcement...",
            success: "Announcement updated successfully",
            error: (err) =>
              err?.response?.data?.detail || err?.message || "Failed to update",
          }
        );
        await loadAnnouncements(); // Reload to get updated data
        setEditingId(null);
      } else {
        // Create new announcement with loading/success/error feedback
        await toast.promise(
          createAnnouncement(submissionData),
          {
            loading: "Sending announcement...",
            success: "Announcement created successfully",
            error: (err) =>
              err?.response?.data?.detail || err?.message || "Failed to create",
          }
        );
        await loadAnnouncements(); // Reload to get new data
      }

      // Reset form
      setFormData({
        title: "",
        message: "",
        targetAudience: "all_students",
        selectedCourseId: "",
        priority: "normal",
        scheduledFor: "",
      });
      setShowForm(false);
    } catch (error: any) {
      console.error("Error saving announcement:", error);
      const msg = error?.response?.data?.detail || error?.message || "Failed to save announcement. Please try again.";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (announcement: any) => {
    const targetAudience = announcement.target_audience || announcement.targetAudience;
    setFormData({
      title: announcement.title,
      message: announcement.message,
      targetAudience: targetAudience || "all_students",
      selectedCourseId: "", // No longer needed
      priority: announcement.priority,
      scheduledFor: announcement.scheduled_for || announcement.scheduledFor || "",
    });
    setEditingId(announcement.id);
    setShowForm(true);
  };

  const doDelete = async (id: number) => {
    try {
      await deleteAnnouncement(id);
      toast.success("Announcement deleted");
      await loadAnnouncements();
    } catch (error: any) {
      console.error("Error deleting announcement:", error);
      toast.error(error?.response?.data?.detail || error?.message || "Failed to delete announcement.");
    }
  };

  const handleDelete = (id: number, title?: string) => {
    setConfirmDlg({
      open: true,
      title: "Delete Announcement",
      message: `Are you sure you want to delete${title ? ` "${title}"` : " this announcement"}? This action cannot be undone.`,
      onConfirm: async () => {
        setConfirmDlg({ open: false });
        await doDelete(id);
      },
    });
  };

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "low":
        return "text-blue-400 bg-blue-500/20 border-blue-400/30";
      case "normal":
        return "text-green-400 bg-green-500/20 border-green-400/30";
      case "high":
        return "text-yellow-400 bg-yellow-500/20 border-yellow-400/30";
      case "urgent":
        return "text-red-400 bg-red-500/20 border-red-400/30";
      default:
        return "text-gray-400 bg-gray-500/20 border-gray-400/30";
    }
  };

  const getTargetAudienceLabel = (value: string) => {
    if (!value) return "All Students";
    if (value.startsWith("course:")) {
      const courseId = value.split(":")[1];
      const course = courses.find(c => c.id === parseInt(courseId));
      return course ? `${course.name} (${course.code})` : `Course ${courseId}`;
    }
    if (value.startsWith("student:")) {
      const studentId = value.split(":")[1];
      const student = students.find(s => s.student_id === parseInt(studentId));
      return student ? student.full_name : `Student #${studentId}`;
    }
    return (
      targetAudiences.find((t) => t.value === value)?.label || "All Students"
    );
  };

  return (
    <div className="min-h-screen bg-gray-200 text-gray-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/instructor/dashboard")}
              className="p-2 text-gray-800 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-300/70"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-3xl font-black text-gray-900">Announcements</h1>
              <p className="text-gray-800">Communicate with your students</p>
            </div>
          </div>

          <button
            onClick={() => setShowForm(true)}
            className="bg-gradient-to-r from-sky-500 to-sky-600 text-white px-6 py-3 rounded-xl hover:from-sky-600 hover:to-sky-700 transition-all duration-300 flex items-center gap-2 shadow-lg"
          >
            <Bell className="w-4 h-4" />
            New Announcement
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Announcements List */}
          <div className="lg:col-span-2 bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-8 shadow-xl">
            <h2 className="text-xl font-black text-gray-900 mb-6">Recent Announcements</h2>
            {announcements.length === 0 ? (
              <div className="text-center py-10 text-gray-700">No announcements yet.</div>
            ) : (
              <div className="space-y-4">
                {announcements.map((announcement) => (
                  <div
                    key={announcement.id}
                    className={`bg-gray-100/50 rounded-2xl p-5 border border-gray-300 hover:bg-gray-200/70 transition-all duration-300 ${announcement.priority === 'high' ? 'border-l-4 border-red-500' : 'border-l-4 border-sky-500'}`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-lg font-bold text-gray-900 mb-1">{announcement.title}</h3>
                        <p className="text-sm text-gray-700">{announcement.message}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {announcement.priority === 'high' && (
                          <span className="bg-red-100 text-red-800 text-xs font-semibold px-2 py-1 rounded-full">High Priority</span>
                        )}
                        <button
                          onClick={() => handleEdit(announcement)}
                          className="p-1 text-amber-600 hover:text-amber-700 transition-colors rounded-lg hover:bg-amber-100/50"
                          title="Edit Announcement"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(announcement.id, announcement.title)}
                          className="p-1 text-red-600 hover:text-red-700 transition-colors rounded-lg hover:bg-red-100/50"
                          title="Delete Announcement"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-600">
                      <div className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        <span>{getTargetAudienceLabel(announcement.target_audience || announcement.targetAudience)}</span>
                      </div>
                      {announcement.status === 'sent' && (announcement.sent_at || announcement.sentAt) && (
                        <div className="flex items-center gap-1 text-emerald-600">
                          <Send className="w-3 h-3" />
                          <span>Sent: {new Date(announcement.sent_at || announcement.sentAt).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Announcement Form */}
          {showForm && (
            <div className="lg:col-span-1 bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-8 shadow-xl">
              <h2 className="text-xl font-black text-gray-900 mb-6">
                {editingId ? "Edit Announcement" : "New Announcement"}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="title" className="block text-sm font-medium text-gray-800 mb-1">
                    Title
                  </label>
                  <input
                    type="text"
                    id="title"
                    name="title"
                    value={formData.title}
                    onChange={handleInputChange}
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:border-sky-500"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-gray-800 mb-1">
                    Message
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    value={formData.message}
                    onChange={handleInputChange}
                    rows={4}
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:border-sky-500"
                    required
                  ></textarea>
                </div>
                <div>
                  <label htmlFor="targetAudience" className="block text-sm font-medium text-gray-800 mb-1">
                    Target Audience
                  </label>
                  <select
                    id="targetAudience"
                    name="targetAudience"
                    value={formData.targetAudience}
                    onChange={handleInputChange}
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:border-sky-500"
                  >
                    {targetAudiences.map((audience) => (
                      <option key={audience.value} value={audience.value}>
                        {audience.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="priority" className="block text-sm font-medium text-gray-800 mb-1">
                    Priority
                  </label>
                  <select
                    id="priority"
                    name="priority"
                    value={formData.priority}
                    onChange={handleInputChange}
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:border-sky-500"
                  >
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="scheduledFor" className="block text-sm font-medium text-gray-800 mb-1">
                    Scheduled For (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    id="scheduledFor"
                    name="scheduledFor"
                    value={formData.scheduledFor}
                    onChange={handleInputChange}
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setEditingId(null);
                      setFormData({
                        title: "",
                        message: "",
                        targetAudience: "all_students",
                        selectedCourseId: "",
                        priority: "normal",
                        scheduledFor: "",
                      });
                    }}
                    className="px-6 py-3 bg-gray-200 text-gray-800 rounded-xl hover:bg-gray-300 transition-colors shadow-md flex items-center gap-2"
                  >
                    <X className="w-5 h-5" />
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={`px-6 py-3 bg-sky-500 text-white rounded-xl hover:bg-sky-600 transition-colors shadow-md flex items-center gap-2 ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <Send className="w-5 h-5" />
                    {isSubmitting ? "Sending..." : editingId ? "Save Changes" : "Send Announcement"}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
        {/* Confirm Dialog */}
        {confirmDlg.open && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-gray-100 rounded-3xl p-8 w-full max-w-md shadow-xl border border-gray-300">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-red-500/15 text-red-600 flex items-center justify-center">
                  <Trash2 className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-black text-gray-900">{confirmDlg.title || "Confirm"}</h3>
              </div>
              <p className="text-gray-800 mb-6">{confirmDlg.message || "Are you sure?"}</p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setConfirmDlg({ open: false })}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-xl hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => { try { await confirmDlg.onConfirm?.(); } catch {} finally { setConfirmDlg({ open: false }); } }}
                  className="px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
