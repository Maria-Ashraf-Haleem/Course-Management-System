-- Fix Noah Garcia's submission data
-- Transfer all submissions from student_id 101 to student_id 100

UPDATE submissions 
SET student_id = 100 
WHERE student_id = 101;

-- Verify the changes
SELECT 
    s.submission_id,
    s.assignment_id, 
    s.student_id,
    sf.grade
FROM submissions s 
LEFT JOIN submission_feedback sf ON s.submission_id = sf.submission_id 
WHERE s.student_id = 100 
ORDER BY s.submission_id;
