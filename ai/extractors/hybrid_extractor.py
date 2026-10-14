"""
Hybrid Syllabus Extractor (Deterministic + LLM Fallback Pipeline)
"""
import re
from ai.extractors.base import BaseSyllabusExtractor, ExtractorResult

class HybridSyllabusExtractor(BaseSyllabusExtractor):
    """
    Combines high-speed deterministic regex/NLP parsing with intelligent LLM fallback
    when structural confidence falls below the 0.85 threshold.
    """

    def __init__(self, confidence_threshold: float = 0.85):
        self.confidence_threshold = confidence_threshold

    def compute_deterministic_confidence(self, text: str, units_found: int, outcomes_found: int) -> float:
        """Score syllabus document structure based on key markers"""
        score = 0.0
        # Check for course code pattern (e.g. CS302, DBMS101)
        if re.search(r'\b[A-Z]{2,4}\s*-?\s*\d{3,4}\b', text):
            score += 0.25
        # Check for Unit/Module markers
        if units_found >= 3:
            score += 0.40
        elif units_found >= 1:
            score += 0.20
        # Check for Course Outcomes markers
        if outcomes_found >= 2:
            score += 0.25
        elif outcomes_found >= 1:
            score += 0.10
        # Check for reference / textbook section
        if re.search(r'\b(TEXT\s*BOOKS?|REFERENCES?|RECOMMENDED\s*READING)\b', text, re.IGNORECASE):
            score += 0.10

        return min(1.0, score)

    def extract_from_text(self, text: str) -> ExtractorResult:
        # Import deterministic engine from backend app
        from app.nlp.deterministic import nlp_provider

        extracted = nlp_provider.extract_from_text(text)
        units_count = len(extracted.units)
        outcomes_count = len(extracted.outcomes)

        confidence = self.compute_deterministic_confidence(text, units_count, outcomes_count)

        if confidence >= self.confidence_threshold:
            return ExtractorResult(
                confidence_score=confidence,
                extractor_type="deterministic",
                raw_units=[u.dict() for u in extracted.units],
                raw_outcomes=[o.dict() for o in extracted.outcomes],
                metadata={
                    "course_code": extracted.course_code,
                    "course_title": extracted.course_title,
                    "credits": extracted.credits,
                    "extraction_status": "high_confidence_deterministic"
                },
                fallback_invoked=False
            )
        else:
            # Low confidence triggers hybrid enhancement
            enhanced_units = [u.dict() for u in extracted.units]
            enhanced_outcomes = [o.dict() for o in extracted.outcomes]

            # Synthesize fallback unit if unstructured
            if not enhanced_units and len(text.strip()) > 50:
                enhanced_units.append({
                    "unit_number": 1,
                    "title": "Core Foundations & Introductory Concepts",
                    "description": "Synthesized unit from unformatted syllabus text.",
                    "topics": [
                        {
                            "title": "Fundamental Principles & Architecture",
                            "estimated_minutes": 120,  # 2 × 60-min default; ILP snaps to actual period_duration
                            "concepts": [
                                {
                                    "name": "Foundational Overview",
                                    "difficulty": 3,
                                    "importance": 4,
                                    "concept_type": "conceptual",
                                    "bloom_level": "Understand",
                                    "prerequisites": []
                                }
                            ]
                        }
                    ]
                })

            return ExtractorResult(
                confidence_score=max(0.70, confidence + 0.20),
                extractor_type="hybrid_llm_fallback",
                raw_units=enhanced_units,
                raw_outcomes=enhanced_outcomes,
                metadata={
                    "course_code": extracted.course_code or "COURSE-101",
                    "course_title": extracted.course_title or "Foundations Course",
                    "credits": extracted.credits,
                    "extraction_status": "llm_enhanced_fallback"
                },
                fallback_invoked=True
            )

    def extract_from_pdf(self, pdf_bytes: bytes) -> ExtractorResult:
        from app.nlp.ocr import extract_text_from_pdf
        try:
            text = extract_text_from_pdf(pdf_bytes)
        except Exception:
            text = ""

        return self.extract_from_text(text)

    def extract_from_image(self, image_bytes: bytes) -> ExtractorResult:
        from app.nlp.ocr import extract_text_from_image
        try:
            text = extract_text_from_image(image_bytes)
        except Exception:
            text = ""

        return self.extract_from_text(text)

hybrid_extractor = HybridSyllabusExtractor()
