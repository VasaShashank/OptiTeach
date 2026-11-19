import sys
import os
import time
from playwright.sync_api import sync_playwright

output_dir = r"c:\Users\basav\Downloads\DBMS"
os.makedirs(output_dir, exist_ok=True)

def disable_dev_overlay(page):
    try:
        page.add_style_tag(content="nextjs-portal { display: none !important; }")
    except Exception:
        pass

def run():
    with sync_playwright() as p:
        chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
        browser = p.chromium.launch(executable_path=chrome_path, headless=True)
        context = browser.new_context(viewport={"width": 1400, "height": 900}, device_scale_factor=2)
        page = context.new_page()

        print("1. Capturing Login Form...")
        page.goto("http://localhost:3000/login", wait_until="networkidle")
        disable_dev_overlay(page)
        page.wait_for_timeout(1000)
        
        login_path = os.path.join(output_dir, "login_form.png")
        page.screenshot(path=login_path)
        print(f"Saved: {login_path}")

        print("2. Capturing Registration Form...")
        register_tab = page.locator("button.tab", has_text="Create account")
        register_tab.first.click(force=True)
        page.wait_for_timeout(600)
        disable_dev_overlay(page)
        
        reg_path = os.path.join(output_dir, "registration_form.png")
        page.screenshot(path=reg_path)
        print(f"Saved: {reg_path}")

        print("3. Logging in as faculty...")
        login_tab = page.locator("button.tab", has_text="Sign in")
        login_tab.first.click(force=True)
        page.wait_for_timeout(300)
        
        demo_btn = page.locator("button", has_text="Teacher (owns CS302)")
        if demo_btn.count() > 0:
            demo_btn.first.click(force=True)
            page.wait_for_timeout(300)
        else:
            page.fill("input[type=email]", "faculty@optiteach.edu")
            page.fill("input[type=password]", "admin123")
        
        page.click("button[type=submit]", force=True)
        page.wait_for_url(lambda u: "/login" not in u, timeout=10000)
        disable_dev_overlay(page)
        page.wait_for_timeout(1000)
        print("Logged in successfully. Current URL:", page.url)

        print("4. Capturing Course Creation Form...")
        page.goto("http://localhost:3000/courses", wait_until="networkidle")
        disable_dev_overlay(page)
        page.wait_for_timeout(1000)
        new_course_btn = page.locator("button", has_text="New course")
        new_course_btn.first.click(force=True)
        page.wait_for_selector(".modal-content", timeout=5000)
        page.wait_for_timeout(600)
        disable_dev_overlay(page)

        course_path = os.path.join(output_dir, "course_creation_form.png")
        page.screenshot(path=course_path)
        print(f"Saved: {course_path}")

        print("5. Capturing Syllabus Upload and Extracted Curriculum...")
        page.goto("http://localhost:3000/upload", wait_until="networkidle")
        disable_dev_overlay(page)
        page.wait_for_timeout(1000)

        sample_btn = page.locator("button", has_text="Try the sample syllabus")
        sample_btn.first.click(force=True)

        # Wait for curriculum extraction result
        page.wait_for_selector("text=Processes and Threads", timeout=15000)
        page.wait_for_timeout(1500)
        disable_dev_overlay(page)

        syllabus_path = os.path.join(output_dir, "syllabus_upload_and_extracted_curriculum.png")
        page.screenshot(path=syllabus_path, full_page=False)
        print(f"Saved: {syllabus_path}")

        browser.close()
        print("All screenshots captured successfully!")

if __name__ == "__main__":
    run()
