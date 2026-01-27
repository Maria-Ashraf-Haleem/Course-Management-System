import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BookMarked, Save } from "lucide-react";
import { createCourse, listDepartments } from "../../lib/api";
import toast from "react-hot-toast";

interface Department {
  department_id: number;
  name: string;
}

export default function CreateCourse() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    code: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<any>({});

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev: any) => ({ ...prev, [name]: undefined })); // Clear error on change
  };

  const validateForm = () => {
    const newErrors: any = {};
    if (!formData.title.trim()) newErrors.title = "Course title is required.";
    if (!formData.code.trim()) newErrors.code = "Course code is required.";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) {
      toast.error("Please fix the form errors.");
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        title: formData.title,
        description: formData.description,
        code: formData.code,
      };
      await createCourse(payload);
      toast.success("Course created successfully!");
      navigate("/instructor/dashboard");
    } catch (error: any) {
      console.error("Failed to create course:", error);
      const errorMessage =
        error.response?.data?.detail || "Failed to create course.";
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-200 text-gray-900">
      {/* Animated Background - simplified for a new page, reuse from Dashboard.tsx if possible */}
      <div className="absolute inset-0 bg-gray-200/90" />

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-12">
        <button
          onClick={() => navigate(-1)}
          className="mb-8 flex items-center gap-2 text-gray-800 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Dashboard
        </button>

        <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-8 shadow-xl">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-16 h-16 bg-gradient-to-r from-sky-500 to-sky-600 rounded-2xl flex items-center justify-center shadow-lg">
              <BookMarked className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-gray-900">
                Create New Course
              </h1>
              <p className="text-gray-800 text-lg">
                Define the details for your new academic course.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-800 mb-2">
                Course Title
              </label>
              <input
                type="text"
                id="title"
                name="title"
                value={formData.title}
                onChange={handleChange}
                className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-500 focus:outline-none focus:border-sky-500 transition-colors"
                placeholder="e.g., Advanced Dental Procedures"
              />
              {errors.title && (
                <p className="mt-2 text-sm text-red-600">{errors.title}</p>
              )}
            </div>
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-800 mb-2">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={4}
                className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-500 focus:outline-none focus:border-sky-500 transition-colors"
                placeholder="A brief overview of the course content and objectives."
              ></textarea>
            </div>
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-gray-800 mb-2">
                Course Code
              </label>
              <input
                type="text"
                id="code"
                name="code"
                value={formData.code}
                onChange={handleChange}
                className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-500 focus:outline-none focus:border-sky-500 transition-colors"
                placeholder="e.g., DENT401"
              />
              {errors.code && (
                <p className="mt-2 text-sm text-red-600">{errors.code}</p>
              )}
            </div>
            <div className="flex justify-end mt-8">
              <button
                type="submit"
                disabled={isLoading}
                className={`flex items-center gap-2 px-8 py-3 bg-sky-500 text-white font-bold rounded-xl hover:bg-sky-600 transition-all duration-300 shadow-lg ${
                  isLoading ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                <Save className="w-5 h-5" />
                {isLoading ? "Creating Course..." : "Create Course"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
