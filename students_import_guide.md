# Student CSV Import Guide

## Required Fields (marked with *)
- **student_number*** - Unique identifier (e.g., ST001, ST002)
- **full_name*** - Student's complete name
- **password*** - Initial login password for the student
- **course_id*** - Course ID number (see course mapping below)

## Optional Fields
- **email** - Student's email address
- **phone** - Phone number
- **notes** - Additional notes about the student

## Your Available Courses

| Course ID | Course Name | Course Code |
|-----------|-------------|-------------|
| 1 | Python | py125 |
| 2 | Data structure | DS15 |
| 3 | OOP | op8 |
| 4 | Data science | ds60 |

## CSV Template Format

```csv
student_number,full_name,email,phone,password,course_id,notes
ST001,John Smith,john.smith@email.com,+1234567890,password123,1,
ST002,Jane Doe,jane.doe@email.com,+1234567891,password123,4,
ST003,Mike Johnson,mike.johnson@email.com,+1234567892,password123,2,
ST004,Sarah Wilson,sarah.wilson@email.com,+1234567893,password123,3,
ST005,David Brown,david.brown@email.com,+1234567894,password123,1,Excellent student
```

## How to Import
1. Go to Students List page in instructor dashboard
2. Click the Import button
3. Upload your CSV file
4. Review the import results

## Notes
- Students with duplicate student_number will be skipped
- All students will be automatically enrolled in their assigned course
- User accounts will be created automatically with username = student_number
