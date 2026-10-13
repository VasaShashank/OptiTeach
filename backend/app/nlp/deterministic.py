import re
import io
import logging
from typing import List, Tuple, Optional, Dict, Any
from app.nlp.base import NLPProvider
from app.nlp.ocr import extract_text_from_image, extract_text_from_pdf
from app.schemas.schemas import (
    ExtractedCurriculum, UnitDraft, TopicDraft, ConceptDraft, OutcomeDraft
)

logger = logging.getLogger("optiteach.nlp")

# Common Bloom taxonomy verbs mapping
BLOOM_MAPPING = {
    "create": ["design", "construct", "create", "formulate", "build", "develop", "synthesize", "compose", "produce"],
    "evaluate": ["evaluate", "assess", "justify", "critique", "validate", "judge", "rate", "appraise", "defend"],
    "analyze": ["analyze", "differentiate", "compare", "deconstruct", "examine", "normalize", "distinguish", "investigate", "contrast"],
    "apply": ["apply", "implement", "calculate", "solve", "execute", "use", "query", "demonstrate", "operate", "illustrate", "practice"],
    "understand": ["understand", "explain", "describe", "summarize", "interpret", "classify", "discuss", "identify", "express", "review", "explore"],
    "remember": ["recall", "list", "define", "name", "state", "recognize", "repeat", "label", "match"]
}

ROMAN_MAP = {
    "I": 1, "II": 2, "III": 3, "IV": 4, "V": 5,
    "VI": 6, "VII": 7, "VIII": 8, "IX": 9, "X": 10
}

WORD_MAP = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10
}


def normalize_syllabus_text(raw_text: str) -> str:
    """Normalizes Unicode dashes, spaces, and line breaks for deterministic parsing."""
    if not raw_text:
        return ""
    text = raw_text.replace("\r\n", "\n").replace("\r", "\n")
    # Replace Unicode dashes with ASCII hyphen
    for dash in ["\u2010", "\u2011", "\u2012", "\u2013", "\u2014", "\u2015", "\u2212"]:
        text = text.replace(dash, "-")
    # Normalize non-breaking and thin spaces
    text = text.replace("\u00a0", " ").replace("\u200b", "").replace("\ufeff", "")

    # Expand dashes between title keywords when not an established hyphenated compound
    compound_words = {"entity-relationship", "three-schema", "er-to-relational", "peer-peer", "master-slave", "non-serial", "key-value"}
    def expand_dash(m):
        w1, w2 = m.group(1), m.group(2)
        if f"{w1.lower()}-{w2.lower()}" in compound_words:
            return f"{w1}-{w2}"
        return f"{w1} - {w2}"

    text = re.sub(r"\b([A-Za-z]{3,})\s*[\-–—]\s*([A-Za-z]{3,})\b", expand_dash, text)
    return text


def classify_bloom_level(outcome_text: str) -> str:
    """
    Classifies Bloom taxonomy level giving highest precedence to the leading
    action verb of the Course Outcome statement.
    """
    cleaned = outcome_text.strip()
    words = [w.lower() for w in re.findall(r"[a-zA-Z]+", cleaned)]
    if not words:
        return "Understand"

    # 1. Prioritize leading action verbs (e.g., "Apply the knowledge...", "Understand and explore...")
    for w in words[:4]:
        for level, verbs in BLOOM_MAPPING.items():
            if w in verbs:
                return level.capitalize()

    # 2. Fallback: inspect full outcome statement with priority for higher-order verbs
    low_text = cleaned.lower()
    for level in ["create", "evaluate", "analyze", "apply", "understand", "remember"]:
        for v in BLOOM_MAPPING[level]:
            if re.search(rf"\b{re.escape(v)}\b", low_text):
                return level.capitalize()

    return "Understand"


