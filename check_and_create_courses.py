import sqlite3
from datetime import datetime

# Connect to database
con = sqlite3.connect(r".\database\dentist.db")
cur = con.cursor()

print("=== CHECKING COURSES ===")

# Check if courses exist
print("\n1. Existing courses:")
try:
    courses = cur.execute("SELECT course_id, title, code, is_active FROM Course LIMIT 10;").fetchall()
    print(f"Found {len(courses)} courses:")
    for c in courses:
        print(f"  course_id: {c[0]}, title: {c[1]}, code: {c[2]}, active: {c[3]}")
except Exception as e:
    print(f"  Error: {e}")

# If no courses exist, create some sample courses
if len(courses) == 0:
    print("\n2. Creating sample courses...")
    
    # First, get an instructor ID (or create one)
    try:
        instructor = cur.execute("SELECT instructor_id FROM Instructor LIMIT 1;").fetchone()
        if instructor:
            instructor_id = instructor[0]
        else:
            # Create a default instructor
            cur.execute("""
                INSERT INTO Instructor (full_name, email, role, created_at) 
                VALUES ('Default Instructor', 'instructor@dent.edu.eg', 'Lecturer', ?)
            """, (datetime.utcnow(),))
            instructor_id = cur.lastrowid
            print(f"  Created default instructor with ID: {instructor_id}")
    except Exception as e:
        print(f"  Error getting/creating instructor: {e}")
        instructor_id = 1  # fallback
    
    # Create sample courses
    sample_courses = [
        ("Oral Pathology", "Study of diseases affecting the oral and maxillofacial region", "DENT301"),
        ("Periodontics", "Treatment of diseases of the gums and supporting structures", "DENT302"),
        ("Endodontics", "Root canal therapy and treatment of dental pulp", "DENT303"),
        ("Oral Surgery", "Surgical procedures in the oral and maxillofacial region", "DENT401"),
        ("Prosthodontics", "Replacement of missing teeth and oral structures", "DENT402"),
    ]
    
    try:
        for title, description, code in sample_courses:
            cur.execute("""
                INSERT INTO Course (title, description, code, created_by, is_active, created_at)
                VALUES (?, ?, ?, ?, 1, ?)
            """, (title, description, code, instructor_id, datetime.utcnow()))
            print(f"  Created course: {title} ({code})")
        
        con.commit()
        print("  Sample courses created successfully!")
        
    except Exception as e:
        print(f"  Error creating courses: {e}")
        con.rollback()

else:
    print(f"\n2. Courses already exist ({len(courses)} found)")

con.close()
print("\nDone!")
