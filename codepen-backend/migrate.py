# this script migrates the db schema to the latest version
# what's new:
# - removal of late_submitted status in SubmissionStatus enum

from sqlmodel import Session, text

from db import engine


with Session(engine) as session:
    session.exec(
        text("UPDATE submission SET status = 'pending' WHERE status = 'late_submitted'")
    )
    session.commit()
