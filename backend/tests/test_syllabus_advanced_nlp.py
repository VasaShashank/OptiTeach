import io
import pytest
from app.nlp.deterministic import nlp_provider
from app.nlp.ocr import extract_text_from_image, extract_text_from_pdf
from PIL import Image, ImageDraw

RVCE_SYLLABUS_TEXT = """ Artificial Intelligence and Machine Learning 3
Semester: V
DATABASE MANAGEMENT SYSTEMS
Category: Professional Core Course
(Common to CS,IS, AI, CD,CY)
(Theory and Practice)
Course Code : CD252IA CIE : 100 + 50 Marks
Credits: L:T:P : 3:0:1 SEE : 100 + 50 Marks
Total Hours : 45L+30P SEE Duration : 3.00 + 3.00 Hours
Unit-I 09 Hrs
Introduction to Database Systems -Databases and Database users: Introduction, An example, Characteristics 
of Database Approach, Data Models, Schemas and Instances, Three-schema Architecture and Data 
Independence, The Database System Environment.
Data Modeling Using the Entity-Relationship Model- High-Level Conceptual Data Models for Database 
Design; A Sample Database Application; Entity Types, Entity Sets, Attributes and Keys; Relationship types, 
Relationship Sets, Roles and Structural Constraints; Weak Entity Types.
Unit – II 09 Hrs
Refining the ER Design for the COMPANY Database; ER Diagrams, Naming Conventions and Design 
Issues, ER- to-Relational Mapping.
Relational Model and Relational Algebra-Relational Model Concepts; Relational Model Constraints and 
Relational Database Schemas; Update Operations and Dealing with Constraint Violations; Unary Relational 
Operations: SELECT and PROJECT; Relational Algebra Operations from Set Theory; Binary Relational 
Operations: JOIN and DIVISION ; Examples of Queries in Relational Algebra.
Unit –III 09 Hrs
Introduction to SQL- SQL Data Definition, Specifying Constraints in SQL, Basic Queries in SQL; Insert, 
Delete and Update Statements in SQL More Complex SQL Retrieval Queries.
Relational Database Design - Functional Dependencies – Definition, Inference Rules, Equivalence of sets of 
FD’s, Minimal Set of FD’s ; Normal Forms Based on Primary Keys; General Definitions of Second and Third 
Normal Forms; Boyce-Codd Normal Form; Properties of Relational Decompositions.
Unit –IV 09 Hrs
Transaction Processing Concepts- Introduction to transaction processing, Transaction states and additional 
operations, Desirable properties of transaction, Schedules of transactions. Characterizing schedules based on 
Serializability: Serial, Non serial and Conflict- Serializable schedules, Testing for Conflict serializability of 
schedule
Concurrency Control Techniques: Two phase locking techniques for concurrency control, types of locks and 
system lock tables
Unit –V 09 Hrs
Introduction to NoSQL: Aggregate data models: aggregates, key-value and document data models. 
Distribution models: sharding, master-slave replication, peer-peer replication – combining sharding and 
replication.
Big Data : Types of data: Structured, semi structured, unstructured. Distributed Architectures : Hadoop, Map 
Reduce Programming Model 
Course Outcomes: After completing the course, the students will be able to: -
CO 1 Understand and explore the needs and concepts of relational, NoSQL database and Distributed 
Architecture
CO 2 Apply the knowledge of logical database design principles to real time issues. 
CO 3 Analyze and design data base systems using relational, NoSQL and Big Data concepts
CO 4 Develop applications using relational and NoSQL database
CO 5 Demonstrate database applications using various technologies.
Reference Books
1. Elmasri and Navathe: Fundamentals of Database Systems, 6th Edition, Pearson Education, 2011, 
ISBN-13: 978-0136086208.
2. Pramod J Sdalage, Martin Fowler: NoSQL A brief guide to the emerging world of Polyglot 
Persistence, Addison-Wesley, 2012, ISBN 978-0-321-82662-6, 
3. Raghu Ramakrishnan and Johannes Gehrke : Database Management Systems, 3rd Edition, McGraw-Hill, 2003 ISBN : 978-0072465631.
4. Seema Acharya and Subhashini Chellappan. Big Data and Analytics. Wiley India Pvt. Ltd. 2nd Edition
"""

def test_deduce_all_academic_parameters():
    result = nlp_provider.extract_from_text(RVCE_SYLLABUS_TEXT)
    assert result.course_name == "DATABASE MANAGEMENT SYSTEMS"
    assert result.course_code == "CD252IA"
    assert "5" in result.semester or "V" in result.semester
    assert result.category == "Professional Core Course"
    assert "CS" in result.department and "IS" in result.department
    assert "Theory and Practice" in result.course_type
    assert result.credits == "3:0:1"
    assert result.total_hours == 45
    assert "100" in result.cie_marks
    assert "100" in result.see_marks
    assert "3.00" in result.see_duration

def test_unit_hours_and_topics():
    result = nlp_provider.extract_from_text(RVCE_SYLLABUS_TEXT)
    assert len(result.units) == 5
    for unit in result.units:
        assert unit.hours == 9
        assert len(unit.topics) >= 1
        for topic in unit.topics:
            assert len(topic.concepts) >= 1

def test_bloom_taxonomy_cognitive_alignment():
    result = nlp_provider.extract_from_text(RVCE_SYLLABUS_TEXT)
    assert len(result.outcomes) == 5
    co_map = {co.code: co.bloom_level for co in result.outcomes}
    assert co_map["CO1"] == "Understand"
    assert co_map["CO2"] == "Apply"
    assert co_map["CO3"] == "Analyze"
    assert co_map["CO4"] in ["Create", "Apply"]
    assert co_map["CO5"] == "Apply"

def test_reference_books_extraction():
    result = nlp_provider.extract_from_text(RVCE_SYLLABUS_TEXT)
    assert len(result.reference_books) == 4
    assert any("Elmasri" in b for b in result.reference_books)
    assert any("Pramod" in b for b in result.reference_books)
    assert any("Ramakrishnan" in b for b in result.reference_books)

def test_image_ocr_pipeline():
    # Generate test syllabus image in memory
    img = Image.new("RGB", (650, 180), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    draw.text((20, 20), "Semester: V", fill=(0, 0, 0))
    draw.text((20, 50), "DATABASE MANAGEMENT SYSTEMS", fill=(0, 0, 0))
    draw.text((20, 80), "Course Code : CD252IA", fill=(0, 0, 0))
    draw.text((20, 110), "UNIT 1: Database Basics", fill=(0, 0, 0))
    draw.text((20, 140), "Introduction: Relational models, SQL queries.", fill=(0, 0, 0))

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    png_bytes = buf.getvalue()

    curriculum = nlp_provider.extract_from_image(png_bytes)
    assert "DATABASE" in curriculum.course_name or "MANAGEMENT" in curriculum.course_name
    assert len(curriculum.units) >= 1
