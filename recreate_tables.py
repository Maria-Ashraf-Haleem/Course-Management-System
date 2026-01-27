from app.db import engine, Base
import app.models  # Import all models to ensure Base.metadata is aware of them

def recreate_tables():
    try:
        print("Dropping existing tables...")
        Base.metadata.drop_all(bind=engine)
        
        print("Creating new tables...")
        Base.metadata.create_all(bind=engine)
        
        print("✓ All tables recreated successfully!")
        
    except Exception as e:
        print(f"Error recreating tables: {e}")

if __name__ == "__main__":
    recreate_tables()
