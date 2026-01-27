import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), "database", "dentist.db")

def add_full_name_column():
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if column already exists
        cursor.execute("PRAGMA table_info(users);")
        columns = cursor.fetchall()
        column_names = [col[1] for col in columns]
        
        if "full_name" not in column_names:
            cursor.execute("ALTER TABLE users ADD COLUMN full_name TEXT;")
            conn.commit()
            print("Column 'full_name' added to 'users' table successfully.")
        else:
            print("Column 'full_name' already exists in 'users' table.")
            
    except sqlite3.Error as e:
        print(f"Database error: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    add_full_name_column()
