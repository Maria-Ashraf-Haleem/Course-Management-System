#!/usr/bin/env python3
"""
Script to delete all assignments and related data from the database.
This will clean up assignments, submissions, and feedback.
"""

import sqlite3
import os

def delete_all_assignments():
    """Delete all assignments and related data from the database."""
    
    # Database path
    db_path = "database/dentist.db"
    
    if not os.path.exists(db_path):
        print(f"Database file not found: {db_path}")
        return
    
    # Create database connection
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        print("Starting assignment deletion process...")
        
        # Delete in order to respect foreign key constraints
        
        # 1. Delete submission feedback first
        cursor.execute("DELETE FROM SubmissionFeedback")
        feedback_count = cursor.rowcount
        print(f"Deleted {feedback_count} submission feedback records")
        
        # 2. Delete submissions
        cursor.execute("DELETE FROM Submission")
        submission_count = cursor.rowcount
        print(f"Deleted {submission_count} submission records")
        
        # 3. Delete assignments
        cursor.execute("DELETE FROM Assignment")
        assignment_count = cursor.rowcount
        print(f"Deleted {assignment_count} assignment records")
        
        # Commit the transaction
        conn.commit()
        
        print("\n=== Deletion Summary ===")
        print(f"Submission Feedback: {feedback_count}")
        print(f"Submissions: {submission_count}")
        print(f"Assignments: {assignment_count}")
        print("All assignments and related data have been successfully deleted!")
        
        # Verify deletion
        cursor.execute("SELECT COUNT(*) FROM Assignment")
        assignments_left = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM Submission")
        submissions_left = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM SubmissionFeedback")
        feedback_left = cursor.fetchone()[0]
        
        print(f"\nVerification:")
        print(f"Assignments remaining: {assignments_left}")
        print(f"Submissions remaining: {submissions_left}")
        print(f"Feedback remaining: {feedback_left}")
        
    except Exception as e:
        print(f"Error during deletion: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    delete_all_assignments()
