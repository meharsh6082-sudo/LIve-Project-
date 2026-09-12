"""Copy the current local SQLite snapshot into the configured MySQL database.

Run from backend after setting Railway/MySQL variables:
    python migrate_sqlite_to_mysql.py
"""
import sqlite3
from pathlib import Path

from database import DB_PATH, init_db, upsert_mandi_rows, upsert_stock_rows, USE_MYSQL

if not USE_MYSQL:
    raise SystemExit("Set DB_BACKEND=mysql and MYSQLHOST/MYSQLUSER/MYSQLPASSWORD/MYSQLDATABASE first.")

source = sqlite3.connect(DB_PATH)
source.row_factory = sqlite3.Row
try:
    mandi_rows = [dict(row) for row in source.execute("SELECT state, district, market, commodity, variety, min_price, max_price, modal_price, arrival_date FROM mandi_prices").fetchall()]
    stock_rows = [dict(row) for row in source.execute("SELECT symbol, name, price, day_open, day_high, day_low, change_pct, volume, currency FROM stock_prices").fetchall()]
finally:
    source.close()

init_db()
if mandi_rows:
    upsert_mandi_rows(mandi_rows)
if stock_rows:
    upsert_stock_rows(stock_rows)
print(f"Migrated {len(stock_rows)} stocks and {len(mandi_rows)} mandi rows to MySQL.")
