import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  X,
  UserPlus,
  UserCheck,
  RefreshCw,
} from "lucide-react";
import {
  createStudent,
  getStudentProfile,
  updateStudentProfile,
  getCourses,
  adminEnrollStudent,
  getStudentEnrollments,
  getMe,
} from "../../lib/api";

export default function StudentForm() {
  console.log("[StudentForm] Component rendered.");
  const navigate = useNavigate();
  const { studentId: paramStudentId } = useParams<{ studentId: string }>();
  const isEditing = !!paramStudentId;

  const [formData, setFormData] = useState({
    student_number: "",
    full_name: "",
    email: "",
    phone: "",
    password: "",
    notes: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [availableCourses, setAvailableCourses] = useState<any[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [selectedCourses, setSelectedCourses] = useState<number[]>([]);
  const [initialCourses, setInitialCourses] = useState<number[]>([]);

  // Load available courses
  useEffect(() => {
    const fetchCourses = async () => {
      try {
        let instructorId: number | string | null = null;
        try {
          const meResponse = await getMe();
          instructorId = meResponse.data?.id || null;
        } catch {
          console.warn("Could not get instructor ID from /auth/me, falling back to localStorage");
          instructorId = localStorage.getItem("user_id");
        }

        if (!instructorId) {
          console.error("No instructor ID available");
          setAvailableCourses([]);
          return;
        }

        const params = { created_by: instructorId };
        const response = await getCourses(params);
        setAvailableCourses(response || []);
      } catch (error) {
        console.error("Error fetching courses:", error);
        setAvailableCourses([]);
      } finally {
        setLoadingCourses(false);
      }
    };
    fetchCourses();
  }, []);

  useEffect(() => {
    if (!isEditing) {
      setFormData({
        student_number: "",
        full_name: "",
        email: "",
        phone: "",
        password: "",
        notes: "",
      });
      setSelectedCourses([]);
      setInitialCourses([]);
    }
  }, [isEditing]);

  useEffect(() => {
    if (isEditing && paramStudentId) {
      const fetchStudentData = async () => {
        try {
          console.log("[StudentForm] paramStudentId from URL:", paramStudentId);
          console.log("[StudentForm] Fetching profile for studentId:", paramStudentId);
          const { data } = await getStudentProfile(paramStudentId);
          console.log("[StudentForm] Student Profile response:", data);
          setFormData({
            student_number: data.student_number || "",
            full_name: data.full_name || "",
            email: data.email || "",
            phone: data.phone || "",
            password: "",
            notes: data.notes || "",
          });
          console.log("[StudentForm] Fetching enrollments for studentId:", Number(paramStudentId));
          const enrollmentsResponse = await getStudentEnrollments(Number(paramStudentId));
          console.log("[StudentForm] Enrollments response:", enrollmentsResponse);
          const currentEnrollments = enrollmentsResponse.data?.filter(
            (e: any) => e.status === "Active"
          ) || [];
          if (currentEnrollments.length > 0) {
            const courseIds = currentEnrollments.map((e: any) => e.course_id);
            setSelectedCourses(courseIds);
            setInitialCourses(courseIds);
          }
        } catch (error) {
          console.error("[StudentForm] Error fetching student data:", error);
          alert("Failed to load student data.");
          navigate("/instructor/students");
        }
      };
      fetchStudentData();
    }
  }, [isEditing, paramStudentId, navigate]);

  useEffect(() => {
    return () => {
      setFormData({
        student_number: "",
        full_name: "",
        email: "",
        phone: "",
        password: "",
        notes: "",
      });
      setSelectedCourses([]);
      setInitialCourses([]);
    };
  }, []);

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.student_number) {
      newErrors.student_number = "Student number is required";
    } else if (!/^[A-Za-z0-9_.-]+$/.test(formData.student_number)) {
      newErrors.student_number = "Student number can include letters, numbers, '.', '-' or '_'";
    }

    if (!formData.full_name.trim()) {
      newErrors.full_name = "Full name is required";
    }

    if (!isEditing && !formData.password) {
      newErrors.password = "Password is required";
    } else if (!isEditing && formData.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters long";
    }

    if (selectedCourses.length === 0) {
      newErrors.course_ids = "At least one course selection is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (isEditing) {
        const studentUpdateData: any = {
          full_name: formData.full_name,
          email: formData.email,
          phone: formData.phone,
          notes: formData.notes,
        };
        await updateStudentProfile(paramStudentId!, studentUpdateData);

        const coursesToAdd = selectedCourses.filter(id => !initialCourses.includes(id));
        const coursesToRemove = initialCourses.filter(id => !selectedCourses.includes(id));
        
        for (const courseId of coursesToRemove) {
          console.log(`Would unenroll from course ${courseId}`);
        }
        
        for (const courseId of coursesToAdd) {
          await adminEnrollStudent({
            student_id: Number(paramStudentId!),
            course_id: Number(courseId),
          });
        }
        alert("Student updated successfully!");
      } else {
        const studentCreateData = {
          student_number: formData.student_number,
          full_name: formData.full_name,
          email: formData.email,
          phone: formData.phone,
          password: formData.password,
          notes: formData.notes,
          course_ids: selectedCourses,
        };
        await createStudent(studentCreateData);
        alert("Student added successfully!");
      }

      navigate("/instructor/students");
    } catch (error: any) {
      console.error(`Error ${isEditing ? "updating" : "adding"} student:`, error);
      
      let message = `Failed to ${isEditing ? "update" : "add"} student. Please try again.`;
      
      if (error?.response?.data?.detail) {
        message = error.response.data.detail;
      } else if (error?.response?.data?.message) {
        message = error.response.data.message;
      } else if (error?.response?.status === 401) {
        message = "Unauthorized - please sign in again.";
      } else if (error?.response?.status === 403) {
        message = "Forbidden - instructor role required.";
      } else if (error?.response?.status === 409) {
        message = "Student number already exists.";
      } else if (error?.message && typeof error.message === 'string') {
        message = error.message;
      } else if (typeof error === 'string') {
        message = error;
      }
      
      alert(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  return (
    <div className="min-h-screen bg-gray-200 text-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate("/instructor/students")}
            className="p-2 text-gray-800 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-300/70"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-3xl font-black text-gray-900">
              {isEditing ? "Edit Student" : "Add New Student"}
            </h1>
            <p className="text-gray-800">
              {isEditing
                ? `Manage details for student ID: ${paramStudentId}`
                : "Register a new student in the system"}
            </p>
          </div>
        </div>

        <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl p-8 w-full max-w-4xl mx-auto shadow-xl border border-gray-300">
          <form
            key={isEditing ? `edit-${paramStudentId}` : 'create'}
            onSubmit={handleSubmit}
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
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
                className={`w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:border-sky-500 ${
                  isEditing ? "bg-gray-200 cursor-not-allowed" : ""
                }`}
                placeholder="Enter student number"
                disabled={isEditing}
              />
              {errors.student_number && (
                <p className="text-red-600 text-xs mt-1">{errors.student_number}</p>
              )}
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
              {errors.full_name && (
                <p className="text-red-600 text-xs mt-1">{errors.full_name}</p>
              )}
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
                autoComplete="off"
              />
              {errors.email && (
                <p className="text-red-600 text-xs mt-1">{errors.email}</p>
              )}
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
              {errors.phone && (
                <p className="text-red-600 text-xs mt-1">{errors.phone}</p>
              )}
            </div>

            {!isEditing && (
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-800 mb-1">
                  Password <span className="text-red-600">*</span>
                </label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:border-sky-500"
                  placeholder="Enter password"
                  autoComplete="new-password"
                />
                {errors.password && (
                  <p className="text-red-600 text-xs mt-1">{errors.password}</p>
                )}
              </div>
            )}

            <div>
              <label htmlFor="course_ids" className="block text-sm font-medium text-gray-800 mb-1">
                Courses <span className="text-red-600">*</span>
              </label>
              {loadingCourses ? (
                <div className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 text-gray-700">
                  Loading courses...
                </div>
              ) : availableCourses.length === 0 ? (
                <div className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 text-gray-700">
                  No courses available. Please create one first.
                </div>
              ) : (
                <div className="w-full bg-gray-50 border border-gray-300 rounded-lg p-3 max-h-48 overflow-y-auto">
                  {availableCourses.map((course) => (
                    <label key={course.id} className="flex items-center space-x-3 py-2 hover:bg-gray-100 rounded px-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedCourses.includes(course.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedCourses([...selectedCourses, course.id]);
                          } else {
                            setSelectedCourses(selectedCourses.filter(id => id !== course.id));
                          }
                        }}
                        className="w-4 h-4 text-sky-600 bg-gray-100 border-gray-300 rounded focus:ring-sky-500 focus:ring-2"
                      />
                      <span className="text-sm text-gray-900">
                        {course.name} ({course.code})
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {errors.course_ids && (
                <p className="text-red-600 text-xs mt-1">{errors.course_ids}</p>
              )}
              {selectedCourses.length > 0 && (
                <p className="text-sm text-gray-600 mt-2">
                  Selected {selectedCourses.length} course{selectedCourses.length !== 1 ? 's' : ''}
                </p>
              )}
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
              />
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
                className={`px-6 py-3 bg-sky-500 text-white rounded-xl hover:bg-sky-600 transition-colors shadow-md flex items-center gap-2 ${
                  isSubmitting ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                {isSubmitting ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : isEditing ? (
                  <UserCheck className="w-5 h-5" />
                ) : (
                  <UserPlus className="w-5 h-5" />
                )}
                {isSubmitting
                  ? `${isEditing ? "Updating" : "Adding"} Student...`
                  : `${isEditing ? "Update Student" : "Add Student"}`}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
