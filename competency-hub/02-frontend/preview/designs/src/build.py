"""Inline the shared data and preview controls into each design. Usage: python3 build.py"""
import pathlib
here = pathlib.Path(__file__).parent
out = here.parent
files = ["design-1-control.html", "design-2-editorial.html", "design-3-operations.html", "design-4-week.html", "design-5-bento.html"]
shared = "<style>\n" + (here / "switcher.css").read_text() + "</style>\n<script>\n" + (here / "data.js").read_text() + "</script>\n"
extra = [(4, "design-4-week-original.html")]
for i, name in list(enumerate(files, 1)) + extra:
    if not (here / name).exists():
        continue
    src = (here / name).read_text()
    js_files = ", ".join('"%s"' % f for f in files)
    meta = '<script>window.DESIGN = {n: %d, name: document.title.split(" – ").pop(), files: [%s]};</script>\n' % (i, js_files)
    html = src.replace("<!--@SHARED-->", shared + meta).replace("<!--@SWITCH-->", "<script>\n" + (here / "switcher.js").read_text() + "</script>")
    (out / name).write_text(html)
    print("wrote", out / name)
