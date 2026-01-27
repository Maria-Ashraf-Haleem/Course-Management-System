import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, UserPlus, X } from "lucide-react";
import { createStudent, getCourses } from "../../lib/api";

export default function AddStudent() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    student_number: "",
    full_name: "",
    email: "",
    phone: "",
    course_id: "",
    notes: "",
    year_level: "Fourth",
    status: "Active",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [courses, setCourses] = useState<any[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const response = await getCourses();
        setCourses(response || []);
      } catch (error) {
        console.error("Error fetching courses:", error);
        // Optionally display an error to the user
      } finally {
        setLoadingCourses(false);
      }
    };
    fetchCourses();
  }, []);

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    // Validate student number - must be exactly 4 digits
    if (!formData.student_number) {
      newErrors.student_number = "Student number is required";
    } else if (!/^\d{4}$/.test(formData.student_number)) {
      newErrors.student_number = "Student number must be exactly 4 digits";
    }

    // Validate full name
    if (!formData.full_name.trim()) {
      newErrors.full_name = "Full name is required";
    }

    // Validate course_id
    if (!formData.course_id) {
      newErrors.course_id = "Course selection is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form before submitting
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Prepare data for API call - ensure all fields are properly formatted
      const studentData = {
        student_number: formData.student_number.trim(),
        full_name: formData.full_name.trim(),
        email: formData.email.trim() || null,
        phone: formData.phone.trim() || null,
        course_id: parseInt(formData.course_id),
        notes: formData.notes.trim() || null,
        year_level: formData.year_level,
        status: formData.status,
      };

      // Call API to create student
      await createStudent(studentData);

      // Show success message
      alert("Student added successfully!");

      // Redirect back to students list
      navigate("/instructor/students");
    } catch (error: any) {
      console.error("Error adding student:", error);
      const message =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        (error?.response?.status === 401
          ? "Unauthorized - please sign in again."
          : undefined) ||
        (error?.response?.status === 403
          ? "Forbidden - doctor role required."
          : undefined) ||
        (error?.response?.status === 409
          ? "Student already exists."
          : undefined) ||
        error?.message ||
        "Failed to add student. Please try again.";
      alert(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  return (
    <div className="min-h-screen bg-gray-200 text-gray-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate("/instructor/students")}
            className="p-2 text-gray-800 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-300/70"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-3xl font-black text-gray-900">Add New Student</h1>
            <p className="text-gray-800">Register a new student in the system</p>
          </div>
        </div>

        {/* Form */}
        <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl p-8 w-full max-w-4xl mx-auto shadow-xl border border-gray-300">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="student_number" className="block text-sm font-medium text-gray-800 mb-1">
                Student Number <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                id="student_number"
                name="student_number"
                value={formData.student_number}
                onChange={handleInputChange}
                className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:border-sky-500"
                placeholder="Enter 4-digit student number"
                maxLength={4}
              />
              {errors.student_number && <p className="text-red-600 text-xs mt-1">{errors.student_number}</p>}
            </div>
            <div>
              <label htmlFor="full_name" className="block text-sm font-medium text-gray-800 mb-1">
                Full Name <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                id="full_name"
                name="full_name"
                value={formData.full_name}
                onChange={handleInputChange}
                className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:border-sky-500"
                placeholder="Enter full name"
              />
              {errors.full_name && <p className="text-red-600 text-xs mt-1">{errors.full_name}</p>}
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-800 mb-1">
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:border-sky-500"
                placeholder="Enter email address"
              />
              {errors.email && <p className="text-red-600 text-xs mt-1">{errors.email}</p>}
            </div>
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-800 mb-1">
                Phone
              </label>
              <input
                type="text"
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:border-sky-500"
                placeholder="Enter phone number"
              />
              {errors.phone && <p className="text-red-600 text-xs mt-1">{errors.phone}</p>}
            </div>
            <div>
              <label htmlFor="course_id" className="block text-sm font-medium text-gray-800 mb-1">
                Course <span className="text-red-600">*</span>
              </label>
              {loadingCourses ? (
                <div className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 text-gray-700">Loading courses...</div>
              ) : (
                <select
                  id="course_id"
                  name="course_id"
                  value={formData.course_id}
                  onChange={handleInputChange}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:border-sky-500"
                >
                  <option value="">Select a course</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
                </select>
              )}
              {errors.course_id && <p className="text-red-600 text-xs mt-1">{errors.course_id}</p>}
            </div>
            <div className="md:col-span-2">
              <label htmlFor="notes" className="block text-sm font-medium text-gray-800 mb-1">
                Notes
              </label>
              <textarea
                id="notes"
                name="notes"
                value={formData.notes}
                onChange={handleInputChange}
                rows={3}
                className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:border-sky-500"
                placeholder="Additional notes about the student"
              ></textarea>
            </div>
            <div className="md:col-span-2 flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => navigate("/instructor/students")}
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
                <UserPlus className="w-5 h-5" />
                {isSubmitting ? "Adding Student..." : "Add Student"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
