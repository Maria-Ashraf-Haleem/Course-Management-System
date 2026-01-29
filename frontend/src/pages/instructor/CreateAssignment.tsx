import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, BookOpen, Save, X, Sparkles, Upload, Loader2, FileText, Download, Eye } from "lucide-react";
import { createAssignment, getCourses, generateQuestionsFromPDF, api } from "../../lib/api";
import toast from "react-hot-toast";

export default function CreateAssignment() {
  const navigate = useNavigate();
  const location = useLocation();
  const search = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const lockedCourseId = useMemo(() => {
    const cid = search.get("courseId");
    return cid ? Number(cid) : undefined;
  }, [search]);
  const returnTo = useMemo(() => {
    const r = search.get("returnTo");
    return r ? decodeURIComponent(r) : undefined;
  }, [search]);
  const fallbackReturnTo = useMemo(() => {
    return lockedCourseId ? `/instructor/courses/${lockedCourseId}?tab=assignments` : undefined;
  }, [lockedCourseId]);
  const [courses, setCourses] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    course_id: "",
    deadline: "",
    max_grade: 100.0,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [assignmentPdf, setAssignmentPdf] = useState<File | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  
  // AI Generator Modal State
  const [showAIModal, setShowAIModal] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [numQuestions, setNumQuestions] = useState<number>(10);
  
  interface QuestionChoice {
    letter: string;
    text: string;
    isCorrect?: boolean;
  }

  interface ParsedQuestion {
    number: number;
    text: string;
    type: string;
    choices: QuestionChoice[];
    correctAnswer?: string;
  }

  const [parsedQuestions, setParsedQuestions] = useState<ParsedQuestion[] | null>(null);
  const [questionTypes, setQuestionTypes] = useState({
    mcq: true,
    trueFalse: true,
    shortAnswer: true,
  });
  const [includeAnswers, setIncludeAnswers] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState<string>("");
  const [aiGeneratorPdf, setAiGeneratorPdf] = useState<File | null>(null);

  // Parse questions from generated text
  const parseQuestions = (text: string): ParsedQuestion[] => {
    console.log('Raw text for parsing:', text);
    if (!text) return [];
    
    // First, normalize line endings and clean up the text
    const normalizedText = text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n');

    console.log('Normalized text:', normalizedText);
    
    // Try to split by question blocks
    let questionBlocks = normalizedText.split(/(?=TrueFalse:|MCQ:|\d+\.\s|Question\s*\d*:?\s*)/i);
    
    if (questionBlocks.length <= 1) {
      questionBlocks = normalizedText.split(/\n\s*\n/);
    }
    
    const result = questionBlocks.map((block, index): ParsedQuestion | null => {
      block = block.trim();
      if (!block) return null;
      
      let type = 'short answer';
      let questionText = '';
      let choices: QuestionChoice[] = [];
      let correctAnswer = '';
      
      const isTrueFalse = block.match(/^TrueFalse:/i) || 
                         (block.match(/true\s*\/\s*false|true or false|t\s*\/\s*f/gi) && 
                          !block.match(/[A-D]\)/));
      
      if (isTrueFalse) {
        type = 'true/false';
        
        const questionMatch = block.match(/Question:([\s\S]+?)(?=Answer:|$)/i) || 
                            block.match(/([\s\S]+?)(?=Answer:|$)/i) ||
                            ['', block];
        
        let answerMatch = block.match(/Answer:\s*(True|False)/i);
        if (!answerMatch) {
          if (block.match(/\bTrue\b/i) && !block.match(/\bFalse\b/i)) {
            answerMatch = ['', 'True'];
          } else if (block.match(/\bFalse\b/i) && !block.match(/\bTrue\b/i)) {
            answerMatch = ['', 'False'];
          }
        }
        
        if (questionMatch) {
          questionText = questionMatch[1]?.trim() || block;
          
          questionText = questionText
            .replace(/Answer:.*/i, '')
            .replace(/\([^)]*\)/g, '')
            .replace(/\s+/g, ' ')
            .trim();
            
          if (!/[.?!]$/.test(questionText)) {
            questionText = questionText + '?';
          }
        }
        
        if (answerMatch) {
          correctAnswer = answerMatch[1].trim();
          choices = [
            { letter: 'A', text: 'True', isCorrect: correctAnswer.toLowerCase() === 'true' },
            { letter: 'B', text: 'False', isCorrect: correctAnswer.toLowerCase() === 'false' }
          ];
        } else {
          choices = [
            { letter: 'A', text: 'True', isCorrect: false },
            { letter: 'B', text: 'False', isCorrect: false }
          ];
        }
      } 
      else if (block.match(/^MCQ:/i) || block.match(/[A-D]\)/)) {
        type = 'multiple choice';
        
        const questionMatch = block.match(/Question:([\s\S]+?)(?=[A-D]\)|$)/i) || 
                            block.match(/([\s\S]+?)(?=[A-D]\)|$)/i) ||
                            block.match(/([\s\S]+?)(?=\n[A-D]\.|$)/i) ||
                            ['', block];
        
        if (questionMatch) {
          questionText = questionMatch[1]?.trim() || block;
          
          questionText = questionText
            .replace(/Answer:.*/i, '')
            .replace(/\([^)]*\)/g, '')
            .replace(/\s+/g, ' ')
            .trim();
            
          if (!/[.?!]$/.test(questionText)) {
            questionText = questionText + '?';
          }
        }
        
        const choiceRegex = /([A-D])[.)]\s*([^\n]+)/gi;
        let match;
        const foundChoices: {[key: string]: string} = {};
        
        while ((match = choiceRegex.exec(block)) !== null) {
          const letter = match[1].toUpperCase();
          foundChoices[letter] = match[2].trim();
        }
        
        const answerMatch = block.match(/Correct Answer:\s*([A-D])/i) || 
                          block.match(/Answer:\s*([A-D])/i);
                          
        if (answerMatch) {
          correctAnswer = answerMatch[1].toUpperCase();
        }
        
        Object.entries(foundChoices).forEach(([letter, text]) => {
          choices.push({
            letter,
            text: text.replace(/\([^)]*\)/g, '').trim(),
            isCorrect: letter === correctAnswer
          });
        });
        
        if (choices.length === 0 && correctAnswer) {
          choices = [
            { letter: 'A', text: 'True', isCorrect: correctAnswer === 'A' },
            { letter: 'B', text: 'False', isCorrect: correctAnswer === 'B' }
          ];
        }
      }
      else {
        if (block.trim()) {
          type = 'short answer';
          questionText = block
            .replace(/^\d+[\.\)]\s*/, '')
            .replace(/\s+/g, ' ')
            .trim();
          
          if (!/[.?!]$/.test(questionText)) {
            questionText += '?';
          }
          
          return {
            number: index + 1,
            text: questionText,
            type,
            choices: [],
            correctAnswer: ''
          };
        }
        
        return null;
      }
      
      if (questionText && !/[.?!]$/.test(questionText)) {
        questionText += '?';
      }
      
      if (!questionText) return null;
      
      return {
        number: index + 1,
        text: questionText,
        type,
        choices,
        correctAnswer
      };
    }).filter((q): q is ParsedQuestion => q !== null);

    return result;
  };

  useEffect(() => {
    try {
      if (generatedQuestions) {
        console.log('Raw generated questions:', generatedQuestions);
        const parsed = parseQuestions(generatedQuestions);
        console.log('Parsed questions:', parsed);
        
        if (!parsed.length && generatedQuestions) {
          console.log('No questions parsed, trying fallback parsing...');
          const fallbackQuestions = generatedQuestions
            .split(/\n\s*\n+/)
            .filter(q => q.trim().length > 10)
            .map((q, i) => ({
              number: i + 1,
              text: q.replace(/^\d+[\.\)]\s*/, '').trim(),
              type: q.match(/true\/false|true or false|t\/f/gi) ? 'true/false' : 'short answer',
              choices: [],
              correctAnswer: ''
            }));
          
          console.log('Fallback parsed questions:', fallbackQuestions);
          setParsedQuestions(fallbackQuestions);
        } else {
          setParsedQuestions(parsed);
        }
      } else {
        setParsedQuestions([]);
      }
    } catch (error) {
      console.error('Error parsing questions:', error);
      if (generatedQuestions) {
        const fallback = [{
          number: 1,
          text: 'Generated questions (format issue)',
          type: 'short answer',
          choices: [],
          correctAnswer: ''
        }];
        setParsedQuestions(fallback);
      } else {
        setParsedQuestions([]);
      }
    }
  }, [generatedQuestions]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const coursesResponse = await getCourses();
        const list = coursesResponse || [];
        setCourses(list);

        if (lockedCourseId) {
          setFormData((prev) => ({ ...prev, course_id: String(lockedCourseId) }));
        }
      } catch (error) {
        console.error("Error loading courses:", error);
      }
    };

    loadData();
  }, [lockedCourseId]);

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.title.trim()) {
      newErrors.title = "Assignment title is required";
    }

    if (!formData.course_id) {
      newErrors.course_id = "Course selection is required";
    }

    if (!formData.deadline) {
      newErrors.deadline = "Deadline is required";
    } else {
      const deadlineDate = new Date(formData.deadline);
      const now = new Date();
      if (deadlineDate <= now) {
        newErrors.deadline = "Deadline must be in the future";
      }
    }

    if (!formData.max_grade || formData.max_grade <= 0) {
      newErrors.max_grade = "Maximum grade must be greater than 0";
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
      const deadlineDate = new Date(formData.deadline);

      const assignmentData: any = {
        title: formData.title,
        description: formData.description || undefined,
        course_id: parseInt(formData.course_id),
        deadline: deadlineDate.toISOString(),
        max_grade: parseFloat(formData.max_grade.toString()),
      };

      if (assignmentPdf) {
        const formDataToSend = new FormData();
        formDataToSend.append("title", assignmentData.title);
        formDataToSend.append("description", assignmentData.description || "");
        formDataToSend.append("course_id", assignmentData.course_id.toString());
        formDataToSend.append("deadline", assignmentData.deadline);
        formDataToSend.append("max_grade", assignmentData.max_grade.toString());
        formDataToSend.append("pdf_file", assignmentPdf);

        await api.post("/assignments", formDataToSend, {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        });

        toast.success("Assignment created successfully with PDF attachment!");
      } else {
        await createAssignment(assignmentData);
        toast.success("Assignment created successfully!");
      }

      const target = returnTo || fallbackReturnTo;
      if (target) navigate(target, { replace: true });
      else navigate(-1);
    } catch (error: any) {
      console.error("Error creating assignment:", error);

      let errorMessage = "Failed to create assignment. Please try again.";

      if (error?.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error?.response?.status === 401) {
        errorMessage = "Authentication required. Please log in again.";
      } else if (error?.response?.status === 403) {
        errorMessage = "Access denied. Doctor profile required.";
      } else if (error?.response?.status === 400) {
        errorMessage =
          error?.response?.data?.detail ||
          "Invalid data provided. Please check all required fields.";
      }

      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    if (name === "course_id" && lockedCourseId) {
      return;
    }
    setFormData((prev) => ({ ...prev, [name]: value }));

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== "application/pdf") {
        toast.error("Please upload a PDF file");
        return;
      }
      setAssignmentPdf(file);
      const url = URL.createObjectURL(file);
      setPdfPreviewUrl(url);
    }
  };

  const handleAIGeneratorPdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== "application/pdf") {
        toast.error("Please upload a PDF file");
        return;
      }
      setPdfFile(file);
      if (assignmentPdf && pdfPreviewUrl) {
        URL.revokeObjectURL(pdfPreviewUrl);
      }
      setAssignmentPdf(null);
      setAiGeneratorPdf(null);
      setPdfPreviewUrl(null);
      toast.success("PDF uploaded. Generate questions to create a PDF with questions that will be attached.");
    }
  };

  const handlePdfDownload = () => {
    if (assignmentPdf) {
      const url = URL.createObjectURL(assignmentPdf);
      const a = document.createElement("a");
      a.href = url;
      a.download = assignmentPdf.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const handleRemovePdf = () => {
    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl);
    }
    setAssignmentPdf(null);
    setPdfPreviewUrl(null);
    setAiGeneratorPdf(null);
  };

  const handleClearAIGenerator = () => {
    setGeneratedQuestions("");
    setPdfFile(null);
    
    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl);
    }
    setAssignmentPdf(null);
    setPdfPreviewUrl(null);
    setAiGeneratorPdf(null);
    
    setFormData((prev) => {
      const description = prev.description || "";
      const parts = description.split("--- Generated Questions ---");
      const cleanedDescription = parts.length > 1 ? parts[0].trim() : description;
      return {
        ...prev,
        description: cleanedDescription,
      };
    });
    
    toast.success("AI Generator cleared. You can now generate new questions.");
  };

  const generatePdfFromQuestions = async (questions: string, assignmentTitle: string = "Assignment Questions") => {
    try {
      console.log("[PDF Generation] Starting PDF generation...", { assignmentTitle, questionsLength: questions.length });
      
      const formData = new FormData();
      formData.append("questions_text", questions);
      formData.append("assignment_title", assignmentTitle || "Assignment Questions");
      
      console.log("[PDF Generation] Sending request to backend...");
      const response = await api.post("/assignments/ai/generate-questions-pdf", formData, {
        responseType: 'blob',
      });
      
      console.log("[PDF Generation] Response received:", {
        status: response.status,
        contentType: response.headers['content-type'],
        dataType: typeof response.data,
        dataSize: response.data?.size || 0
      });
      
      if (response.data instanceof Blob) {
        const blob = response.data;
        console.log("[PDF Generation] Blob created:", { size: blob.size, type: blob.type });
        
        if (!blob.type.includes('pdf') && !blob.type.includes('application/octet-stream')) {
          console.warn("[PDF Generation] Unexpected content type:", blob.type);
        }
        
        const pdfFile = new File([blob], `${assignmentTitle.replace(/\s+/g, '_')}_Questions.pdf`, {
          type: 'application/pdf'
        });
        
        console.log("[PDF Generation] PDF file created:", { name: pdfFile.name, size: pdfFile.size, type: pdfFile.type });
        return pdfFile;
      } else {
        throw new Error("Response is not a blob");
      }
    } catch (error: any) {
      console.error("[PDF Generation] Error generating PDF:", error);
      console.error("[PDF Generation] Error details:", {
        message: error?.message,
        response: error?.response?.data,
        status: error?.response?.status
      });
      
      if (error?.response?.data instanceof Blob) {
        try {
          const text = await error.response.data.text();
          console.error("[PDF Generation] Error response text:", text);
        } catch (e) {
          console.error("[PDF Generation] Could not read error response as text");
        }
      }
      
      const textBlob = new Blob([questions], { type: 'text/plain' });
      const textFile = new File([textBlob], `${assignmentTitle.replace(/\s+/g, '_')}_Questions.txt`, {
        type: 'text/plain'
      });
      console.log("[PDF Generation] Fallback: Created text file instead");
      return textFile;
    }
  };

  const handleAIGenerate = async () => {
    if (!pdfFile) {
      toast.error("Please upload a PDF file first");
      return;
    }

    console.log("[AI Generate] Current numQuestions state:", numQuestions);
    console.log("[AI Generate] Current numQuestions type:", typeof numQuestions);

    if (numQuestions < 1 || numQuestions > 50) {
      toast.error("Number of questions must be between 1 and 50");
      return;
    }

    if (!questionTypes.mcq && !questionTypes.trueFalse && !questionTypes.shortAnswer) {
      toast.error("Please select at least one question type");
      return;
    }

    setIsGenerating(true);
    toast.loading(`Generating ${numQuestions} questions from PDF... This may take 2-5 minutes for large documents.`, { id: "ai-generate", duration: 10000 });
    try {
      console.log("[AI Generate] Calling generateQuestionsFromPDF with:", {
        pdfFile: pdfFile.name,
        numQuestions: numQuestions,
        questionTypes: questionTypes
      });
      const data = await generateQuestionsFromPDF(pdfFile, numQuestions, questionTypes, includeAnswers);
      console.log("[AI Generate] Response received:", data);
      console.log("[AI Generate] Response type:", typeof data);
      console.log("[AI Generate] Response keys:", Object.keys(data || {}));
      
      let questions = "";
      if (typeof data === "string") {
        questions = data;
      } else if (data?.questions) {
        questions = typeof data.questions === "string" ? data.questions : String(data.questions);
      } else if (data?.response) {
        questions = typeof data.response === "string" ? data.response : String(data.response);
      } else if (data) {
        questions = typeof data === "string" ? data : JSON.stringify(data);
      }
      
      console.log("[AI Generate] Extracted questions:", {
        hasQuestions: !!questions,
        questionsLength: questions?.length || 0,
        questionsType: typeof questions,
        questionsPreview: questions?.substring(0, 200) || "No questions"
      });

      if (!questions || questions.trim().length === 0) {
        console.error("[AI Generate] No questions extracted from response!");
        console.error("[AI Generate] Full response data:", JSON.stringify(data, null, 2));
        toast.error("No questions were generated. Please check the console for details.");
        return;
      }

      setGeneratedQuestions(questions);
      console.log("[AI Generate] Questions set in state, length:", questions.length);
      
      toast.dismiss("ai-generate");
      
      toast.success(`Successfully generated ${questions.length} characters of questions!`, { duration: 3000 });
      
      const questionCount = (questions.match(/\d+\./g) || []).length || 
                           (questions.match(/Question:/gi) || []).length ||
                           (questions.match(/\?/g) || []).length;
      
      console.log("[AI Generate] Question count:", {
        requested: numQuestions,
        found: questionCount,
        questionsLength: questions.length
      });
      
      if (questions && questions.trim().length > 0) {
        const countMessage = questionCount >= numQuestions 
          ? `Generated ${questionCount} questions (requested ${numQuestions})`
          : `Generated ${questionCount} questions (requested ${numQuestions} - some may be missing)`;
        
        console.log("[AI Generate] Questions are valid, proceeding with PDF generation...");
        toast.success(`${countMessage}. Generating PDF...`, { duration: 5000 });
        setFormData((prev) => ({
          ...prev,
          description: prev.description 
            ? `${prev.description}\n\n--- Generated Questions ---\n\n${questions}`
            : `--- Generated Questions ---\n\n${questions}`,
        }));
        
        try {
          setIsGeneratingPdf(true);
          toast.loading("Generating PDF with questions...", { id: "pdf-gen" });
          console.log("[AI Generate] Starting PDF generation from questions...");
          
          const questionsPdf = await generatePdfFromQuestions(questions, formData.title || "Assignment Questions");
          console.log("[AI Generate] PDF generated successfully:", {
            name: questionsPdf.name,
            size: questionsPdf.size,
            type: questionsPdf.type
          });
          
          setAssignmentPdf(questionsPdf);
          setAiGeneratorPdf(questionsPdf);
          console.log("[AI Generate] PDF set in state");
          
          if (pdfPreviewUrl) {
            URL.revokeObjectURL(pdfPreviewUrl);
            console.log("[AI Generate] Previous preview URL revoked");
          }
          const url = URL.createObjectURL(questionsPdf);
          setPdfPreviewUrl(url);
          console.log("[AI Generate] Preview URL created:", url);
          
          console.log("[AI Generate] Verifying PDF state:", {
            assignmentPdf: !!questionsPdf,
            pdfPreviewUrl: !!url,
            pdfName: questionsPdf.name,
            pdfSize: questionsPdf.size
          });
          
          setTimeout(() => {
            console.log("[AI Generate] State after update:", {
              assignmentPdf: assignmentPdf?.name,
              pdfPreviewUrl: pdfPreviewUrl ? "exists" : "null"
            });
          }, 100);
          
          toast.success(`Questions PDF generated and attached! (${(questionsPdf.size / 1024).toFixed(1)} KB)`, { id: "pdf-gen", duration: 5000 });
          
          console.log("[AI Generate] Success toast shown");
          setIsGeneratingPdf(false);
          
          setTimeout(() => {
            console.log("[AI Generate] PDF state verification after update:", {
              assignmentPdf: assignmentPdf?.name,
              pdfPreviewUrl: pdfPreviewUrl ? "exists" : "null",
              aiGeneratorPdf: aiGeneratorPdf?.name
            });
            
            const pdfSection = document.querySelector('[data-pdf-section]');
            if (pdfSection) {
              pdfSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
              pdfSection.classList.add('ring-4', 'ring-purple-300', 'ring-opacity-50');
              setTimeout(() => {
                pdfSection.classList.remove('ring-4', 'ring-purple-300', 'ring-opacity-50');
              }, 3000);
            } else {
              console.warn("[AI Generate] PDF section not found in DOM, trying alternative selector");
              const altSection = document.querySelector('.border-2.border-dashed.border-gray-300');
              if (altSection) {
                altSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }
          }, 1000);
        } catch (error: any) {
          console.error("[AI Generate] Error generating questions PDF:", error);
          console.error("[AI Generate] Error details:", {
            message: error?.message,
            response: error?.response?.data,
            status: error?.response?.status,
            stack: error?.stack
          });
          
          if (error?.response?.data instanceof Blob) {
            error.response.data.text().then((text: string) => {
              console.error("[AI Generate] Error response text:", text);
            }).catch((e: any) => {
              console.error("[AI Generate] Could not read error response:", e);
            });
          }
          
          const errorMessage = error?.response?.data?.detail || error?.message || "PDF generation failed";
          toast.error(`Questions generated but PDF creation failed: ${errorMessage}`, { id: "pdf-gen", duration: 8000 });
          setIsGeneratingPdf(false);
        }
      } else {
        console.error("[AI Generate] No questions received or questions are empty");
        console.error("[AI Generate] Data received:", data);
        toast.error("No questions were generated. Please try again.");
      }
    } catch (error: any) {
      console.error("[AI Generate] Error generating questions:", error);
      console.error("[AI Generate] Error status:", error?.response?.status);
      console.error("[AI Generate] Error data:", error?.response?.data);
      console.error("[AI Generate] Error message:", error?.message);
      console.error("[AI Generate] Full error object:", JSON.stringify(error, null, 2));
      
      toast.dismiss("ai-generate");
      
      if (error?.response?.status === 401) {
        console.error("[AI Generate] 401 Unauthorized - Authentication failed");
        console.error("[AI Generate] Check if token exists and is valid");
        toast.error("Authentication failed. Please log out and log in again.", { duration: 8000 });
      }
      else if (error?.response?.status === 503) {
        const errorMessage = error?.response?.data?.detail || "Ollama service is not available. Please ensure Ollama is running.";
        console.error("[AI Generate] 503 Service Unavailable - Ollama not running");
        console.error("[AI Generate] Error detail:", errorMessage);
        toast.error(errorMessage, { duration: 10000 });
      }
      else if (error?.code === "ECONNABORTED" || error?.message?.includes("timeout")) {
        toast.error("AI generation timed out. The PDF might be too large or the model is taking longer than expected. Please try with a smaller PDF or fewer questions.", { duration: 8000 });
      } else {
        const errorMessage = error?.response?.data?.detail || error?.message || "Failed to generate questions. Please ensure the AI service (Ollama with gemma3n:e2b) is running.";
        toast.error(errorMessage, { duration: 6000 });
      }
    } finally {
      setIsGenerating(false);
      toast.dismiss("ai-generate");
    }
  };

  useEffect(() => {
    if (parsedQuestions && parsedQuestions.length > 0) {
      console.log('Current parsed questions:', parsedQuestions);
    }
  }, [parsedQuestions]);

  return (
    <div className="max-w-4xl mx-auto p-4 bg-gray-200 text-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => setShowAIModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl hover:from-purple-600 hover:to-pink-600 transition-all shadow-lg font-semibold"
          >
            <Sparkles className="w-5 h-5" />
            AI Generator
          </button>
          <button
            onClick={() => {
              const target = returnTo || fallbackReturnTo;
              if (target) navigate(target, { replace: true });
              else navigate(-1);
            }}
            className="p-2 text-gray-800 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-300/70"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-r from-sky-500 to-sky-600 rounded-xl flex items-center justify-center shadow-lg">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-gray-900">
                Create New Assignment
              </h1>
              <p className="text-gray-800">
                Create a new assignment for your students
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gray-100/70 backdrop-blur-xl rounded-3xl p-8 w-full max-w-4xl mx-auto shadow-xl border border-gray-300">
          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            <div className="md:col-span-2">
              <label
                htmlFor="title"
                className="block text-sm font-medium text-gray-800 mb-1"
              >
                Assignment Title <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                id="title"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:border-sky-500"
                placeholder="Enter assignment title"
              />
              {errors.title && (
                <p className="text-red-600 text-xs mt-1">{errors.title}</p>
              )}
            </div>
            <div>
              <label
                htmlFor="course_id"
                className="block text-sm font-medium text-gray-800 mb-1"
              >
                Course <span className="text-red-600">*</span>
              </label>
              {lockedCourseId ? (
                <div className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 text-gray-900">
                  {courses.find((c) => Number(c.id) === lockedCourseId)?.name || `Course #${lockedCourseId}`}
                  <input type="hidden" name="course_id" value={formData.course_id} />
                </div>
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
              {errors.course_id && (
                <p className="text-red-600 text-xs mt-1">{errors.course_id}</p>
              )}
            </div>
            <div>
              <label
                htmlFor="deadline"
                className="block text-sm font-medium text-gray-800 mb-1"
              >
                Deadline <span className="text-red-600">*</span>
              </label>
              <input
                type="datetime-local"
                id="deadline"
                name="deadline"
                value={formData.deadline}
                onChange={handleInputChange}
                className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:border-sky-500"
              />
              {errors.deadline && (
                <p className="text-red-600 text-xs mt-1">{errors.deadline}</p>
              )}
            </div>
            <div>
              <label
                htmlFor="max_grade"
                className="block text-sm font-medium text-gray-800 mb-1"
              >
                Maximum Grade <span className="text-red-600">*</span>
              </label>
              <input
                type="number"
                id="max_grade"
                name="max_grade"
                value={formData.max_grade}
                onChange={handleInputChange}
                className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:border-sky-500"
              />
              {errors.max_grade && (
                <p className="text-red-600 text-xs mt-1">{errors.max_grade}</p>
              )}
            </div>
            <div className="md:col-span-2" data-pdf-section>
              <label className="block text-sm font-medium text-gray-800 mb-2">
                Assignment PDF (Optional)
              </label>
              {!assignmentPdf ? (
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-sky-500 transition-colors">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handlePdfUpload}
                    className="hidden"
                    id="pdf-upload"
                  />
                  <label
                    htmlFor="pdf-upload"
                    className="cursor-pointer flex flex-col items-center gap-2"
                  >
                    <FileText className="w-8 h-8 text-gray-400" />
                    <span className="text-sm text-gray-600">
                      Click to upload PDF or drag and drop
                    </span>
                    <span className="text-xs text-gray-500">
                      Attach a PDF file to send with this assignment
                    </span>
                    <span className="text-xs text-purple-600 mt-2 font-medium">
                      💡 Tip: Upload PDF in AI Generator to auto-attach it here
                    </span>
                  </label>
                </div>
              ) : (
                <div className={`bg-gray-50 border rounded-lg p-4 ${aiGeneratorPdf ? 'border-purple-300 bg-purple-50/30' : 'border-gray-300'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className={`w-8 h-8 ${aiGeneratorPdf ? 'text-purple-600' : 'text-red-600'}`} />
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {assignmentPdf.name}
                        </p>
                        <p className="text-xs text-gray-600">
                          {(assignmentPdf.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                        {aiGeneratorPdf && (
                          <p className="text-xs text-purple-600 font-medium mt-1">
                            ✓ PDF with Generated Questions - ready to attach
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (pdfPreviewUrl) {
                            window.open(pdfPreviewUrl, "_blank");
                          }
                        }}
                        className="p-2 text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                        title="Preview PDF"
                      >
                        <Eye className="w-5 h-5" />
                      </button>
                      <button
                        type="button"
                        onClick={handlePdfDownload}
                        className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                        title="Download PDF"
                      >
                        <Download className="w-5 h-5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleRemovePdf}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Remove PDF"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  {pdfPreviewUrl && assignmentPdf && (
                    <div className="mt-4 border-2 border-purple-300 rounded-lg overflow-hidden bg-purple-50">
                      <div className="bg-purple-100 px-4 py-2 border-b border-purple-200 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-purple-900">📄 PDF Preview</span>
                          {aiGeneratorPdf && (
                            <span className="text-xs bg-purple-200 text-purple-800 px-2 py-1 rounded font-semibold">
                              ✨ Generated from AI
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-purple-700">
                          {assignmentPdf.name}
                        </span>
                      </div>
                      <iframe
                        src={pdfPreviewUrl}
                        className="w-full h-96 bg-white"
                        title="PDF Preview"
                        onLoad={() => {
                          console.log("[PDF Preview] PDF iframe loaded successfully");
                          toast.success("PDF preview loaded!", { duration: 2000 });
                        }}
                        onError={(e) => {
                          console.error("[PDF Preview] PDF iframe error:", e);
                          toast.error("Failed to load PDF preview", { duration: 3000 });
                        }}
                      />
                      <div className="bg-purple-50 px-4 py-2 border-t border-purple-200">
                        <p className="text-xs text-purple-700">
                          PDF size: {(assignmentPdf.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>
                  )}
                  {import.meta.env.DEV && assignmentPdf && (
                    <div className="mt-2 text-xs text-gray-500">
                      Debug: PDF loaded - {assignmentPdf.name} ({assignmentPdf.size} bytes, {assignmentPdf.type})
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="md:col-span-2">
              <label
                htmlFor="description"
                className="block text-sm font-medium text-gray-800 mb-1"
              >
                Description
              </label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={4}
                className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:border-sky-500"
                placeholder="Enter assignment description and instructions"
              />
            </div>
            <div className="md:col-span-2 flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  const target = returnTo || fallbackReturnTo;
                  if (target) navigate(target, { replace: true });
                  else navigate(-1);
                }}
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
                <Save className="w-5 h-5" />
                {isSubmitting ? "Creating Assignment..." : "Create Assignment"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {showAIModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">AI Question Generator</h2>
              </div>
              <div className="flex items-center gap-2">
                {(generatedQuestions || pdfFile || assignmentPdf) && (
                  <button
                    onClick={handleClearAIGenerator}
                    disabled={isGenerating || isGeneratingPdf}
                    className={`px-3 py-2 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors flex items-center gap-2 ${
                      isGenerating || isGeneratingPdf ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                    title="Clear all generated content to start fresh"
                  >
                    <X className="w-4 h-4" />
                    Clear
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowAIModal(false);
                    if (!generatedQuestions) {
                      setPdfFile(null);
                    }
                  }}
                  className="p-2 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="space-y-6">
              <div className="form-group p-4 rounded-lg border-2 bg-white">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeAnswers}
                    onChange={(e) => setIncludeAnswers(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Include answers (for instructor reference only)
                  </span>
                </label>
                {includeAnswers ? (
                  <div className="mt-2 p-2 bg-yellow-100 rounded text-xs text-yellow-800">
                    ⚠️ <strong>Warning:</strong> This will include answers in the PDF. 
                    Don't share this with students!
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-green-600">
                    Perfect for student assignments - no answers will be shown
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-800 mb-2">
                  Upload PDF Document <span className="text-red-600">*</span>
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-purple-500 transition-colors">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleAIGeneratorPdfUpload}
                    className="hidden"
                    id="ai-pdf-upload"
                  />
                  <label
                    htmlFor="ai-pdf-upload"
                    className="cursor-pointer flex flex-col items-center gap-2"
                  >
                    <Upload className="w-8 h-8 text-gray-400" />
                    <span className="text-sm text-gray-600">
                      {pdfFile ? pdfFile.name : "Click to upload PDF or drag and drop"}
                    </span>
                    <span className="text-xs text-purple-600 mt-1 font-medium">
                      📄 A new PDF with generated questions will be created and attached to the assignment
                    </span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-800 mb-2">
                  Number of Questions <span className="text-red-600">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={numQuestions}
                  onChange={(e) => setNumQuestions(parseInt(e.target.value) || 1)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-800 mb-3">
                  Question Types <span className="text-red-600">*</span>
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={questionTypes.mcq}
                      onChange={(e) =>
                        setQuestionTypes((prev) => ({ ...prev, mcq: e.target.checked }))
                      }
                      className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                    />
                    <span className="text-gray-700">Multiple Choice Questions (MCQ)</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={questionTypes.trueFalse}
                      onChange={(e) =>
                        setQuestionTypes((prev) => ({ ...prev, trueFalse: e.target.checked }))
                      }
                      className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                    />
                    <span className="text-gray-700">True/False Questions</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={questionTypes.shortAnswer}
                      onChange={(e) =>
                        setQuestionTypes((prev) => ({ ...prev, shortAnswer: e.target.checked }))
                      }
                      className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                    />
                    <span className="text-gray-700">Short Answer Questions</span>
                  </label>
                </div>
              </div>

              {isGenerating && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                    <div>
                      <p className="text-sm font-medium text-blue-900">Generating questions from PDF...</p>
                      <p className="text-xs text-blue-700 mt-1">This may take a minute. Please wait.</p>
                    </div>
                  </div>
                </div>
              )}

              {isGeneratingPdf && (
                <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                    <div>
                      <p className="text-sm font-bold text-blue-900">
                        Generating PDF with questions...
                      </p>
                      <p className="text-xs text-blue-700 mt-1">
                        Creating a PDF file from the generated questions. This will be attached to your assignment.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {generatedQuestions && generatedQuestions.trim().length > 0 && !isGenerating && !isGeneratingPdf && (
                <div className="bg-emerald-50 border-2 border-emerald-300 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-bold text-emerald-900">
                      ✅ Generated Questions Preview
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-emerald-700 bg-emerald-100 px-2 py-1 rounded">
                        {(() => {
                          const count = (generatedQuestions.match(/\d+\./g) || []).length || 
                                       (generatedQuestions.match(/Question:/gi) || []).length ||
                                       (generatedQuestions.match(/\?/g) || []).length;
                          return `${count} questions found (requested: ${numQuestions})`;
                        })()}
                      </span>
                      <button
                        onClick={handleClearAIGenerator}
                        className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors flex items-center gap-1"
                        title="Clear and generate new questions"
                      >
                        <X className="w-3 h-3" />
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="bg-white border border-emerald-200 rounded-lg p-4 max-h-96 overflow-y-auto">
                    {parsedQuestions && parsedQuestions.length > 0 ? (
                      <div className="space-y-4">
                        {parsedQuestions.map((q) => (
                          <div key={q.number} className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm">
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                                <span className="text-xs font-bold text-blue-700">{q.number}</span>
                              </div>
                              <div className="flex-1">
                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                  <h4 className="text-sm font-medium text-gray-900">{q.text}</h4>
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                    q.type === 'multiple choice' ? 'bg-blue-100 text-blue-800' :
                                    q.type === 'true/false' ? 'bg-purple-100 text-purple-800' :
                                    'bg-green-100 text-green-800'
                                  }`}>
                                    {q.type}
                                  </span>
                                </div>

                                {q.choices && q.choices.length > 0 ? (
                                  <div className="mt-3 space-y-2 ml-2">
                                    {q.choices.map((choice) => {
                                      const isCorrect = q.type === 'true/false' 
                                        ? (choice.text.toLowerCase() === q.correctAnswer?.toLowerCase() || 
                                           choice.letter === q.correctAnswer)
                                        : (choice.isCorrect || 
                                          (q.correctAnswer && choice.letter === q.correctAnswer));
                                      return (
                                        <div
                                          key={choice.letter}
                                          className={`flex items-start gap-2 p-2 rounded ${
                                            isCorrect
                                              ? 'bg-green-50 border border-green-200'
                                              : 'hover:bg-gray-50'
                                          }`}
                                        >
                                          <span className={`w-5 h-5 flex-shrink-0 flex items-center justify-center rounded border ${
                                            q.type === 'multiple choice'
                                              ? isCorrect
                                                ? 'border-green-500 bg-green-100'
                                                : 'border-blue-300 bg-blue-50'
                                              : isCorrect
                                                ? 'border-green-500 bg-green-100'
                                                : 'border-purple-300 bg-purple-50'
                                          }`}>
                                            <span className={`text-xs font-bold ${
                                              q.type === 'multiple choice'
                                                ? isCorrect
                                                  ? 'text-green-700'
                                                  : 'text-blue-700'
                                                : isCorrect
                                                  ? 'text-green-700'
                                                  : 'text-purple-700'
                                            }`}>
                                              {choice.letter}
                                            </span>
                                          </span>
                                          <span className="text-sm text-gray-700">
                                            {choice.text}
                                            {isCorrect && (
                                              <span className="ml-2 text-xs text-green-600 font-medium">
                                                ✓ Correct Answer
                                              </span>
                                            )}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : q.type === 'short answer' ? (
                                  <div className="mt-2">
                                    <div className="h-8 border-b border-dashed border-gray-300"></div>
                                    <p className="text-xs text-gray-500 mt-1">Short answer text</p>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-4 text-gray-500">
                        {parsedQuestions === null ? (
                          <div className="animate-pulse">
                            <div className="h-4 bg-gray-200 rounded w-3/4 mx-auto mb-2"></div>
                            <div className="h-4 bg-gray-200 rounded w-1/2 mx-auto"></div>
                          </div>
                        ) : (
                          'No questions could be parsed from the generated text.'
                        )}
                      </div>
                    )}
                  </div>
                  {parsedQuestions && parsedQuestions.length > 0 && (
                    <p className="text-xs text-emerald-700 mt-2">
                      {parsedQuestions.length} question{parsedQuestions.length !== 1 ? 's' : ''} have been generated. Review and edit as needed.
                    </p>
                  )}
                  {assignmentPdf && (
                    <div className="mt-3 p-4 bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-300 rounded-lg">
                      <div className="flex items-start gap-3">
                        <div className="text-2xl">📄</div>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-purple-900 mb-1">
                            ✅ PDF Generated Successfully!
                          </p>
                          <p className="text-xs text-purple-700 mb-3">
                            The PDF with {numQuestions} questions has been generated and attached to your assignment. Close this modal to see the PDF preview below.
                          </p>
                          <button
                            onClick={() => {
                              setShowAIModal(false);
                              setTimeout(() => {
                                const pdfSection = document.querySelector('[data-pdf-section]');
                                if (pdfSection) {
                                  pdfSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                  pdfSection.classList.add('ring-4', 'ring-purple-300', 'ring-opacity-50');
                                  setTimeout(() => {
                                    pdfSection.classList.remove('ring-4', 'ring-purple-300', 'ring-opacity-50');
                                  }, 3000);
                                }
                              }, 300);
                            }}
                            className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2 font-semibold"
                          >
                            <Eye className="w-4 h-4" />
                            View PDF Preview
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    setShowAIModal(false);
                    if (!generatedQuestions) {
                      setPdfFile(null);
                    }
                  }}
                  className="px-6 py-2 bg-gray-200 text-gray-800 rounded-xl hover:bg-gray-300 transition-colors"
                >
                  {generatedQuestions ? "Close" : "Cancel"}
                </button>
                {!generatedQuestions && (
                  <button
                    onClick={handleAIGenerate}
                    disabled={isGenerating || !pdfFile}
                    className={`px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl hover:from-purple-600 hover:to-pink-600 transition-all flex items-center gap-2 ${
                      isGenerating || !pdfFile ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5" />
                        Generate Questions
                      </>
                    )}
                  </button>
                )}
                {generatedQuestions && (
                  <button
                    onClick={() => {
                      setShowAIModal(false);
                    }}
                    className="px-6 py-2 bg-gradient-to-r from-emerald-500 to-green-500 text-white rounded-xl hover:from-emerald-600 hover:to-green-600 transition-all flex items-center gap-2"
                  >
                    <Save className="w-5 h-5" />
                    Done - Questions Applied
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
