import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  GraduationCap,
  Award,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { getInstructorProfile, updateInstructorProfile } from "../../lib/api";

interface EducationItem {
  id: number;
  degree: string;
  institution: string;
  year: string;
  field: string;
}

interface CertificationItem {
  id: number;
  name: string;
  issuer: string;
  year: string;
  credentialId?: string;
}

export default function EditEducation() {
  const navigate = useNavigate();
  const [educations, setEducations] = useState<EducationItem[]>([]);
  const [certifications, setCertifications] = useState<CertificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Load data from backend or fallback to mock data
  useEffect(() => {
    const loadData = async () => {
      try {
        const res = await getInstructorProfile();
        const p = res.data || {};
        const edu = Array.isArray(p.education) ? p.education : [];
        const cert = Array.isArray(p.certifications) ? p.certifications : [];
        // Normalize to component types (ensure required keys exist)
        setEducations(
          edu.map((e: any, idx: number) => ({
            id: e.id ?? Date.now() + idx,
            degree: e.degree ?? "",
            institution: e.institution ?? "",
            year: e.year ?? "",
            field: e.field ?? "",
          }))
        );
        setCertifications(
          cert.map((c: any, idx: number) => ({
            id: c.id ?? Date.now() + idx,
            name: c.name ?? "",
            issuer: c.issuer ?? "",
            year: c.year ?? "",
            credentialId: c.credentialId ?? "",
          }))
        );
      } catch (e) {
        // Fallback mock data if API not available
        const mockEducations: EducationItem[] = [
          { id: 1, degree: "", institution: "", year: "", field: "" },
        ];
        setEducations(mockEducations);
        setCertifications([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const addEducation = () => {
    const newEducation: EducationItem = {
      id: Date.now(),
      degree: "",
      institution: "",
      year: "",
      field: ""
    };
    setEducations(prev => [...prev, newEducation]);
  };

  const updateEducation = (id: number, field: string, value: string) => {
    setEducations(prev => prev.map(edu => 
      edu.id === id ? { ...edu, [field]: value } : edu
    ));
  };

  const removeEducation = (id: number) => {
    setEducations(prev => prev.filter(edu => edu.id !== id));
  };

  const addCertification = () => {
    const newCertification: CertificationItem = {
      id: Date.now(),
      name: "",
      issuer: "",
      year: "",
      credentialId: ""
    };
    setCertifications(prev => [...prev, newCertification]);
  };

  const updateCertification = (id: number, field: string, value: string) => {
    setCertifications(prev => prev.map(cert => 
      cert.id === id ? { ...cert, [field]: value } : cert
    ));
  };

  const removeCertification = (id: number) => {
    setCertifications(prev => prev.filter(cert => cert.id !== id));
  };

  const handleSave = async () => {
    // Validate required fields
    const invalidEducations = educations.filter(edu => 
      !edu.degree.trim() || !edu.institution.trim() || !edu.year.trim()
    );
    
    const invalidCertifications = certifications.filter(cert => 
      !cert.name.trim() || !cert.issuer.trim() || !cert.year.trim()
    );

    if (invalidEducations.length > 0 || invalidCertifications.length > 0) {
      setMessage({
        type: "error",
        text: "Please fill in all required fields for education and certifications."
      });
      return;
    }

    // Save to backend
    try {
      // Prepare payload shapes expected by backend
      const educationPayload = educations.map((e) => ({
        id: e.id,
        degree: e.degree,
        institution: e.institution,
        year: e.year,
        field: e.field,
      }));
      const certificationsPayload = certifications.map((c) => ({
        id: c.id,
        name: c.name,
        issuer: c.issuer,
        year: c.year,
        credentialId: c.credentialId,
      }));

      await updateInstructorProfile({
        education: educationPayload,
        certifications: certificationsPayload,
      });

      setMessage({
        type: "success",
        text: "Education and certifications updated successfully!",
      });

      setTimeout(() => {
        setMessage(null);
        navigate("/instructor/profile");
      }, 1200);
    } catch (e: any) {
      setMessage({
        type: "error",
        text: e?.response?.data?.detail || "Failed to save changes. Please try again.",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-200 text-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-lg font-medium text-gray-800">Loading...</p>
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
                  <GraduationCap className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-black text-gray-900">
                    Edit Education & Certifications
                  </h1>
                  <p className="text-gray-800">
                    Manage your academic qualifications and professional certifications
                  </p>
                </div>
              </div>
            </div>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-sky-500 to-sky-600 text-white font-medium rounded-xl hover:from-sky-600 hover:to-sky-700 transition-all duration-300"
            >
              <Save className="w-5 h-5" />
              Save Changes
            </button>
          </div>
        </div>
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-8">
        {message && (
          <div
            className={`mb-8 p-4 rounded-2xl flex items-center gap-4 ${
              message.type === "success"
                ? "bg-emerald-100 text-emerald-800 border border-emerald-400"
                : "bg-red-100 text-red-800 border border-red-400"
            }`}
          >
            {message.type === "success" ? (
              <CheckCircle className="w-6 h-6" />
            ) : (
              <AlertCircle className="w-6 h-6" />
            )}
            <div>
              <h3 className="font-semibold">
                {message.type === "success" ? "Success!" : "Error!"}
              </h3>
              <p className="text-sm">{message.text}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Education Section */}
          <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-8 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black text-gray-900 flex items-center gap-3">
                <GraduationCap className="w-6 h-6 text-gray-800" />
                Education
              </h2>
              <button
                onClick={addEducation}
                className="flex items-center gap-2 px-4 py-2 bg-sky-100 text-sky-700 rounded-lg hover:bg-sky-200 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Education
              </button>
            </div>

            <div className="space-y-4">
              {educations.map((education) => (
                <div
                  key={education.id}
                  className="bg-gray-50/70 rounded-xl p-4 border border-gray-200"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900">Education Entry</h3>
                    <button
                      onClick={() => removeEducation(education.id)}
                      className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Degree *
                      </label>
                      <input
                        type="text"
                        value={education.degree}
                        onChange={(e) => updateEducation(education.id, "degree", e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-sky-500"
                        placeholder="e.g., Bachelor of Science, Master of Arts"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Institution *
                      </label>
                      <input
                        type="text"
                        value={education.institution}
                        onChange={(e) => updateEducation(education.id, "institution", e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-sky-500"
                        placeholder="e.g., Cairo University"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Year *
                        </label>
                        <input
                          type="text"
                          value={education.year}
                          onChange={(e) => updateEducation(education.id, "year", e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-sky-500"
                          placeholder="e.g., 2020"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Field of Study
                        </label>
                        <input
                          type="text"
                          value={education.field}
                          onChange={(e) => updateEducation(education.id, "field", e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-sky-500"
                          placeholder="e.g., Computer Science"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {educations.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No education entries added yet.</p>
                  <p className="text-sm">Click "Add Education" to get started.</p>
                </div>
              )}
            </div>
          </div>

          {/* Certifications Section */}
          <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl border border-gray-300 p-8 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black text-gray-900 flex items-center gap-3">
                <Award className="w-6 h-6 text-gray-800" />
                Certifications
              </h2>
              <button
                onClick={addCertification}
                className="flex items-center gap-2 px-4 py-2 bg-sky-100 text-sky-700 rounded-lg hover:bg-sky-200 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Certification
              </button>
            </div>

            <div className="space-y-4">
              {certifications.map((certification) => (
                <div
                  key={certification.id}
                  className="bg-gray-50/70 rounded-xl p-4 border border-gray-200"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900">Certification Entry</h3>
                    <button
                      onClick={() => removeCertification(certification.id)}
                      className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Certification Name *
                      </label>
                      <input
                        type="text"
                        value={certification.name}
                        onChange={(e) => updateCertification(certification.id, "name", e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-sky-500"
                        placeholder="e.g., AWS Certified Solutions Architect"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Issuing Organization *
                      </label>
                      <input
                        type="text"
                        value={certification.issuer}
                        onChange={(e) => updateCertification(certification.id, "issuer", e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-sky-500"
                        placeholder="e.g., Amazon Web Services"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Year *
                        </label>
                        <input
                          type="text"
                          value={certification.year}
                          onChange={(e) => updateCertification(certification.id, "year", e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-sky-500"
                          placeholder="e.g., 2021"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Credential ID
                        </label>
                        <input
                          type="text"
                          value={certification.credentialId || ""}
                          onChange={(e) => updateCertification(certification.id, "credentialId", e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-sky-500"
                          placeholder="e.g., AWS-CSA-123456"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {certifications.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <Award className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No certifications added yet.</p>
                  <p className="text-sm">Click "Add Certification" to get started.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
