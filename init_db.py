
from app.db import Base, engine
from app.models import Instructor  # Ensure Instructor model is registered
import app.models  # register all models
Base.metadata.create_all(bind=engine)
print("DB initialized:", engine.url)
