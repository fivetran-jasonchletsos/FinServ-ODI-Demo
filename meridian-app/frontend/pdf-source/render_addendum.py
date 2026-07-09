from playwright.sync_api import sync_playwright
import os

HERE = os.path.dirname(os.path.abspath(__file__))
HTML = f"file://{HERE}/activation-addendum.html"
OUT  = f"{HERE}/activation-addendum.pdf"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto(HTML)
    page.pdf(
        path=OUT,
        width="8.5in", height="11in",   # US letter, matches @page 612pt x 792pt
        print_background=True,
        margin={"top": "0", "bottom": "0", "left": "0", "right": "0"},
    )
    browser.close()
print("wrote", OUT)
