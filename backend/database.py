"""Small database layer with SQLite fallback and Railway MySQL support."""
import json
import os
import sqlite3
import time
from datetime import datetime
from pathlib import Path
from contextlib import contextmanager
from urllib.parse import urlparse

DB_PATH = Path(__file__).parent / "market.db"
BACKUP_DIR = Path(__file__).parent / "backups"
USE_MYSQL = os.getenv("DB_BACKEND", "mysql" if os.getenv("MYSQLHOST") or os.getenv("MYSQL_URL") else "sqlite").lower() == "mysql"


def _mysql_config():
    url = os.getenv("MYSQL_URL") or os.getenv("DATABASE_URL")
    if url:
        parsed = urlparse(url)
        return {"host": parsed.hostname, "port": parsed.port or 3306, "user": parsed.username, "password": parsed.password, "database": parsed.path.lstrip("/")}
    return {"host": os.getenv("MYSQLHOST", "127.0.0.1"), "port": int(os.getenv("MYSQLPORT", "3306")), "user": os.getenv("MYSQLUSER", "root"), "password": os.getenv("MYSQLPASSWORD", ""), "database": os.getenv("MYSQLDATABASE", "market")}


class DatabaseConnection:
    def __init__(self):
        if USE_MYSQL:
            import mysql.connector
            self.raw = mysql.connector.connect(**_mysql_config())
            self.mysql = True
        else:
            self.raw = sqlite3.connect(DB_PATH)
            self.raw.row_factory = sqlite3.Row
            self.mysql = False

    def execute(self, query, params=()):
        if self.mysql:
            cursor = self.raw.cursor(dictionary=True)
            cursor.execute(query.replace("?", "%s"), params)
            return cursor
        return self.raw.execute(query, params)

    def commit(self):
        self.raw.commit()

    def close(self):
        self.raw.close()


@contextmanager
def get_conn():
    conn = DatabaseConnection()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with get_conn() as conn:
        if conn.mysql:
            conn.execute("""CREATE TABLE IF NOT EXISTS mandi_prices (
                id BIGINT AUTO_INCREMENT PRIMARY KEY, state VARCHAR(160), district VARCHAR(160),
                market VARCHAR(160), commodity VARCHAR(160), variety VARCHAR(160), min_price DOUBLE,
                max_price DOUBLE, modal_price DOUBLE, arrival_date VARCHAR(40), fetched_at BIGINT,
                prev_modal_price DOUBLE, INDEX idx_mandi_commodity (commodity, market, fetched_at))""")
            conn.execute("""CREATE TABLE IF NOT EXISTS stock_prices (
                symbol VARCHAR(32) PRIMARY KEY, name VARCHAR(255), price DOUBLE, prev_price DOUBLE,
                day_open DOUBLE, day_high DOUBLE, day_low DOUBLE, change_pct DOUBLE, volume DOUBLE,
                currency VARCHAR(12), fetched_at BIGINT)""")
        else:
            conn.execute("""CREATE TABLE IF NOT EXISTS mandi_prices (
                id INTEGER PRIMARY KEY AUTOINCREMENT, state TEXT, district TEXT, market TEXT,
                commodity TEXT, variety TEXT, min_price REAL, max_price REAL, modal_price REAL,
                arrival_date TEXT, fetched_at INTEGER, prev_modal_price REAL)""")
            conn.execute("""CREATE TABLE IF NOT EXISTS stock_prices (
                symbol TEXT PRIMARY KEY, name TEXT, price REAL, prev_price REAL, day_open REAL,
                day_high REAL, day_low REAL, change_pct REAL, volume REAL, currency TEXT, fetched_at INTEGER)""")
            stock_columns = {row[1] for row in conn.execute("PRAGMA table_info(stock_prices)")}
            if "volume" not in stock_columns:
                conn.execute("ALTER TABLE stock_prices ADD COLUMN volume REAL")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_mandi_commodity ON mandi_prices(commodity, market, fetched_at)")


