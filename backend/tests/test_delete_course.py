from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_delete_course_flow():
    # 1. Login
    login_resp = client.post("/api/auth/login", json={"email": "faculty@optiteach.edu", "password": "admin123"})
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Create a temporary course to delete
    create_resp = client.post("/api/courses", json={
        "code": "DEL101",
        "title": "Course To Be Deleted",
        "semester": "Fall 2026",
        "academic_year": "2026-2027",
        "total_classes": 30,
        "period_duration": 50,
        "section_name": "Section Z"
    }, headers=headers)
    assert create_resp.status_code in (200, 201), create_resp.text
    course_id = create_resp.json()["id"]

    # 3. Verify it appears in get
    get_resp = client.get(f"/api/courses/{course_id}", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["code"] == "DEL101"

    # 4. Delete the course
    del_resp = client.delete(f"/api/courses/{course_id}", headers=headers)
    assert del_resp.status_code == 200
    del_data = del_resp.json()
    assert del_data["status"] == "success"
    assert del_data["course_id"] == course_id

    # 5. Verify it is now gone (404)
    get_after_resp = client.get(f"/api/courses/{course_id}", headers=headers)
    assert get_after_resp.status_code == 404

    # 6. Verify deleting again returns 404
    del_again_resp = client.delete(f"/api/courses/{course_id}", headers=headers)
    assert del_again_resp.status_code == 404
