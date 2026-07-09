from pypdf import PdfReader, PdfWriter
import shutil, os

HERE = os.path.dirname(os.path.abspath(__file__))
RUNBOOK = os.path.join(HERE, "..", "public", "Altavest-Capital-3min-Demo-Runbook.pdf")
ADDENDUM = os.path.join(HERE, "activation-addendum.pdf")
TMP = RUNBOOK + ".tmp"

before_pages = len(PdfReader(RUNBOOK).pages)

writer = PdfWriter()
writer.append(RUNBOOK)     # existing pages, untouched
writer.append(ADDENDUM)    # new final page
with open(TMP, "wb") as f:
    writer.write(f)

shutil.move(TMP, RUNBOOK)  # atomic overwrite, original pages preserved byte-identical

after_pages = len(PdfReader(RUNBOOK).pages)
print(f"before={before_pages} after={after_pages}")
print("merged runbook written to", os.path.abspath(RUNBOOK))
