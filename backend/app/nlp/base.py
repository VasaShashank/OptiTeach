from abc import ABC, abstractmethod
from app.schemas.schemas import ExtractedCurriculum

class NLPProvider(ABC):
    @abstractmethod
    def extract_from_text(self, raw_text: str) -> ExtractedCurriculum:
        """Extract structured curriculum from raw syllabus text"""
        pass

    @abstractmethod
    def extract_from_pdf(self, pdf_bytes: bytes) -> ExtractedCurriculum:
        """Extract structured curriculum from PDF file bytes"""
        pass

    @abstractmethod
    def extract_from_image(self, image_bytes: bytes) -> ExtractedCurriculum:
        """Extract structured curriculum from image file bytes (PNG, JPG, etc.)"""
        pass