def upsert_mandi_rows(rows: list[dict]):
    now = int(time.time())
    with get_conn() as conn:
        for row in rows:
            existing = conn.execute("SELECT modal_price FROM mandi_prices WHERE market=? AND commodity=? AND variety=?", (row["market"], row["commodity"], row["variety"])).fetchone()
            previous = existing["modal_price"] if existing else None
            values = (row["state"], row["district"], row["min_price"], row["max_price"], row["modal_price"], row["arrival_date"], now, previous, row["market"], row["commodity"], row["variety"])
            if existing:
                conn.execute("""UPDATE mandi_prices SET state=?, district=?, min_price=?, max_price=?, modal_price=?, arrival_date=?, fetched_at=?, prev_modal_price=? WHERE market=? AND commodity=? AND variety=?""", values)
            else:
                conn.execute("""INSERT INTO mandi_prices (state, district, market, commodity, variety, min_price, max_price, modal_price, arrival_date, fetched_at, prev_modal_price) VALUES (?,?,?,?,?,?,?,?,?,?,?)""", (row["state"], row["district"], row["market"], row["commodity"], row["variety"], row["min_price"], row["max_price"], row["modal_price"], row["arrival_date"], now, None))


def upsert_stock_rows(rows: list[dict]):
    now = int(time.time())
    with get_conn() as conn:
        for row in rows:
            existing = conn.execute("SELECT price FROM stock_prices WHERE symbol=?", (row["symbol"],)).fetchone()
            previous = existing["price"] if existing else row["price"]
            values = (row["symbol"], row["name"], row["price"], previous, row["day_open"], row["day_high"], row["day_low"], row["change_pct"], row.get("volume"), row["currency"], now)
            if conn.mysql:
                conn.execute("""INSERT INTO stock_prices (symbol, name, price, prev_price, day_open, day_high, day_low, change_pct, volume, currency, fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name), price=VALUES(price), prev_price=VALUES(prev_price), day_open=VALUES(day_open), day_high=VALUES(day_high), day_low=VALUES(day_low), change_pct=VALUES(change_pct), volume=VALUES(volume), currency=VALUES(currency), fetched_at=VALUES(fetched_at)""", values)
            else:
                conn.execute("""INSERT INTO stock_prices (symbol, name, price, prev_price, day_open, day_high, day_low, change_pct, volume, currency, fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(symbol) DO UPDATE SET name=excluded.name, price=excluded.price, prev_price=excluded.prev_price, day_open=excluded.day_open, day_high=excluded.day_high, day_low=excluded.day_low, change_pct=excluded.change_pct, volume=excluded.volume, currency=excluded.currency, fetched_at=excluded.fetched_at""", values)


def get_mandi(state: str | None = None, commodity: str | None = None, limit: int = 200):
    query, params = "SELECT * FROM mandi_prices WHERE 1=1", []
    if state:
        query += " AND state LIKE ?"; params.append(f"%{state}%")
    if commodity:
        query += " AND commodity LIKE ?"; params.append(f"%{commodity}%")
    query += " ORDER BY fetched_at DESC LIMIT ?"; params.append(limit)
    with get_conn() as conn:
        return [dict(row) for row in conn.execute(query, params).fetchall()]


def get_mandi_meta():
    with get_conn() as conn:
        states = [row["state"] for row in conn.execute("SELECT DISTINCT state FROM mandi_prices ORDER BY state")]
        commodities = [row["commodity"] for row in conn.execute("SELECT DISTINCT commodity FROM mandi_prices ORDER BY commodity")]
        return {"states": states, "commodities": commodities}


def get_stocks():
    with get_conn() as conn:
        return [dict(row) for row in conn.execute("SELECT * FROM stock_prices ORDER BY symbol").fetchall()]


def get_database_info():
    with get_conn() as conn:
        if conn.mysql:
            rows = conn.execute("SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE()").fetchall()
            tables = [row["table_name"] for row in rows]
            return {"path": f"MySQL database: {_mysql_config()['database']}", "size_mb": 0, "tables": len(tables), "table_names": tables}
        tables = [row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall()]
    return {"path": str(DB_PATH), "size_mb": round(DB_PATH.stat().st_size / 1024 / 1024, 2) if DB_PATH.exists() else 0, "tables": len(tables), "table_names": tables}


def backup_database():
    BACKUP_DIR.mkdir(exist_ok=True)
    filename = f"market-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    with get_conn() as conn:
        snapshot = {table: [dict(row) for row in conn.execute(f"SELECT * FROM {table}").fetchall()] for table in ("mandi_prices", "stock_prices")}
    (BACKUP_DIR / filename).write_text(json.dumps(snapshot, indent=2, default=str), encoding="utf-8")
    return filename