class DeterministicNLPProvider(NLPProvider):
    """
    High-fidelity deterministic NLP syllabus extraction engine.
    Extracts units, topics, concepts, outcomes, reference books, rubrics,
    academic parameters (semester, category, dept, credits, CIE/SEE),
    and prerequisite DAGs with strict validation.
    Supports native and scanned PDFs via RapidOCR, images (PNG, JPG), and raw text.
    """

    def extract_from_image(self, image_bytes: bytes) -> ExtractedCurriculum:
        raw_text = extract_text_from_image(image_bytes)
        if not raw_text or len(raw_text.strip()) < 20:
            raise ValueError(
                "Could not extract readable text from the uploaded syllabus image. "
                "Please verify the image is clear and contains visible curriculum text."
            )
        return self.extract_from_text(raw_text)

    def extract_from_pdf(self, pdf_bytes: bytes) -> ExtractedCurriculum:
        raw_text = extract_text_from_pdf(pdf_bytes)
        if not raw_text or len(raw_text.strip()) < 20:
            raise ValueError(
                "Could not extract any readable text from the uploaded PDF document. "
                "The PDF may be password-protected or empty. Please verify the file or paste the syllabus text directly."
            )
        return self.extract_from_text(raw_text)

    def extract_from_text(self, raw_text: str) -> ExtractedCurriculum:
        if not raw_text or not raw_text.strip():
            raise ValueError(
                "No syllabus text provided. Please enter or upload a valid syllabus document."
            )

        clean_text = normalize_syllabus_text(raw_text.strip())
        notes: List[str] = []
        lines = [line.strip() for line in clean_text.split("\n") if line.strip()]

        # 1. Course Code & Title Detection
        course_code = None
        course_name = None
        semester = None
        category = None
        department = None
        course_type = None
        credits = None
        cie_marks = None
        see_marks = None
        see_duration = None

        # A. Detect Course Code
        c_match = re.search(
            r"(?:Course\s*Code|Subject\s*Code|Code)\s*[:\-]\s*([A-Za-z0-9\-]+)",
            clean_text,
            re.IGNORECASE
        )
        if c_match:
            course_code = c_match.group(1).strip().upper()

        if not course_code:
            code_pattern_match = re.search(
                r"\b([A-Z]{2,5}\s*\d{2,4}[A-Z]{0,4}|[0-9]{2}[A-Z]{2,4}[0-9]{2,3})\b",
                clean_text[:1200]
            )
            if code_pattern_match:
                course_code = code_pattern_match.group(1).replace(" ", "").upper()

        # B. Detect Course Title
        for line in lines[:20]:
            t_match = re.search(
                r"(?:Subject\s*Name|Course\s*Name|Course\s*Title|Subject)\s*[:\-]\s*([^\n\r]+)",
                line,
                re.IGNORECASE
            )
            if t_match:
                cand = t_match.group(1).strip()
                cand = re.sub(r"^(?:Name|Title)\s*[:\-]?\s*", "", cand, flags=re.IGNORECASE).strip()
                if len(cand) >= 3 and not re.match(r"^(?:code|unit|module|chapter|outcome|co\d+)", cand, re.IGNORECASE):
                    course_name = cand
                    break

        if not course_name:
            # Look for prominent subject header (e.g., DATABASE MANAGEMENT SYSTEMS)
            for line in lines[:16]:
                # Skip institutional headers and administrative metadata
                if re.search(
                    r"\b(?:university|college|department|faculty|syllabus|curriculum|scheme|regulation|credits?|total\s*hours|cie|see|marks|duration|common\s*to|part\s*[–\-]|unit|module|page\s*\d+)\b",
                    line,
                    re.IGNORECASE
                ):
                    continue
                if re.match(r"^(?:semester|category|course\s*code|code|credits?|hours?|theory)\b", line, re.IGNORECASE):
                    continue
                if (line.startswith("(") and line.endswith(")")) or (line.startswith("[") and line.endswith("]")):
                    continue
                # Skip running header like "Artificial Intelligence and Machine Learning 3"
                if re.search(r"\b(?:artificial\s*intelligence|machine\s*learning|computer\s*science|information\s*science)\b", line, re.IGNORECASE) and re.search(r"\d+$", line):
                    continue

                cleaned_line = re.sub(r"^[A-Za-z0-9\s\-]+[:\-]\s*", "", line).strip()
                if 4 <= len(cleaned_line) <= 80:
                    course_name = cleaned_line
                    break

        if not course_name:
            course_name = "Untitled Course"
            notes.append("Course title not explicitly detected in header lines; please verify.")

        if not course_code:
            words = [w for w in re.split(r"[\s&\-_]+", course_name) if w.lower() not in ["and", "of", "the", "in", "to", "for", "untitled", "course"]]
            if len(words) >= 2:
                course_code = "".join(w[0].upper() for w in words[:4]) + "101"
            elif words:
                course_code = words[0][:4].upper() + "101"
            else:
                course_code = "CRS101"
            notes.append(f"Course code inferred as '{course_code}'.")

        # C. Semester Deduction
        sem_m = re.search(r"Semester\s*[:\-]?\s*([0-9IVXLCDMivxlcdm]+|\w+)", clean_text[:1200], re.IGNORECASE)
        if sem_m:
            sem_raw = sem_m.group(1).strip()
            if sem_raw.upper() in ROMAN_MAP:
                semester = f"Semester {ROMAN_MAP[sem_raw.upper()]} ({sem_raw.upper()})"
            else:
                semester = f"Semester {sem_raw}"

        # D. Category Deduction
        cat_m = re.search(r"Category\s*[:\-]?\s*([^\n\r]+)", clean_text[:1200], re.IGNORECASE)
        if cat_m:
            category = cat_m.group(1).strip()

        # E. Department / Target Branches
        dept_m = re.search(r"(?:\(?Common\s*to\s*([^\)\n\r]+)\)?|Department\s*[:\-]\s*([^\n\r]+))", clean_text[:1200], re.IGNORECASE)
        if dept_m:
            department = (dept_m.group(1) or dept_m.group(2)).strip()
        else:
            # Check for header degree program (e.g. Artificial Intelligence and Machine Learning)
            for line in lines[:5]:
                if re.search(r"\b(?:Artificial Intelligence|Machine Learning|Computer Science|Information Science|Electronics|Data Science)\b", line, re.IGNORECASE):
                    department = re.sub(r"\s*\d+$", "", line).strip()
                    break

        # F. Course Type (Theory / Practice)
        type_m = re.search(r"\(?(Theory\s*(?:and|&)\s*Practice|Theory\s*&\s*Practical|Theory|Practical|Laboratory|Integrated)\)?", clean_text[:1200], re.IGNORECASE)
        if type_m:
            course_type = type_m.group(1).strip()

        # G. Credits (L:T:P)
        cred_m = re.search(r"Credits(?:\s*[:\-]\s*L:T:P|\s*\(L:T:P\)|\s*L:T:P)?\s*[:\-]\s*([0-9\:\.]+)", clean_text[:1200], re.IGNORECASE)
        if cred_m:
            credits = cred_m.group(1).strip()

        # H. CIE & SEE Marks & Duration
        cie_m = re.search(r"CIE\s*[:\-]\s*([^\n\r]+?)(?=\s*(?:SEE|Total|Course|Duration)|\n|$)", clean_text[:1200], re.IGNORECASE)
        if cie_m:
            cie_marks = cie_m.group(1).strip()

        see_m = re.search(r"SEE\s*[:\-]\s*([^\n\r]+?)(?=\s*(?:SEE\s*Duration|Total|Course|Duration)|\n|$)", clean_text[:1200], re.IGNORECASE)
        if see_m:
            see_marks = see_m.group(1).strip()

        see_dur_m = re.search(r"SEE\s*Duration\s*[:\-]\s*([^\n\r]+)", clean_text[:1200], re.IGNORECASE)
        if see_dur_m:
            see_duration = see_dur_m.group(1).strip()

        # 2. Extract Course Outcomes
        outcomes = self._extract_outcomes(clean_text)
        if outcomes:
            notes.append(f"Successfully extracted {len(outcomes)} Course Outcomes (Bloom-aligned).")
        else:
            notes.append("No explicit Course Outcomes (COs) detected in the syllabus.")

        # 3. Extract Units / Modules
        units = self._extract_units(clean_text)
        if not units:
            raise ValueError(
                "Could not extract any units or modules from the syllabus. "
                "Please verify that the syllabus contains recognizable module/unit headings "
                "(e.g. 'UNIT 1: Title' or 'UNIT-I') followed by topics and concepts."
            )

        # 4. Extract total course hours
        total_hours = None
        th_match = re.search(r"(?:Total\s*Hours|Total\s*Periods|Contact\s*Hours)\s*[:\-]\s*(\d+)L?(?:\+(\d+)P)?", clean_text, re.IGNORECASE)
        if th_match:
            try:
                lecture_hours = int(th_match.group(1))
                total_hours = lecture_hours
            except ValueError:
                pass

        if not total_hours:
            unit_hours_sum = sum((u.hours or 0) for u in units)
            if unit_hours_sum > 0:
                total_hours = unit_hours_sum

        if not total_hours:
            unit_hour_matches = re.findall(
                r"(?:UNIT|MODULE)\s*[\s\-:\.]*\s*(?:[0-9]{1,2}|[IVXLCDMivxlcdm]+)\b[^\n]*?(\d+)\s*(?:Hours?|Hrs?|L)\b",
                clean_text,
                re.IGNORECASE
            )
            if unit_hour_matches and len(unit_hour_matches) >= 3:
                total_hours = sum(int(h) for h in unit_hour_matches)

        if total_hours:
            notes.append(f"Detected course volume: {total_hours} lecture hours ({total_hours} periods of 60 min).")

        # 5. Extract Reference Books
        reference_books = self._extract_reference_books(clean_text)
        if reference_books:
            notes.append(f"Extracted {len(reference_books)} prescribed reference books.")

        # 6. Extract Rubric Summary
        rubric_summary = self._extract_rubric_summary(clean_text)

        return ExtractedCurriculum(
            course_name=course_name,
            course_code=course_code,
            semester=semester,
            category=category,
            department=department,
            course_type=course_type,
            credits=credits,
            cie_marks=cie_marks,
            see_marks=see_marks,
            see_duration=see_duration,
            reference_books=reference_books,
            rubric_summary=rubric_summary,
            outcomes=outcomes,
            units=units,
            total_hours=total_hours,
            period_duration=60,
            confidence_score=0.96 if len(units) >= 3 else 0.88,
            extraction_notes=notes
        )

    def _extract_outcomes(self, text: str) -> List[OutcomeDraft]:
        outcomes: List[OutcomeDraft] = []
        # Match CO patterns: CO 1 ..., CO1: ..., Course Outcome 1: ..., CO 1 - ...
        co_matches = re.findall(
            r"(?:^|\n)\s*(CO\s*\d+|Course\s*Outcome\s*\d+)[\s:\-]+([^\n\r]+)",
            text,
            re.IGNORECASE
        )
        for code_raw, desc_raw in co_matches:
            desc = desc_raw.strip()
            if not desc or len(desc) < 6:
                continue

            bloom = classify_bloom_level(desc)
            clean_code = re.sub(r"\s+", "", code_raw).upper()
            clean_code = clean_code.replace("COURSEOUTCOME", "CO").replace("COURSE_OUTCOME", "CO")

            outcomes.append(OutcomeDraft(
                code=clean_code,
                description=desc,
                bloom_level=bloom
            ))
        return outcomes

    def _extract_reference_books(self, text: str) -> List[str]:
        ref_match = re.search(
            r"(?:Reference\s*Books?|Text\s*Books?|Suggested\s*Readings?)\s*[:\-]?(.*?)(?=(?:LABORATORY|PART\s*[–\-]|RUBRIC|CONTINUOUS\s*INTERNAL|\Z))",
            text,
            re.IGNORECASE | re.DOTALL
        )
        if not ref_match:
            return []

        raw_block = ref_match.group(1).strip()
        book_candidates = re.split(r"(?:^|\n)\s*(?:\d+[\.\)]|\*|\-)\s*", raw_block)
        books: List[str] = []
        for b in book_candidates:
            clean_b = re.sub(r"\s+", " ", b).strip()
            if len(clean_b) >= 15:
                books.append(clean_b)
        return books

    def _extract_rubric_summary(self, text: str) -> Optional[str]:
        rubric_match = re.search(
            r"(?:RUBRIC\s*FOR\s*THE\s*CONTINUOUS\s*INTERNAL\s*EVALUATION|CONTINUOUS\s*INTERNAL\s*EVALUATION|CIE\s*RUBRIC)(.*?)(?=(?:REFERENCE\s*BOOKS?|LABORATORY\s*COMPONENT|\Z))",
            text,
            re.IGNORECASE | re.DOTALL
        )
        if not rubric_match:
            return None

        block = rubric_match.group(1)
        # Summarize key components if found
        quizzes = re.search(r"QUIZZES[^\n]*?(\d+)\s*(?:MARKS)?", block, re.IGNORECASE)
        tests = re.search(r"TESTS[^\n]*?(\d+)\s*(?:MARKS)?", block, re.IGNORECASE)
        exp = re.search(r"EXPERIENTIAL[^\n]*?(\d+)\s*(?:MARKS)?", block, re.IGNORECASE)
        lab = re.search(r"LAB[^\n]*?(\d+)\s*(?:MARKS)?", block, re.IGNORECASE)
        max_cie = re.search(r"MAXIMUM\s*MARKS\s*FOR\s*THE\s*CIE\s*(\d+)", block, re.IGNORECASE)

        cie_summary = []
        if quizzes:
            cie_summary.append(f"Quizzes: {quizzes.group(1)}M")
        if tests:
            cie_summary.append(f"Tests: {tests.group(1)}M")
        if exp:
            cie_summary.append(f"Experiential: {exp.group(1)}M")
        if lab:
            cie_summary.append(f"Lab: {lab.group(1)}M")
        cie_total = f"Max CIE: {max_cie.group(1)}M" if max_cie else "CIE Evaluated"

        return f"{cie_total} ({', '.join(cie_summary)})" if cie_summary else None

    def _extract_units(self, text: str) -> List[UnitDraft]:
        unit_header_pattern = (
            r"(?:^|\n)\s*(?:UNIT|MODULE|CHAPTER|PART)\s*[\s\-:\.]*\s*"
            r"([0-9]{1,2}|[IVXLCDMivxlcdm]+|One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten)\b"
        )
        first_match = re.search(unit_header_pattern, text, re.IGNORECASE)
        if not first_match:
            return []

        units_region = text[first_match.start():]

        cutoff_pattern = (
            r"(?:\n\s*(?:"
            r"Course\s*Outcomes?|"
            r"Learning\s*Outcomes?|"
            r"Course\s*Objectives?|"
            r"Expected\s*Outcomes?|"
            r"CO\s*\d+\b|"
            r"TEXT\s*BOOKS?|"
            r"REFERENCE\s*BOOKS?|"
            r"REFERENCES?|"
            r"RECOMMENDED\s*READINGS?|"
            r"SUGGESTED\s*READINGS?|"
            r"EVALUATION\s*SCHEME|"
            r"SCHEME\s*OF\s*(?:EVALUATION|EXAMINATION)|"
            r"QUESTION\s*PAPER\s*PATTERN|"
            r"RUBRICS?\b|"
            r"CONTINUOUS\s*INTERNAL\s*EVALUATION|"
            r"SEMESTER\s*END\s*EXAMINATION|"
            r"WEB\s*REFERENCES?|"
            r"ONLINE\s*RESOURCES?|"
            r"E\-RESOURCES?"
            r")\s*[:\-]?(?:\s+[^\n]*)?(?=\n|\Z))"
        )
        cutoff_match = re.search(cutoff_pattern, units_region, re.IGNORECASE)
        core_text = units_region[:cutoff_match.start()] if cutoff_match else units_region

        unit_pattern = (
            r"(?:^|\n)\s*(?:UNIT|MODULE|CHAPTER|PART)\s*[\s\-:\.]*\s*"
            r"([0-9]{1,2}|[IVXLCDMivxlcdm]+|One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten)\b[\s\-:\.]*(.*?)"
            r"(?=(?:\n\s*(?:UNIT|MODULE|CHAPTER|PART)\s*[\s\-:\.]*(?:[0-9]{1,2}|[IVXLCDMivxlcdm]+|One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten)\b)|\Z)"
        )
        matches = list(re.finditer(unit_pattern, core_text, re.IGNORECASE | re.DOTALL))

        if not matches:
            return []

        units: List[UnitDraft] = []
        all_concepts_flat: List[str] = []

        for i, match in enumerate(matches, start=1):
            unit_num_raw = match.group(1).strip().upper()
            unit_body = match.group(2).strip()

            unit_num = i
            if unit_num_raw in ROMAN_MAP:
                unit_num = ROMAN_MAP[unit_num_raw]
            elif unit_num_raw.lower() in WORD_MAP:
                unit_num = WORD_MAP[unit_num_raw.lower()]
            else:
                try:
                    unit_num = int(unit_num_raw)
                except ValueError:
                    unit_num = i

            # Detect unit hours notation (e.g. "09 Hrs", "(8 Hours)", "10 Periods")
            unit_hours = None
            h_match = re.search(r"(\d+)\s*(?:Hours?|Hrs?|Periods?|L)\b", unit_body[:100], re.IGNORECASE)
            if h_match:
                try:
                    unit_hours = int(h_match.group(1))
                except ValueError:
                    pass

            lines = [line.strip() for line in unit_body.split("\n") if line.strip()]
            if not lines:
                continue

            # Strip hours notation from lines
            filtered_lines: List[str] = []
            for l in lines:
                l_clean = re.sub(r"[\(\[]?\s*\d+\s*(?:Hours?|Hrs?|Periods?|L)\b[\)\]]?", "", l, flags=re.IGNORECASE).strip()
                l_clean = re.sub(r"^[\s\-:]+", "", l_clean).strip()
                if l_clean:
                    filtered_lines.append(l_clean)

            topics = self._parse_topics_from_lines(filtered_lines, unit_num, all_concepts_flat)

            # Derive concise, descriptive Unit Title
            if topics:
                if len(topics) >= 2:
                    unit_title = f"{topics[0].title} & {topics[1].title}"
                else:
                    unit_title = topics[0].title
            else:
                unit_title = f"Unit {unit_num}"

            if len(unit_title) > 90:
                unit_title = unit_title[:87] + "..."

            if not topics:
                concept_name = f"{unit_title} Core Principles"
                concepts = [
                    ConceptDraft(
                        name=concept_name,
                        description=f"Core coverage of {unit_title}",
                        difficulty=3,
                        importance=4,
                        concept_type="conceptual",
                        prerequisites=[all_concepts_flat[-1]] if all_concepts_flat else []
                    )
                ]
                all_concepts_flat.append(concept_name)
                topics = [
                    TopicDraft(
                        title=unit_title,
                        description=f"Curriculum topic for {unit_title}",
                        estimated_minutes=120,
                        concepts=concepts
                    )
                ]

            units.append(UnitDraft(
                unit_number=unit_num,
                title=unit_title,
                description=f"Curriculum module covering {unit_title}",
                hours=unit_hours,
                topics=topics
            ))

        return units

    def _merge_wrapped_lines(self, lines: List[str]) -> List[str]:
        """Merge lines that wrap in the middle of sentences or topics across newlines."""
        merged: List[str] = []
        for line in lines:
            l_str = line.strip()
            if not l_str:
                continue
            l_str = re.sub(r"^[\*\-\•\d+\.]\s*", "", l_str).strip()
            l_str = re.sub(r"[\(\[]?\s*\d+\s*(?:Hours?|Hrs?|Periods?|L)\b[\)\]]?", "", l_str, flags=re.IGNORECASE).strip()
            if not l_str or len(l_str) < 3:
                continue

            if re.match(
                r"^(?:Course\s*Outcomes?|Learning\s*Outcomes?|Course\s*Objectives?|CO\s*\d+|Reference\s*Books?|References?|Text\s*Books?|Rubric|Question\s*Paper|Continuous\s*Internal|Semester\s*End|Maximum\s*Marks|Page\s*\d+)\b",
                l_str,
                re.IGNORECASE
            ):
                continue

            if not merged:
                merged.append(l_str)
            else:
                prev = merged[-1]
                is_fresh_topic = (
                    " - " in l_str or " – " in l_str or " — " in l_str
                    or bool(re.search(r"^[A-Z][A-Za-z\s]{3,45}\s*:", l_str))
                )
                # Merge if previous line did not end in sentence terminator AND this line is not a fresh topic header,
                # or if this line starts with a lowercase letter.
                if (not prev.endswith((".", ";")) and not is_fresh_topic) or l_str[0].islower():
                    merged[-1] = prev.rstrip("-") + " " + l_str
                else:
                    merged.append(l_str)
        return merged

    def _parse_topics_from_lines(
        self,
        topic_lines: List[str],
        unit_num: int,
        all_concepts_flat: List[str]
    ) -> List[TopicDraft]:
        topics: List[TopicDraft] = []
        merged_lines = self._merge_wrapped_lines(topic_lines)
        topic_blocks: List[Tuple[str, List[str]]] = []

        for line in merged_lines:
            t_title = None
            details = None

            if " - " in line or " – " in line or " — " in line:
                parts = re.split(r"\s+[\-–—]\s+", line, maxsplit=1)
                t_title = parts[0].strip()
                details = parts[1].strip() if len(parts) > 1 else ""
            elif ":" in line:
                parts = line.split(":", 1)
                pre = parts[0].strip()
                if len(pre) <= 65 and not any(pre.lower().startswith(w) for w in ["e.g.", "for example", "such as"]):
                    t_title = pre
                    details = parts[1].strip()

            if t_title is not None:
                # Split details by semicolons and commas
                raw_concepts = [c.strip() for c in re.split(r"[;:]\s*", details) if len(c.strip()) > 2]
                all_c: List[str] = []
                for rc in raw_concepts:
                    sub_items = [s.strip() for s in rc.split(",") if len(s.strip()) > 2]
                    all_c.extend(sub_items if sub_items else [rc])

                if not all_c:
                    all_c = [t_title]
                topic_blocks.append((t_title, all_c))
            else:
                items = [s.strip() for s in re.split(r"[,;]\s*", line) if len(s.strip()) > 2]
                if items:
                    if len(items) > 5:
                        chunk_size = 4
                        for idx in range(0, len(items), chunk_size):
                            chunk = items[idx:idx + chunk_size]
                            topic_blocks.append((chunk[0], chunk))
                    else:
                        topic_blocks.append((items[0], items))

        for topic_title, concept_strings in topic_blocks:
            clean_topic_title = re.sub(r"^[0-9\.\)\-]+\s*", "", topic_title).strip()
            if len(clean_topic_title) < 3:
                continue

            concepts: List[ConceptDraft] = []
            prev_concept: Optional[str] = None

            for idx, c_name in enumerate(concept_strings, start=1):
                c_name_clean = re.sub(r"^[0-9\.\)\-]+\s*", "", c_name).strip()
                if not c_name_clean or len(c_name_clean) < 2:
                    continue

                c_type, diff, bloom = self._infer_concept_attributes(c_name_clean)
                importance = 5 if diff >= 4 else 4 if diff == 3 else 3

                # Directed Acyclic Graph (DAG) prerequisite chaining
                prereqs: List[str] = []
                if prev_concept and prev_concept != c_name_clean:
                    prereqs.append(prev_concept)
                elif all_concepts_flat and idx == 1:
                    prereqs.append(all_concepts_flat[-1])

                concepts.append(ConceptDraft(
                    name=c_name_clean,
                    description=f"Detailed study and mastery of {c_name_clean}",
                    difficulty=diff,
                    importance=importance,
                    concept_type=c_type,
                    prerequisites=prereqs,
                    bloom_level=bloom
                ))
                all_concepts_flat.append(c_name_clean)
                prev_concept = c_name_clean

            if concepts:
                topics.append(TopicDraft(
                    title=clean_topic_title,
                    description=f"Instructional topic covering {clean_topic_title}",
                    estimated_minutes=120,
                    concepts=concepts
                ))

        return topics

    def _infer_concept_attributes(self, name: str) -> Tuple[str, int, str]:
        """Infers (concept_type, difficulty 1-5, bloom_level) based on pedagogical terminology."""
        n_low = name.lower()

        # Problem solving / mathematical / algorithmic
        if any(w in n_low for w in [
            "algorithm", "complexity", "proof", "decomposition", "calculus", "solver",
            "heuristic", "optimization", "graph", "tree", "matrix", "automata", "dfa",
            "nfa", "pda", "turing machine", "pumping lemma", "halting problem", "relational algebra"
        ]):
            return ("problem_solving", 4, "Apply")

        # Analytical / theoretical / architectural
        if any(w in n_low for w in [
            "architecture", "normal form", "bcnf", "3nf", "concurrency", "serializability",
            "protocol", "deadlock", "tradeoff", "analysis", "functional dependencies", "equivalence",
            "two phase locking", "2pl"
        ]):
            return ("analytical", 4, "Analyze")

        # Practical / hands-on / programming
        if any(w in n_low for w in [
            "sql", "dml", "ddl", "code", "implementation", "syntax", "library",
            "queries", "query", "nosql", "hadoop", "mapreduce", "mongodb", "demo", "lab", "terminal"
        ]):
            return ("practical", 3, "Apply")

        # Procedural / step-by-step
        if any(w in n_low for w in [
            "pipeline", "process", "recovery", "walkthrough", "procedure",
            "execution", "lifecycle", "transition", "derivation", "transaction processing", "schedules"
        ]):
            return ("procedural", 3, "Understand")

        # Conceptual / foundational
        if any(w in n_low for w in [
            "introduction", "overview", "definition", "concept", "characteristics", "fundamentals",
            "data model", "schema", "instance", "entity", "attribute", "relationship"
        ]):
            return ("conceptual", 2, "Understand")

        # High difficulty advanced topics
        if any(w in n_low for w in [
            "advanced", "distributed", "sharding", "replication", "fault-tolerant", "deep learning", "neural",
            "compiler", "kernel", "unsolvable"
        ]):
            return ("analytical", 5, "Evaluate")

        return ("conceptual", 3, "Understand")


nlp_provider = DeterministicNLPProvider()
