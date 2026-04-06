"""SQLite database operations for browser profiles."""

from __future__ import annotations

import datetime
import random
import sqlite3
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any

DATA_DIR = Path("/data")
DB_PATH = DATA_DIR / "profiles.db"


@contextmanager
def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
    finally:
        conn.close()


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS profiles (
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
                humanize BOOLEAN DEFAULT 0,
                human_preset TEXT DEFAULT 'default',
                headless BOOLEAN DEFAULT 0,
                geoip BOOLEAN DEFAULT 0,
                clipboard_sync BOOLEAN DEFAULT 1,
                color_scheme TEXT,
                notes TEXT,
                user_data_dir TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS profile_tags (
                profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
                tag TEXT NOT NULL,
                color TEXT,
                PRIMARY KEY (profile_id, tag)
            );

            CREATE TABLE IF NOT EXISTS proxies (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                url TEXT NOT NULL,
                type TEXT DEFAULT 'http',
                status TEXT DEFAULT 'active',
                notes TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS kv_store (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
        """)
        conn.commit()

        # Migrations for existing databases
        cols = {row[1] for row in conn.execute("PRAGMA table_info(profiles)").fetchall()}
        if "clipboard_sync" not in cols:
            conn.execute("ALTER TABLE profiles ADD COLUMN clipboard_sync BOOLEAN DEFAULT 1")
            conn.commit()


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def create_profile(
    name: str,
    fingerprint_seed: int | None = None,
    **fields: Any,
) -> dict[str, Any]:
    profile_id = str(uuid.uuid4())
    seed = fingerprint_seed if fingerprint_seed is not None else random.randint(10000, 99999)
    user_data_dir = str(DATA_DIR / "profiles" / profile_id)
    now = _now()
    tags = fields.pop("tags", None) or []

    with get_db() as conn:
        conn.execute(
            """INSERT INTO profiles (
                id, name, fingerprint_seed, proxy, timezone, locale, platform,
                user_agent, screen_width, screen_height, gpu_vendor, gpu_renderer,
                hardware_concurrency, humanize, human_preset, headless, geoip,
                clipboard_sync, color_scheme, notes, user_data_dir, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                profile_id, name, seed,
                fields.get("proxy"),
                fields.get("timezone"),
                fields.get("locale"),
                fields.get("platform", "windows"),
                fields.get("user_agent"),
                fields.get("screen_width", 1920),
                fields.get("screen_height", 1080),
                fields.get("gpu_vendor"),
                fields.get("gpu_renderer"),
                fields.get("hardware_concurrency"),
                fields.get("humanize", False),
                fields.get("human_preset", "default"),
                fields.get("headless", False),
                fields.get("geoip", False),
                fields.get("clipboard_sync", True),
                fields.get("color_scheme"),
                fields.get("notes"),
                user_data_dir, now, now,
            ),
        )
        for t in tags:
            conn.execute(
                "INSERT INTO profile_tags (profile_id, tag, color) VALUES (?, ?, ?)",
                (profile_id, t["tag"], t.get("color")),
            )
        conn.commit()

    return get_profile(profile_id)  # type: ignore[return-value]


def get_profile(profile_id: str) -> dict[str, Any] | None:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM profiles WHERE id = ?", (profile_id,)).fetchone()
        if not row:
            return None
        profile = dict(row)
        tags = conn.execute(
            "SELECT tag, color FROM profile_tags WHERE profile_id = ?",
            (profile_id,),
        ).fetchall()
        profile["tags"] = [dict(t) for t in tags]
        return profile


def list_profiles() -> list[dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM profiles ORDER BY created_at DESC").fetchall()
        profiles = []
        for row in rows:
            profile = dict(row)
            tags = conn.execute(
                "SELECT tag, color FROM profile_tags WHERE profile_id = ?",
                (profile["id"],),
            ).fetchall()
            profile["tags"] = [dict(t) for t in tags]
            profiles.append(profile)
        return profiles


def update_profile(profile_id: str, **fields: Any) -> dict[str, Any] | None:
    existing = get_profile(profile_id)
    if not existing:
        return None

    tags = fields.pop("tags", None)

    # Only update fields that were explicitly provided
    update_cols = []
    update_vals = []
    for col in (
        "name", "fingerprint_seed", "proxy", "timezone", "locale", "platform",
        "user_agent", "screen_width", "screen_height", "gpu_vendor", "gpu_renderer",
        "hardware_concurrency", "humanize", "human_preset", "headless", "geoip",
        "clipboard_sync", "color_scheme", "notes",
    ):
        if col in fields:
            update_cols.append(f"{col} = ?")
            update_vals.append(fields[col])

    if update_cols:
        update_cols.append("updated_at = ?")
        update_vals.append(_now())
        update_vals.append(profile_id)
        with get_db() as conn:
            conn.execute(
                f"UPDATE profiles SET {', '.join(update_cols)} WHERE id = ?",
                update_vals,
            )
            conn.commit()

    if tags is not None:
        with get_db() as conn:
            conn.execute("DELETE FROM profile_tags WHERE profile_id = ?", (profile_id,))
            for t in tags:
                conn.execute(
                    "INSERT INTO profile_tags (profile_id, tag, color) VALUES (?, ?, ?)",
                    (profile_id, t["tag"], t.get("color")),
                )
            conn.commit()

    return get_profile(profile_id)


def delete_profile(profile_id: str) -> bool:
    with get_db() as conn:
        cursor = conn.execute("DELETE FROM profiles WHERE id = ?", (profile_id,))
        conn.commit()
        return cursor.rowcount > 0


# ---------------------------------------------------------------------------
# Tag management (independent of individual profiles)
# ---------------------------------------------------------------------------


def list_all_tags() -> list[dict[str, Any]]:
    """Return all unique tags with their color and profile count."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT tag, color, COUNT(*) AS profile_count "
            "FROM profile_tags GROUP BY tag ORDER BY tag",
        ).fetchall()
        return [dict(r) for r in rows]


def rename_tag(old_name: str, new_name: str) -> int:
    """Rename a tag across all profiles. Returns number of rows updated."""
    with get_db() as conn:
        cursor = conn.execute(
            "UPDATE profile_tags SET tag = ? WHERE tag = ?",
            (new_name, old_name),
        )
        conn.commit()
        return cursor.rowcount


def update_tag_color(tag_name: str, color: str | None) -> int:
    """Update a tag's color across all profiles. Returns number of rows updated."""
    with get_db() as conn:
        cursor = conn.execute(
            "UPDATE profile_tags SET color = ? WHERE tag = ?",
            (color, tag_name),
        )
        conn.commit()
        return cursor.rowcount


def delete_tag(tag_name: str) -> int:
    """Remove a tag from all profiles. Returns number of rows deleted."""
    with get_db() as conn:
        cursor = conn.execute(
            "DELETE FROM profile_tags WHERE tag = ?",
            (tag_name,),
        )
        conn.commit()
        return cursor.rowcount


# ---------------------------------------------------------------------------
# Proxy pool management
# ---------------------------------------------------------------------------


def create_proxy(name: str, url: str, **fields: Any) -> dict[str, Any]:
    proxy_id = str(uuid.uuid4())
    now = _now()
    with get_db() as conn:
        conn.execute(
            """INSERT INTO proxies (id, name, url, type, status, notes, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                proxy_id, name, url,
                fields.get("type", "http"),
                fields.get("status", "active"),
                fields.get("notes"),
                now, now,
            ),
        )
        conn.commit()
    return get_proxy(proxy_id)  # type: ignore[return-value]


def get_proxy(proxy_id: str) -> dict[str, Any] | None:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM proxies WHERE id = ?", (proxy_id,)).fetchone()
        if not row:
            return None
        proxy = dict(row)
        # Count profiles using this proxy URL
        count = conn.execute(
            "SELECT COUNT(*) FROM profiles WHERE proxy = ?", (proxy["url"],)
        ).fetchone()[0]
        proxy["profile_count"] = count
        return proxy


def list_proxies() -> list[dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM proxies ORDER BY created_at DESC").fetchall()
        proxies = []
        for row in rows:
            proxy = dict(row)
            count = conn.execute(
                "SELECT COUNT(*) FROM profiles WHERE proxy = ?", (proxy["url"],)
            ).fetchone()[0]
            proxy["profile_count"] = count
            proxies.append(proxy)
        return proxies


def update_proxy(proxy_id: str, **fields: Any) -> dict[str, Any] | None:
    existing = get_proxy(proxy_id)
    if not existing:
        return None
    update_cols = []
    update_vals = []
    for col in ("name", "url", "type", "status", "notes"):
        if col in fields:
            update_cols.append(f"{col} = ?")
            update_vals.append(fields[col])
    if update_cols:
        update_cols.append("updated_at = ?")
        update_vals.append(_now())
        update_vals.append(proxy_id)
        with get_db() as conn:
            conn.execute(
                f"UPDATE proxies SET {', '.join(update_cols)} WHERE id = ?",
                update_vals,
            )
            conn.commit()
    return get_proxy(proxy_id)


def delete_proxy(proxy_id: str) -> bool:
    with get_db() as conn:
        cursor = conn.execute("DELETE FROM proxies WHERE id = ?", (proxy_id,))
        conn.commit()
        return cursor.rowcount > 0


def count_proxies() -> int:
    with get_db() as conn:
        return conn.execute("SELECT COUNT(*) FROM proxies").fetchone()[0]


def count_tags() -> int:
    with get_db() as conn:
        return conn.execute("SELECT COUNT(DISTINCT tag) FROM profile_tags").fetchone()[0]


def kv_get(key: str) -> str | None:
    """Get a value from the key-value store."""
    with get_db() as conn:
        row = conn.execute("SELECT value FROM kv_store WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else None


def kv_set(key: str, value: str) -> None:
    """Set a value in the key-value store."""
    with get_db() as conn:
        conn.execute(
            "INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            (key, value, _now()),
        )
        conn.commit()


def kv_get_with_ts(key: str) -> tuple[str | None, str | None]:
    """Get value and updated_at from the key-value store."""
    with get_db() as conn:
        row = conn.execute("SELECT value, updated_at FROM kv_store WHERE key = ?", (key,)).fetchone()
        return (row["value"], row["updated_at"]) if row else (None, None)


def calculate_disk_usage_mb() -> float:
    """Calculate disk usage of DATA_DIR and save to DB."""
    import subprocess

    mb = 0.0
    try:
        result = subprocess.run(
            ["du", "-sm", str(DATA_DIR)],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0:
            mb = float(result.stdout.split()[0])
    except Exception:
        # Fallback: Python walk
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
    """Get last saved disk usage from DB. Returns (mb, updated_at) or (None, None)."""
    val, ts = kv_get_with_ts("disk_usage_mb")
    return (float(val), ts) if val else (None, None)


def export_all() -> dict[str, Any]:
    """Export all profiles, tags, and proxies as a dict."""
    profiles = list_profiles()
    proxies = list_proxies()
    return {"profiles": profiles, "proxies": proxies}


def import_profiles(data: list[dict[str, Any]]) -> int:
    """Import profiles from exported data. Returns count of imported profiles."""
    count = 0
    for p in data:
        pid = p.get("id", str(uuid.uuid4()))
        # Skip if already exists
        if get_profile(pid):
            continue
        tags = p.pop("tags", []) or []
        p.pop("status", None)
        p.pop("vnc_ws_port", None)
        p.pop("cdp_url", None)
        p.pop("profile_count", None)
        now = _now()
        with get_db() as conn:
            conn.execute(
                """INSERT INTO profiles (
                    id, name, fingerprint_seed, proxy, timezone, locale, platform,
                    user_agent, screen_width, screen_height, gpu_vendor, gpu_renderer,
                    hardware_concurrency, humanize, human_preset, headless, geoip,
                    clipboard_sync, color_scheme, notes, user_data_dir, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    pid, p.get("name", "Imported"),
                    p.get("fingerprint_seed", random.randint(10000, 99999)),
                    p.get("proxy"), p.get("timezone"), p.get("locale"),
                    p.get("platform", "windows"), p.get("user_agent"),
                    p.get("screen_width", 1920), p.get("screen_height", 1080),
                    p.get("gpu_vendor"), p.get("gpu_renderer"),
                    p.get("hardware_concurrency"),
                    p.get("humanize", False), p.get("human_preset", "default"),
                    p.get("headless", False), p.get("geoip", False),
                    p.get("clipboard_sync", True), p.get("color_scheme"),
                    p.get("notes"),
                    p.get("user_data_dir", str(DATA_DIR / "profiles" / pid)),
                    p.get("created_at", now), p.get("updated_at", now),
                ),
            )
            for t in tags:
                conn.execute(
                    "INSERT OR IGNORE INTO profile_tags (profile_id, tag, color) VALUES (?, ?, ?)",
                    (pid, t.get("tag", t) if isinstance(t, dict) else t, t.get("color") if isinstance(t, dict) else None),
                )
            conn.commit()
        count += 1
    return count


def import_proxies(data: list[dict[str, Any]]) -> int:
    """Import proxies from exported data. Returns count of imported proxies."""
    count = 0
    for p in data:
        pid = p.get("id", str(uuid.uuid4()))
        if get_proxy(pid):
            continue
        p.pop("profile_count", None)
        now = _now()
        with get_db() as conn:
            conn.execute(
                """INSERT INTO proxies (id, name, url, type, status, notes, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    pid, p.get("name", "Imported"), p.get("url", ""),
                    p.get("type", "http"), p.get("status", "active"),
                    p.get("notes"),
                    p.get("created_at", now), p.get("updated_at", now),
                ),
            )
            conn.commit()
        count += 1
    return count


def cleanup_stopped_profiles(running_ids: set[str]) -> tuple[int, list[str]]:
    """Delete all profiles NOT in running_ids. Returns (count, list of user_data_dirs to remove)."""
    with get_db() as conn:
        rows = conn.execute("SELECT id, user_data_dir FROM profiles").fetchall()
        to_delete = [(r["id"], r["user_data_dir"]) for r in rows if r["id"] not in running_ids]
        for pid, _ in to_delete:
            conn.execute("DELETE FROM profiles WHERE id = ?", (pid,))
        conn.commit()
    return len(to_delete), [d for _, d in to_delete]
