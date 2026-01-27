import os
import sys
from pathlib import Path

# Add the backend directory to the Python path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), 'backend'))
sys.path.append(backend_dir)

# Now import the database models
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app import models

def check_assignment_files():
    db = SessionLocal()
    try:
        # Get all assignments with attachments
        assignments = db.query(models.Assignment).filter(
            models.Assignment.attachment_file_path.isnot(None)
        ).all()
        
        if not assignments:
            print("No assignments with attachments found in the database.")
            return
            
        print(f"Found {len(assignments)} assignments with attachments:")
        print("-" * 80)
        
        for assignment in assignments:
            print(f"Assignment ID: {assignment.assignment_id}")
            print(f"Title: {assignment.title}")
            print(f"Stored path: {assignment.attachment_file_path}")
            
            # Check if path is absolute or relative
            is_absolute = os.path.isabs(assignment.attachment_file_path)
            print(f"Path type: {'Absolute' if is_absolute else 'Relative'}")
            
            # Try to resolve the path
            base_dir = Path(__file__).resolve().parent
            file_path = Path(assignment.attachment_file_path)
            
            if not file_path.is_absolute():
                file_path = base_dir / file_path
            
            print(f"Resolved path: {file_path}")
            
            # Check if file exists
            exists = file_path.exists()
            print(f"File exists: {exists}")
            
            if exists:
                print(f"File size: {file_path.stat().st_size} bytes")
                print(f"Is file: {file_path.is_file()}")
            else:
                # Try to find the file by name in the uploads directory
                uploads_dir = base_dir / 'uploads' / 'assignments'
                print(f"\nSearching in uploads directory: {uploads_dir}")
                
                if uploads_dir.exists():
                    found_files = list(uploads_dir.glob('*'))
                    print(f"Found {len(found_files)} files in uploads directory:")
                    for f in found_files:
                        print(f"  - {f.name} ({f.stat().st_size} bytes)")
            
            print("-" * 80)
            
    except Exception as e:
        print(f"Error: {str(e)}")
    finally:
        db.close()

if __name__ == "__main__":
    check_assignment_files()
