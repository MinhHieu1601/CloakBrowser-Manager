"""PostgreSQL (Supabase) database operations for browser profiles.

Migrated from SQLite to PostgreSQL to share Supabase with saveorders.
All tables prefixed with 'browser_' to avoid conflicts.
"""

from __future__ import annotations

import datetime
import os
import random
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import psycopg2
import psycopg2.extras

DATA_DIR = Path("/data")

DATABASE_URL = os.environ.get("DATABASE_URL", "")


@contextmanager
def get_db():
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _dict_row(cursor):
    if cursor.description is None:
        return None
    cols = [d[0] for d in cursor.description]
    row = cursor.fetchone()
    if row is None:
        return None
    return dict(zip(cols, row))


def _dict_rows(cursor):
    if cursor.description is None:
        return []
    cols = [d[0] for d in cursor.description]
    return [dict(zip(cols, row)) for row in cursor.fetchall()]


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS browser_profiles (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                fingerprint_seed INTEGER NOT NULL,
                proxy TEXT,
                timezone TEXT,
                locale TEXT,
                platform TEXT DEFAULT 'windows',
                user_agent TEXT,
                screen_width INTEGER DEFAULT 1920,
                screen_height INTEGER DEFAULT 1080,
                gpu_vendor TEXT,
                gpu_renderer TEXT,
                hardware_concurrency INTEGER,
                humanize BOOLEAN DEFAULT FALSE,
                human_preset TEXT DEFAULT 'default',
                headless BOOLEAN DEFAULT FALSE,
                geoip BOOLEAN DEFAULT FALSE,
                clipboard_sync BOOLEAN DEFAULT TRUE,
                color_scheme TEXT,
                notes TEXT,
                user_data_dir TEXT NOT NULL,
                deleted_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS browser_profile_tags (
                profile_id TEXT REFERENCES browser_profiles(id) ON DELETE CASCADE,
                tag TEXT NOT NULL,
                color TEXT,
                PRIMARY KEY (profile_id, tag)
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS browser_proxies (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                url TEXT NOT NULL,
                type TEXT DEFAULT 'http',
                status TEXT DEFAULT 'active',
                notes TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS browser_standalone_tags (
                tag TEXT PRIMARY KEY,
                color TEXT
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS browser_kv_store (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def create_profile(name: str, fingerprint_seed: int | None = None, **fields: Any) -> dict[str, Any]:
    profile_id = str(uuid.uuid4())
    seed = fingerprint_seed if fingerprint_seed is not None else random.randint(10000, 99999)
    user_data_dir = str(DATA_DIR / "profiles" / profile_id)
    now = _now()
    tags = fields.pop("tags", None) or []
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO browser_profiles (
                id, name, fingerprint_seed, proxy, timezone, locale, platform,
                user_agent, screen_width, screen_height, gpu_vendor, gpu_renderer,
                hardware_concurrency, humanize, human_preset, headless, geoip,
                clipboard_sync, color_scheme, notes, user_data_dir, created_at, updated_at
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            (profile_id, name, seed, fields.get("proxy"), fields.get("timezone"),
             fields.get("locale"), fields.get("platform", "windows"), fields.get("user_agent"),
             fields.get("screen_width", 1920), fields.get("screen_height", 1080),
             fields.get("gpu_vendor"), fields.get("gpu_renderer"), fields.get("hardware_concurrency"),
             fields.get("humanize", False), fields.get("human_preset", "default"),
             fields.get("headless", False), fields.get("geoip", False),
             fields.get("clipboard_sync", True), fields.get("color_scheme"), fields.get("notes"),
             user_data_dir, now, now))
        for t in tags:
            cur.execute("INSERT INTO browser_profile_tags (profile_id, tag, color) VALUES (%s, %s, %s)",
                        (profile_id, t["tag"], t.get("color")))
    return get_profile(profile_id)


def get_profile(profile_id: str) -> dict[str, Any] | None:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM browser_profiles WHERE id = %s", (profile_id,))
        profile = _dict_row(cur)
        if not profile:
            return None
        cur.execute("SELECT tag, color FROM browser_profile_tags WHERE profile_id = %s", (profile_id,))
        profile["tags"] = _dict_rows(cur)
        return profile


def list_profiles() -> list[dict[str, Any]]:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM browser_profiles WHERE deleted_at IS NULL ORDER BY created_at DESC")
        rows = _dict_rows(cur)
        for p in rows:
            cur.execute("SELECT tag, color FROM browser_profile_tags WHERE profile_id = %s", (p["id"],))
            p["tags"] = _dict_rows(cur)
        return rows


def update_profile(profile_id: str, **fields: Any) -> dict[str, Any] | None:
    existing = get_profile(profile_id)
    if not existing:
        return None
    tags = fields.pop("tags", None)
    update_cols, update_vals = [], []
    for col in ("name", "fingerprint_seed", "proxy", "timezone", "locale", "platform",
                "user_agent", "screen_width", "screen_height", "gpu_vendor", "gpu_renderer",
                "hardware_concurrency", "humanize", "human_preset", "headless", "geoip",
                "clipboard_sync", "color_scheme", "notes"):
        if col in fields:
            update_cols.append(f"{col} = %s")
            update_vals.append(fields[col])
    if update_cols:
        update_cols.append("updated_at = %s")
        update_vals.append(_now())
        update_vals.append(profile_id)
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(f"UPDATE browser_profiles SET {', '.join(update_cols)} WHERE id = %s", update_vals)
    if tags is not None:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM browser_profile_tags WHERE profile_id = %s", (profile_id,))
            for t in tags:
                cur.execute("INSERT INTO browser_profile_tags (profile_id, tag, color) VALUES (%s, %s, %s)",
                            (profile_id, t["tag"], t.get("color")))
    return get_profile(profile_id)


def delete_profile(profile_id: str) -> bool:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM browser_profiles WHERE id = %s", (profile_id,))
        return cur.rowcount > 0


def soft_delete_profile(profile_id: str) -> bool:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE browser_profiles SET deleted_at = %s WHERE id = %s AND deleted_at IS NULL",
                    (_now(), profile_id))
        return cur.rowcount > 0


def list_trash() -> list[dict[str, Any]]:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM browser_profiles WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC")
        rows = _dict_rows(cur)
        for p in rows:
            cur.execute("SELECT tag, color FROM browser_profile_tags WHERE profile_id = %s", (p["id"],))
            p["tags"] = _dict_rows(cur)
        return rows


def restore_profile(profile_id: str) -> bool:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE browser_profiles SET deleted_at = NULL WHERE id = %s AND deleted_at IS NOT NULL",
                    (profile_id,))
        return cur.rowcount > 0


def empty_trash() -> tuple[int, list[str]]:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, user_data_dir FROM browser_profiles WHERE deleted_at IS NOT NULL")
        rows = _dict_rows(cur)
        dirs = [r["user_data_dir"] for r in rows]
        for r in rows:
            cur.execute("DELETE FROM browser_profiles WHERE id = %s", (r["id"],))
    return len(dirs), dirs


def list_all_tags() -> list[dict[str, Any]]:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT tag, color, COUNT(*) AS profile_count FROM browser_profile_tags GROUP BY tag, color ORDER BY tag")
        result = {r["tag"]: r for r in _dict_rows(cur)}
        cur.execute("SELECT tag, color FROM browser_standalone_tags ORDER BY tag")
        for r in _dict_rows(cur):
            if r["tag"] not in result:
                result[r["tag"]] = {"tag": r["tag"], "color": r["color"], "profile_count": 0}
        return sorted(result.values(), key=lambda t: t["tag"])


def create_standalone_tag(tag: str, color: str | None = None) -> bool:
    with get_db() as conn:
        cur = conn.cursor()
        try:
            cur.execute("INSERT INTO browser_standalone_tags (tag, color) VALUES (%s, %s)", (tag, color))
            return True
        except psycopg2.IntegrityError:
            conn.rollback()
            return False


def rename_tag(old_name: str, new_name: str) -> int:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE browser_profile_tags SET tag = %s WHERE tag = %s", (new_name, old_name))
        count = cur.rowcount
        cur.execute("UPDATE browser_standalone_tags SET tag = %s WHERE tag = %s", (new_name, old_name))
        return count


def update_tag_color(tag_name: str, color: str | None) -> int:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE browser_profile_tags SET color = %s WHERE tag = %s", (color, tag_name))
        count = cur.rowcount
        cur.execute("UPDATE browser_standalone_tags SET color = %s WHERE tag = %s", (color, tag_name))
        return count


def delete_tag(tag_name: str) -> int:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM browser_profile_tags WHERE tag = %s", (tag_name,))
        count = cur.rowcount
        cur.execute("DELETE FROM browser_standalone_tags WHERE tag = %s", (tag_name,))
        return count


def create_proxy(name: str, url: str, **fields: Any) -> dict[str, Any]:
    proxy_id = str(uuid.uuid4())
    now = _now()
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""INSERT INTO browser_proxies (id, name, url, type, status, notes, created_at, updated_at)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                    (proxy_id, name, url, fields.get("type", "http"), fields.get("status", "active"),
                     fields.get("notes"), now, now))
    return get_proxy(proxy_id)


def get_proxy(proxy_id: str) -> dict[str, Any] | None:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM browser_proxies WHERE id = %s", (proxy_id,))
        proxy = _dict_row(cur)
        if not proxy:
            return None
        cur.execute("SELECT COUNT(*) FROM browser_profiles WHERE proxy = %s", (proxy["url"],))
        proxy["profile_count"] = cur.fetchone()[0]
        return proxy


def list_proxies() -> list[dict[str, Any]]:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM browser_proxies ORDER BY created_at DESC")
        rows = _dict_rows(cur)
        for p in rows:
            cur.execute("SELECT COUNT(*) FROM browser_profiles WHERE proxy = %s", (p["url"],))
            p["profile_count"] = cur.fetchone()[0]
        return rows


def update_proxy(proxy_id: str, **fields: Any) -> dict[str, Any] | None:
    existing = get_proxy(proxy_id)
    if not existing:
        return None
    update_cols, update_vals = [], []
    for col in ("name", "url", "type", "status", "notes"):
        if col in fields:
            update_cols.append(f"{col} = %s")
            update_vals.append(fields[col])
    if update_cols:
        update_cols.append("updated_at = %s")
        update_vals.append(_now())
        update_vals.append(proxy_id)
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(f"UPDATE browser_proxies SET {', '.join(update_cols)} WHERE id = %s", update_vals)
    return get_proxy(proxy_id)


def delete_proxy(proxy_id: str) -> bool:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM browser_proxies WHERE id = %s", (proxy_id,))
        return cur.rowcount > 0


def count_proxies() -> int:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM browser_proxies")
        return cur.fetchone()[0]


def count_tags() -> int:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(DISTINCT tag) FROM browser_profile_tags")
        return cur.fetchone()[0]


def kv_get(key: str) -> str | None:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT value FROM browser_kv_store WHERE key = %s", (key,))
        row = cur.fetchone()
        return row[0] if row else None


def kv_set(key: str, value: str) -> None:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO browser_kv_store (key, value, updated_at) VALUES (%s, %s, %s)
               ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at""",
            (key, value, _now()))


def kv_get_with_ts(key: str) -> tuple[str | None, str | None]:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT value, updated_at FROM browser_kv_store WHERE key = %s", (key,))
        row = cur.fetchone()
        return (row[0], row[1]) if row else (None, None)


def calculate_disk_usage_mb() -> float:
    import subprocess
    mb = 0.0
    try:
        result = subprocess.run(["du", "-sm", str(DATA_DIR)], capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            mb = float(result.stdout.split()[0])
    except Exception:
        total = 0
        if DATA_DIR.exists():
            for f in DATA_DIR.rglob("*"):
                try:
                    if f.is_file():
                        total += f.stat().st_size
                except OSError:
                    pass
        mb = round(total / (1024 * 1024), 2)
    kv_set("disk_usage_mb", str(mb))
    return mb


def get_last_disk_usage() -> tuple[float | None, str | None]:
    val, ts = kv_get_with_ts("disk_usage_mb")
    return (float(val), ts) if val else (None, None)


def export_all() -> dict[str, Any]:
    return {"profiles": list_profiles(), "proxies": list_proxies()}


def import_profiles(data: list[dict[str, Any]]) -> int:
    count = 0
    for p in data:
        pid = p.get("id", str(uuid.uuid4()))
        if get_profile(pid):
            continue
        tags = p.pop("tags", []) or []
        for k in ("status", "vnc_ws_port", "cdp_url", "profile_count"):
            p.pop(k, None)
        now = _now()
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                """INSERT INTO browser_profiles (
                    id, name, fingerprint_seed, proxy, timezone, locale, platform,
                    user_agent, screen_width, screen_height, gpu_vendor, gpu_renderer,
                    hardware_concurrency, humanize, human_preset, headless, geoip,
                    clipboard_sync, color_scheme, notes, user_data_dir, created_at, updated_at
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (pid, p.get("name", "Imported"), p.get("fingerprint_seed", random.randint(10000, 99999)),
                 p.get("proxy"), p.get("timezone"), p.get("locale"), p.get("platform", "windows"),
                 p.get("user_agent"), p.get("screen_width", 1920), p.get("screen_height", 1080),
                 p.get("gpu_vendor"), p.get("gpu_renderer"), p.get("hardware_concurrency"),
                 p.get("humanize", False), p.get("human_preset", "default"),
                 p.get("headless", False), p.get("geoip", False), p.get("clipboard_sync", True),
                 p.get("color_scheme"), p.get("notes"),
                 p.get("user_data_dir", str(DATA_DIR / "profiles" / pid)),
                 p.get("created_at", now), p.get("updated_at", now)))
            for t in tags:
                tag_name = t.get("tag", t) if isinstance(t, dict) else t
                tag_color = t.get("color") if isinstance(t, dict) else None
                cur.execute("INSERT INTO browser_profile_tags (profile_id, tag, color) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
                            (pid, tag_name, tag_color))
        count += 1
    return count


def import_proxies(data: list[dict[str, Any]]) -> int:
    count = 0
    for p in data:
        pid = p.get("id", str(uuid.uuid4()))
        if get_proxy(pid):
            continue
        p.pop("profile_count", None)
        now = _now()
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("""INSERT INTO browser_proxies (id, name, url, type, status, notes, created_at, updated_at)
                           VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                        (pid, p.get("name", "Imported"), p.get("url", ""), p.get("type", "http"),
                         p.get("status", "active"), p.get("notes"), p.get("created_at", now), p.get("updated_at", now)))
        count += 1
    return count


def cleanup_stopped_profiles(running_ids: set[str]) -> tuple[int, list[str]]:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, user_data_dir FROM browser_profiles")
        rows = _dict_rows(cur)
        to_delete = [(r["id"], r["user_data_dir"]) for r in rows if r["id"] not in running_ids]
        for pid, _ in to_delete:
            cur.execute("DELETE FROM browser_profiles WHERE id = %s", (pid,))
    return len(to_delete), [d for _, d in to_delete]
