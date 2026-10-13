"""
Base Extraction Interfaces for Pluggable Syllabus Extractors
"""
from abc import ABC, abstractmethod
from typing import Dict, Any
from pydantic import BaseModel

class ExtractorResult(BaseModel):
    confidence_score: float
    extractor_type: str # 'deterministic', 'llm', 'hybrid'
    raw_units: list
    raw_outcomes: list
    metadata: Dict[str, Any] = {}
    fallback_invoked: bool = False

class BaseSyllabusExtractor(ABC):
    @abstractmethod
    def extract_from_text(self, text: str) -> ExtractorResult:
        """Extract structured curriculum from raw syllabus text"""
        pass

    @abstractmethod
    def extract_from_pdf(self, pdf_bytes: bytes) -> ExtractorResult:
        """Extract structured curriculum from PDF file bytes"""
        pass

    @abstractmethod
    def extract_from_image(self, image_bytes: bytes) -> ExtractorResult:
        """Extract structured curriculum from image file bytes"""
        pass
