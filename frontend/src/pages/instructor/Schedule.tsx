import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Users,
  BookOpen,
  Plus,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  AlertCircle,
  MapPin,
} from "lucide-react";

interface ScheduleItem {
  id: number;
  title: string;
  type: "class" | "office_hours" | "meeting" | "exam";
  startTime: string;
  endTime: string;
  date: string;
  location: string;
  description?: string;
  status: "scheduled" | "completed" | "cancelled";
}

import {
  listInstructorSchedule,
  createInstructorSchedule,
  updateInstructorSchedule,
  deleteInstructorSchedule,
  type ScheduleItem as ApiScheduleItem,
} from "../../lib/api";

export default function Schedule() {
  const navigate = useNavigate();
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [newEvent, setNewEvent] = useState({
    title: "",
    type: "class",
    startTime: "",
    endTime: "",
    location: "",
    description: "",
    status: "scheduled" as "scheduled" | "completed" | "cancelled",
  });

  // Load available dates (all events) once
  useEffect(() => {
    const loadDates = async () => {
      try {
        const res = await listInstructorSchedule();
        const items: ApiScheduleItem[] = res.data || [];
        const toDay = (iso: string) => String(iso).split('T')[0];
        const unique = Array.from(new Set(items.map((it) => toDay(it.date)))).sort();
        setAvailableDates(unique);
      } catch (e) {
        console.error("Failed to load available schedule dates", e);
        setAvailableDates([]);
      }
    };
    loadDates();
  }, []);

  // Load data from backend for selected day
  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const res = await listInstructorSchedule({ date: selectedDate });
        const items: ApiScheduleItem[] = res.data || [];
        // Normalize to local ScheduleItem type
        const toDay = (iso: string) => String(iso).split('T')[0];
        const mapped: ScheduleItem[] = items.map((it) => ({
          id: it.id,
          title: it.title,
          type: it.type,
          startTime: it.startTime,
          endTime: it.endTime,
          date: toDay(it.date),
          location: it.location,
          description: it.description,
          status: it.status,
        }));
        setScheduleItems(mapped);
      } catch (e) {
        console.error("Failed to load schedule", e);
        setScheduleItems([]);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [selectedDate]);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "class":
        return BookOpen;
      case "office_hours":
        return Users;
      case "meeting":
        return Calendar;
      case "exam":
        return AlertCircle;
      default:
        return Calendar;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "class":
        return "bg-blue-100 text-blue-800";
      case "office_hours":
        return "bg-green-100 text-green-800";
      case "meeting":
        return "bg-purple-100 text-purple-800";
      case "exam":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "scheduled":
        return Clock;
      case "completed":
        return CheckCircle;
      case "cancelled":
        return XCircle;
      default:
        return Clock;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "scheduled":
        return "text-blue-600";
      case "completed":
        return "text-green-600";
      case "cancelled":
        return "text-red-600";
      default:
        return "text-gray-600";
    }
  };

  const filteredItems = scheduleItems.filter(item => item.date === selectedDate);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setNewEvent(prev => ({ ...prev, [name]: value }));
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newEvent.title.trim() || !newEvent.startTime || !newEvent.endTime || !newEvent.location.trim()) {
      alert("Please fill in all required fields");
      return;
    }

    // Check if start time is before end time
    if (newEvent.startTime >= newEvent.endTime) {
      alert("Start time must be before end time");
      return;
    }

    try {
      const payload = {
        title: newEvent.title,
        type: newEvent.type as any,
        date: `${selectedDate}T00:00:00`,
        startTime: newEvent.startTime,
        endTime: newEvent.endTime,
        location: newEvent.location,
        description: newEvent.description || undefined,
        status: newEvent.status,
      };
      const res = await createInstructorSchedule(payload);
      const it = res.data;
      const newItem: ScheduleItem = {
        id: it.id,
        title: it.title,
        type: it.type,
        startTime: it.startTime,
        endTime: it.endTime,
        date: selectedDate,
        location: it.location,
        description: it.description,
        status: it.status,
      };
      // Update local state immediately
      setScheduleItems(prev => [...prev, newItem]);
      
      // Refresh available dates list
      try {
        const resAll = await listInstructorSchedule();
        const allItems: ApiScheduleItem[] = resAll.data || [];
        const toDay = (iso: string) => String(iso).split('T')[0];
        const unique = Array.from(new Set(allItems.map((it) => toDay(it.date)))).sort();
        setAvailableDates(unique);
      } catch (err) {
        console.warn("Failed to refresh available dates", err);
      }
      
      // Reset form and close modal
      setNewEvent({ title: "", type: "class", startTime: "", endTime: "", location: "", description: "", status: "scheduled" });
      setShowAddModal(false);
      alert("Event added successfully!");
    } catch (err) {
      console.error("Failed to create schedule item", err);
      alert("Failed to add event. Please try again.");
    }
  };

  const handleEditEvent = (id: number) => {
    const event = scheduleItems.find(item => item.id === id);
    if (event) {
      setEditingEventId(id);
      setNewEvent({
        title: event.title,
        type: event.type,
        startTime: event.startTime,
        endTime: event.endTime,
        location: event.location,
        description: event.description || "",
        status: event.status,
      });
      setShowEditModal(true);
    }
  };

  const handleUpdateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newEvent.title.trim() || !newEvent.startTime || !newEvent.endTime || !newEvent.location.trim()) {
      alert("Please fill in all required fields");
      return;
    }

    // Check if start time is before end time
    if (newEvent.startTime >= newEvent.endTime) {
      alert("Start time must be before end time");
      return;
    }

    if (editingEventId) {
      try {
        await updateInstructorSchedule(editingEventId, {
          title: newEvent.title,
          type: newEvent.type as any,
          startTime: newEvent.startTime,
          endTime: newEvent.endTime,
          location: newEvent.location,
          description: newEvent.description || undefined,
          status: newEvent.status,
        });
        // Update local state immediately
        setScheduleItems(prev => prev.map(item => 
          item.id === editingEventId 
            ? {
                ...item,
                title: newEvent.title,
                type: newEvent.type as any,
                startTime: newEvent.startTime,
                endTime: newEvent.endTime,
                location: newEvent.location,
                description: newEvent.description,
                status: newEvent.status,
              }
            : item
        ));
        
        // Refresh available dates list
        try {
          const resAll = await listInstructorSchedule();
          const allItems: ApiScheduleItem[] = resAll.data || [];
          const toDay = (iso: string) => String(iso).split('T')[0];
          const unique = Array.from(new Set(allItems.map((it) => toDay(it.date)))).sort();
          setAvailableDates(unique);
        } catch (err) {
          console.warn("Failed to refresh available dates", err);
        }
        
        // Reset form and close modal
        setNewEvent({ title: "", type: "class", startTime: "", endTime: "", location: "", description: "", status: "scheduled" });
        setEditingEventId(null);
        setShowEditModal(false);
        alert("Event updated successfully!");
      } catch (err) {
        console.error("Failed to update schedule item", err);
        alert("Failed to update event. Please try again.");
      }
    }
  };

  const handleDeleteEvent = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this event?")) return;
    try {
      await deleteInstructorSchedule(id);
      // 1) Refresh available dates from backend (ALL events)
      try {
        const resAll = await listInstructorSchedule();
        const allItems: ApiScheduleItem[] = resAll.data || [];
        const toDay = (iso: string) => String(iso).split('T')[0];
        const unique = Array.from(new Set(allItems.map((it) => toDay(it.date)))).sort();
        setAvailableDates(unique);

        // 2) Refresh current day's items
        const resDay = await listInstructorSchedule({ date: selectedDate });
        const dayItems: ApiScheduleItem[] = resDay.data || [];
        const mapped: ScheduleItem[] = dayItems.map((it) => ({
          id: it.id,
          title: it.title,
          type: it.type,
          startTime: it.startTime,
          endTime: it.endTime,
          date: toDay(it.date),
          location: it.location,
          description: it.description,
          status: it.status,
        }));
        setScheduleItems(mapped);

        // 3) If the selected day is now empty and not in unique list, jump to first available or today
        if (unique.indexOf(selectedDate) === -1) {
          const today = new Date().toISOString().split('T')[0];
          setSelectedDate(unique[0] || today);
        }
      } catch (err) {
        console.warn("Failed to refresh schedule after delete", err);
      }
    } catch (err) {
      console.error("Failed to delete schedule item", err);
      alert("Failed to delete event. Please try again.");
    }
  };

  const resetForm = () => {
    setNewEvent({
      title: "",
      type: "class",
      startTime: "",
      endTime: "",
      location: "",
      description: "",
      status: "scheduled",
    });
    setEditingEventId(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-200 text-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-lg font-medium text-gray-800">Loading schedule...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-200 text-gray-900">
      {/* Header */}
      <div className="relative z-10 bg-gray-200/10 backdrop-blur-md border-b border-gray-300">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate("/instructor/profile")}
                className="p-2 rounded-lg text-gray-800 hover:text-gray-900 transition-colors hover:bg-gray-300/70"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-r from-sky-500 to-sky-600 rounded-2xl flex items-center justify-center">
                  <Calendar className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-black text-gray-900">
                    Schedule
                  </h1>
                  <p className="text-gray-800">
                    Manage your classes and appointments
                  </p>
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-sky-500 to-sky-600 text-white font-medium rounded-xl hover:from-sky-600 hover:to-sky-700 transition-all duration-300"
            >
              <Plus className="w-5 h-5" />
              Add Event
            </button>
          </div>
        </div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-8">
        {/* Date Selector + Existing Dates Dropdown */}
        <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-6 mb-8 shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black text-gray-900 mb-2">
                Select Date
              </h2>
              <p className="text-gray-700">
                Choose a date to view your schedule ({filteredItems.length} events)
              </p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-sky-500"
              />
              <select
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-sky-500"
                title="Jump to a date that already has events"
              >
                <option value="" disabled>
                  Dates with events
                </option>
                {availableDates.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Schedule Items */}
        <div className="space-y-6">
          {filteredItems.length === 0 ? (
            <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-12 text-center shadow-xl">
              <Calendar className="w-16 h-16 mx-auto mb-4 text-gray-400" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                No events scheduled
              </h3>
              <p className="text-gray-600 mb-6">
                You don't have any events scheduled for this date.
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-sky-500 to-sky-600 text-white font-medium rounded-xl hover:from-sky-600 hover:to-sky-700 transition-all duration-300"
              >
                <Plus className="w-5 h-5" />
                Add Your First Event
              </button>
            </div>
          ) : (
            filteredItems.map((item) => {
              const TypeIcon = getTypeIcon(item.type);
              const StatusIcon = getStatusIcon(item.status);
              
              return (
                <div
                  key={item.id}
                  className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-6 shadow-xl hover:shadow-2xl transition-all duration-300"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <TypeIcon className="w-6 h-6 text-gray-700" />
                        <h3 className="text-xl font-bold text-gray-900">
                          {item.title}
                        </h3>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${getTypeColor(item.type)}`}>
                          {item.type.replace('_', ' ')}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div className="flex items-center gap-2 text-gray-700">
                          <Clock className="w-5 h-5" />
                          <span>{item.startTime} - {item.endTime}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-700">
                          <Calendar className="w-5 h-5" />
                          <span>{new Date(item.date).toLocaleDateString('en-US', { 
                            weekday: 'long', 
                            year: 'numeric', 
                            month: 'long', 
                            day: 'numeric' 
                          })}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-700">
                          <MapPin className="w-5 h-5" />
                          <span>{item.location}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-700">
                          <span className={`px-2 py-1 text-xs rounded-full border ${
                            item.status === 'scheduled' ? 'border-blue-300 text-blue-700' :
                            item.status === 'completed' ? 'border-green-300 text-green-700' :
                            'border-red-300 text-red-700'
                          }`}>
                            {item.status}
                          </span>
                        </div>
                      </div>
                      
                      {item.description && (
                        <p className="text-gray-600 mb-4">{item.description}</p>
                      )}
                      
                      <div className="flex items-center gap-2">
                        <StatusIcon className={`w-5 h-5 ${getStatusColor(item.status)}`} />
                        <span className={`font-medium ${getStatusColor(item.status)}`}>
                          {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => handleEditEvent(item.id)}
                        className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition-colors"
                        title="Edit Event"
                      >
                        <Edit className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleDeleteEvent(item.id)}
                        className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete Event"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Add Event Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-900 mb-6">
              Add New Event
            </h3>
            <form onSubmit={handleAddEvent} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Event Title *
                </label>
                <input
                  type="text"
                  name="title"
                  value={newEvent.title}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-sky-500"
                  placeholder="Enter event title"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Event Type
                </label>
                <select 
                  name="type"
                  value={newEvent.type}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-sky-500"
                >
                  <option value="class">Class</option>
                  <option value="office_hours">Office Hours</option>
                  <option value="meeting">Meeting</option>
                  <option value="exam">Exam</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Time *
                  </label>
                  <input
                    type="time"
                    name="startTime"
                    value={newEvent.startTime}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-sky-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Time *
                  </label>
                  <input
                    type="time"
                    name="endTime"
                    value={newEvent.endTime}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-sky-500"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Location *
                </label>
                <input
                  type="text"
                  name="location"
                  value={newEvent.location}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-sky-500"
                  placeholder="Enter location"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  name="description"
                  value={newEvent.description}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-sky-500"
                  placeholder="Enter event description (optional)"
                  rows={3}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-sky-500 to-sky-600 text-white rounded-lg hover:from-sky-600 hover:to-sky-700 transition-all duration-300"
                >
                  Add Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Event Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-900 mb-6">
              Edit Event
            </h3>
            <form onSubmit={handleUpdateEvent} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Event Title *
                </label>
                <input
                  type="text"
                  name="title"
                  value={newEvent.title}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-sky-500"
                  placeholder="Enter event title"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Event Type
                </label>
                <select 
                  name="type"
                  value={newEvent.type}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-sky-500"
                >
                  <option value="class">Class</option>
                  <option value="office_hours">Office Hours</option>
                  <option value="meeting">Meeting</option>
                  <option value="exam">Exam</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Time *
                  </label>
                  <input
                    type="time"
                    name="startTime"
                    value={newEvent.startTime}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-sky-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Time *
                  </label>
                  <input
                    type="time"
                    name="endTime"
                    value={newEvent.endTime}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-sky-500"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  name="status"
                  value={newEvent.status}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-sky-500"
                >
                  <option value="scheduled">Scheduled</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Location *
                </label>
                <input
                  type="text"
                  name="location"
                  value={newEvent.location}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-sky-500"
                  placeholder="Enter location"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  name="description"
                  value={newEvent.description}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-sky-500"
                  placeholder="Enter event description (optional)"
                  rows={3}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    resetForm();
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-sky-500 to-sky-600 text-white rounded-lg hover:from-sky-600 hover:to-sky-700 transition-all duration-300"
                >
                  Update Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
