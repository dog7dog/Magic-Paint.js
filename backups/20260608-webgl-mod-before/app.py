from flask import Flask, request, jsonify, send_from_directory 
import sqlite3, json, time, os

app = Flask(__name__, static_folder=".", static_url_path="")
DB = "projects.db"

@app.after_request
def add_no_cache_headers(response):
    if request.path == "/" or request.path.endswith((".html", ".js", ".css")):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

def init_db():
    with sqlite3.connect(DB) as con:
        con.execute("""
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            data TEXT NOT NULL,
            thumbnail TEXT,
            updated_at TEXT NOT NULL
        )
        """)
init_db()

@app.route("/")
def index():
    return send_from_directory(".", "index.html")

@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(".", path)

@app.route("/projects", methods=["GET"])
def list_projects():
    with sqlite3.connect(DB) as con:
        rows = con.execute(
            "SELECT id, name, thumbnail, updated_at FROM projects ORDER BY id DESC"
        ).fetchall()
    return jsonify([
        {"id": r[0], "name": r[1], "thumbnail": r[2], "updated_at": r[3]}
        for r in rows
    ])

@app.route("/projects/<int:project_id>", methods=["GET"])
def get_project(project_id):
    with sqlite3.connect(DB) as con:
        row = con.execute(
            "SELECT id, name, data, thumbnail, updated_at FROM projects WHERE id=?",
            (project_id,)
        ).fetchone()
    if not row:
        return jsonify({"error": "not found"}), 404
    return jsonify({
        "id": row[0],
        "name": row[1],
        "data": json.loads(row[2]),
        "thumbnail": row[3],
        "updated_at": row[4],
    })

@app.route("/projects", methods=["POST"])
def create_project():
    body = request.get_json(force=True)
    name = body.get("name") or "無題"
    data = body.get("data") or {}
    thumbnail = body.get("thumbnail")
    updated_at = time.strftime("%Y-%m-%d %H:%M:%S")
    with sqlite3.connect(DB) as con:
        cur = con.execute(
            "INSERT INTO projects(name, data, thumbnail, updated_at) VALUES(?,?,?,?)",
            (name, json.dumps(data, ensure_ascii=False), thumbnail, updated_at)
        )
        pid = cur.lastrowid
    return jsonify({"ok": True, "id": pid})

@app.route("/projects/<int:project_id>", methods=["PUT"])
def update_project(project_id):
    body = request.get_json(force=True)
    name = body.get("name") or "無題"
    data = body.get("data") or {}
    thumbnail = body.get("thumbnail")
    updated_at = time.strftime("%Y-%m-%d %H:%M:%S")
    with sqlite3.connect(DB) as con:
        con.execute(
            "UPDATE projects SET name=?, data=?, thumbnail=?, updated_at=? WHERE id=?",
            (name, json.dumps(data, ensure_ascii=False), thumbnail, updated_at, project_id)
        )
    return jsonify({"ok": True, "id": project_id})

@app.route("/projects/<int:project_id>", methods=["DELETE"])
def delete_project(project_id):
    with sqlite3.connect(DB) as con:
        con.execute("DELETE FROM projects WHERE id=?", (project_id,))
    return jsonify({"ok": True})

# Compatibility with the earlier /api/projects format
@app.route("/api/projects", methods=["GET", "POST"])
def api_projects():
    if request.method == "GET":
        return list_projects()
    return create_project()

@app.route("/api/projects/<int:project_id>", methods=["GET", "PUT", "DELETE"])
def api_project(project_id):
    if request.method == "GET":
        return get_project(project_id)
    if request.method == "PUT":
        return update_project(project_id)
    return delete_project(project_id)


#<!-- 5/20追加ここから（MOD Loader） -->
# ── MOD loader API: セキュリティなし試作 ──────────────────────
from pathlib import Path
import json

MODS_DIR = Path(__file__).parent / "mods"

@app.route("/api/mods", methods=["GET"])
def list_mods():
    mods = []
    MODS_DIR.mkdir(exist_ok=True)

    for mod_dir in sorted(MODS_DIR.iterdir()):
        if not mod_dir.is_dir():
            continue

        manifest_path = mod_dir / "mod.json"
        if not manifest_path.exists():
            continue

        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            
        except Exception as e:
            mods.append({
                "id": mod_dir.name,
                "enabled": False,
                "error": f"mod.json error: {e}"
            })
            continue

        manifest["enabled"] = manifest.get("enabled", True)


        manifest["id"] = manifest.get("id") or mod_dir.name
        manifest["base_url"] = f"/mods/{mod_dir.name}"
        manifest["scripts"] = [f"/mods/{mod_dir.name}/{s}" for s in manifest.get("scripts", [])]
        manifest["styles"] = [f"/mods/{mod_dir.name}/{s}" for s in manifest.get("styles", [])]
        mods.append(manifest)

    return jsonify(mods)


@app.route("/api/mods/<mod_id>/toggle", methods=["POST"])
def toggle_mod(mod_id):
    MODS_DIR.mkdir(exist_ok=True)

    mod_dir = MODS_DIR / mod_id
    manifest_path = mod_dir / "mod.json"

    if not manifest_path.exists():
        return jsonify({"ok": False, "error": "MODが見つかりません"}), 404

    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["enabled"] = not manifest.get("enabled", True)

        manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )

        return jsonify({
            "ok": True,
            "id": mod_id,
            "enabled": manifest["enabled"]
        })

    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/mods/<path:filename>", methods=["GET"])
def serve_mod_file(filename):
    return send_from_directory(MODS_DIR, filename)


if __name__ == "__main__":
    app.run(debug=True, port=5000)
