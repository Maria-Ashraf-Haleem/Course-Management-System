from sqlalchemy import Table, Column, Integer, Text, DateTime, ForeignKey, MetaData, String
from datetime import datetime


def upgrade(engine):
    meta = MetaData()
    meta.bind = engine

    lecture = Table(
        "Lecture",
        meta,
        Column("lecture_id", Integer, primary_key=True, autoincrement=True),
        Column("course_id", Integer, ForeignKey("Course.course_id"), nullable=False, index=True),
        Column("date", DateTime, nullable=False),
        Column("topic", Text, nullable=True),
        Column("duration_minutes", Integer, nullable=True),
        Column("created_by", Integer, ForeignKey("Instructor.instructor_id"), nullable=False),
        Column("created_at", DateTime, nullable=False, default=datetime.utcnow),
    )

    lecture_attendance = Table(
        "LectureAttendance",
        meta,
        Column("id", Integer, primary_key=True, autoincrement=True),
        Column("lecture_id", Integer, ForeignKey("Lecture.lecture_id"), nullable=False, index=True),
        Column("student_id", Integer, ForeignKey("Student.student_id"), nullable=False, index=True),
        Column("status", Text, nullable=False, default="Present"),
        Column("notes", Text, nullable=True),
        Column("marked_at", DateTime, nullable=False, default=datetime.utcnow),
    )

    meta.create_all(tables=[lecture, lecture_attendance])


def downgrade(engine):
    meta = MetaData()
    meta.bind = engine

    # Drop in reverse order due to FK constraints
    Table("LectureAttendance", meta, autoload_with=engine).drop(engine, checkfirst=True)
    Table("Lecture", meta, autoload_with=engine).drop(engine, checkfirst=True)


