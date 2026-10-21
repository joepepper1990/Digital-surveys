import pathlib, sys
here = pathlib.Path(__file__).parent
out = pathlib.Path(sys.argv[1])
css = (here / "shared.css").read_text() + "\n" + (here / "shells.css").read_text()
js = (here / "shared.js").read_text()
names = {"A": "layout-a-tabs.html", "B": "layout-b-sidebar.html", "C": "layout-c-tiles.html"}
titles = {"A": "Top tabs", "B": "Side menu", "C": "Home tiles"}
for key, fname in names.items():
    html = f"""<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ESG Competency Hub – Layout {key}: {titles[key]}</title>
<style>
{css}
</style>
</head>
<body>
<div id="app"></div>
<script>window.PREVIEW_LAYOUT = "{key}";</script>
<script>
{js}
</script>
</body>
</html>
"""
    (out / fname).write_text(html)
    print("wrote", out / fname)
