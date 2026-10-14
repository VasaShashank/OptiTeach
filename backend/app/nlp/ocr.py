import io
import logging
from typing import Optional, List, Dict, Any

logger = logging.getLogger("optiteach.nlp.ocr")

_ocr_engine = None

def get_ocr_engine():
    """Lazy initialize RapidOCR engine singleton."""
    global _ocr_engine
    if _ocr_engine is None:
        try:
            from rapidocr_onnxruntime import RapidOCR
            _ocr_engine = RapidOCR()
            logger.info("RapidOCR engine initialized successfully.")
        except Exception as e:
            logger.warning(f"Could not initialize RapidOCR engine: {e}")
            _ocr_engine = False
    return _ocr_engine if _ocr_engine is not False else None


def reconstruct_spatial_lines(ocr_items: List[Any], line_threshold: float = 14.0) -> str:
    """
    Reconstructs natural line-by-line text from OCR bounding boxes,
    sorting top-to-bottom and left-to-right, preserving table columns.
    """
    if not ocr_items:
        return ""

    boxes: List[Dict[str, Any]] = []
    for item in ocr_items:
        if not item or len(item) < 2:
            continue
        poly = item[0]
        text_val = str(item[1]).strip()
        if not text_val:
            continue

        try:
            min_x = min(p[0] for p in poly)
            min_y = min(p[1] for p in poly)
            max_y = max(p[1] for p in poly)
            height = max_y - min_y
        except Exception:
            min_x, min_y, height = 0, 0, line_threshold

        boxes.append({
            "x": min_x,
            "y": min_y,
            "h": height,
            "text": text_val
        })

    if not boxes:
        return ""

    # Sort primarily by vertical coordinate (y)
    boxes.sort(key=lambda b: (b["y"], b["x"]))

    lines: List[str] = []
    current_line: List[Dict[str, Any]] = []
    current_y: Optional[float] = None

    for b in boxes:
        effective_thresh = max(line_threshold, b["h"] * 0.7)
        if current_y is None or abs(b["y"] - current_y) <= effective_thresh:
            current_line.append(b)
            if current_y is None:
                current_y = b["y"]
            else:
                current_y = (current_y + b["y"]) / 2.0
        else:
            current_line.sort(key=lambda item: item["x"])
            lines.append("  ".join(item["text"] for item in current_line))
            current_line = [b]
            current_y = b["y"]

    if current_line:
        current_line.sort(key=lambda item: item["x"])
        lines.append("  ".join(item["text"] for item in current_line))

    return "\n".join(lines)


def extract_text_from_image(image_bytes: bytes) -> str:
    """
    Extracts structured text from an image (PNG, JPG, JPEG, WEBP) using RapidOCR.
    """
    if not image_bytes:
        return ""

    engine = get_ocr_engine()
    if not engine:
        raise ValueError("OCR engine is not available. Please verify rapidocr-onnxruntime is installed.")

    try:
        ocr_result, _ = engine(image_bytes)
        return reconstruct_spatial_lines(ocr_result or [])
    except Exception as e:
        logger.error(f"Image OCR failed: {e}")
        raise ValueError(f"Failed to extract text from image: {str(e)}") from e


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """
    Extracts text from a PDF document.
    1. Attempts native digital text extraction per page via PyMuPDF (fitz) or PyPDF.
    2. If a page has no text or minimal text (< 40 chars, e.g. scanned image page),
       renders the page to a high-resolution pixmap and runs RapidOCR.
    """
    if not pdf_bytes:
        return ""

    extracted_pages: List[str] = []

    try:
        import pymupdf  # fitz
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        ocr_engine = None

        for page_idx, page in enumerate(doc):
            native_text = (page.get_text() or "").strip()
            # If native text is adequate, keep it
            if len(native_text) >= 40:
                extracted_pages.append(native_text)
            else:
                # Scanned or image-based page - render and OCR
                logger.info(f"Page {page_idx + 1} has insufficient digital text ({len(native_text)} chars); triggering OCR.")
                if ocr_engine is None:
                    ocr_engine = get_ocr_engine()

                if ocr_engine:
                    try:
                        pix = page.get_pixmap(dpi=150)
                        img_bytes = pix.tobytes("png")
                        ocr_result, _ = ocr_engine(img_bytes)
                        page_ocr_text = reconstruct_spatial_lines(ocr_result or [])
                        if page_ocr_text.strip():
                            extracted_pages.append(page_ocr_text)
                        elif native_text:
                            extracted_pages.append(native_text)
                    except Exception as ocr_err:
                        logger.warning(f"OCR fallback on page {page_idx + 1} failed: {ocr_err}")
                        if native_text:
                            extracted_pages.append(native_text)
                elif native_text:
                    extracted_pages.append(native_text)

        doc.close()
    except Exception as e:
        logger.warning(f"PyMuPDF extraction encountered error: {e}, attempting pypdf fallback.")
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(pdf_bytes))
            for page in reader.pages:
                txt = (page.extract_text() or "").strip()
                if txt:
                    extracted_pages.append(txt)
        except Exception as e2:
            logger.error(f"pypdf fallback error: {e2}")

    return "\n\n".join(extracted_pages)
