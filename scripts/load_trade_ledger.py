"""
Generate + load Altavest Capital Trade Ledger into the shared demo SQL Server.

Mirrors the Clarity pattern: creates a fresh `altavest_demo` database on the
existing EC2 SQL Server, defines a SQL-Server-flavoured trade ledger schema
(accounts / securities / orders / executions / positions / cash_movements /
pnl_daily), generates synthetic data, and bulk-loads via pymssql.

A Fivetran SQL Server connector then mirrors `altavest_demo` into the lake.

Env (read from this repo's .env, falls back to the shared Healthcare demo .env):

    SQLSERVER_HOST       (default: ec2-52-89-75-245.us-west-2.compute.amazonaws.com)
    SQLSERVER_PORT       (default: 1433)
    SQLSERVER_USERNAME   (default: sa)
    SQLSERVER_PASSWORD   (required)
    ALTAVEST_DATABASE    (default: altavest_demo)
    ALTAVEST_SCHEMA      (default: trade_ledger)
"""

import os
import sys
import random
import logging
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path

import pymssql
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parent.parent
LOG_DIR = REPO_ROOT / "logs"
LOG_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.FileHandler(LOG_DIR / "load_trade_ledger.log"),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("altavest")

# Load .env: prefer this repo's, then fall back to the shared Healthcare demo
# (which is where the SQL Server password lives by default).
load_dotenv(REPO_ROOT / ".env")
SHARED_ENV = Path.home() / "Documents" / "GitHub" / "Healthcare-Epic-MDLS-DuckDB" / ".env"
if SHARED_ENV.exists():
    load_dotenv(SHARED_ENV, override=False)

HOST = os.getenv("SQLSERVER_HOST", "ec2-52-89-75-245.us-west-2.compute.amazonaws.com")
PORT = int(os.getenv("SQLSERVER_PORT", "1433"))
USER = os.getenv("SQLSERVER_USERNAME", "sa")
PWD = os.getenv("SQLSERVER_PASSWORD")
DB = os.getenv("ALTAVEST_DATABASE", "altavest_demo")
SCHEMA = os.getenv("ALTAVEST_SCHEMA", "trade_ledger")

if not PWD:
    log.error("SQLSERVER_PASSWORD not set in .env (or the shared Healthcare demo .env).")
    sys.exit(1)

# ─── Schema ────────────────────────────────────────────────────────────────────

TABLE_DEFS = {
    "ACCOUNTS": {
        "columns": [
            ("ACCOUNT_ID", "INT PRIMARY KEY"),
            ("ACCOUNT_NAME", "VARCHAR(120)"),
            ("ACCOUNT_TYPE", "VARCHAR(40)"),
            ("STRATEGY", "VARCHAR(80)"),
            ("MANAGER", "VARCHAR(80)"),
            ("BASE_CCY", "CHAR(3)"),
            ("OPENED_ON", "DATE"),
            ("STATUS", "VARCHAR(20)"),
            ("AUM_USD", "DECIMAL(18,2)"),
            ("UPDATED_AT", "DATETIME"),
        ],
    },
    "SECURITIES": {
        "columns": [
            ("SECURITY_ID", "INT PRIMARY KEY"),
            ("TICKER", "VARCHAR(12)"),
            ("ISIN", "VARCHAR(12)"),
            ("CUSIP", "VARCHAR(9)"),
            ("NAME", "VARCHAR(200)"),
            ("ASSET_CLASS", "VARCHAR(30)"),
            ("SECTOR", "VARCHAR(40)"),
            ("COUNTRY", "CHAR(2)"),
            ("CCY", "CHAR(3)"),
            ("LAST_PRICE", "DECIMAL(18,4)"),
            ("UPDATED_AT", "DATETIME"),
        ],
        "indexes": ["TICKER"],
    },
    "ORDERS": {
        "columns": [
            ("ORDER_ID", "BIGINT PRIMARY KEY"),
            ("ACCOUNT_ID", "INT"),
            ("SECURITY_ID", "INT"),
            ("SIDE", "VARCHAR(4)"),
            ("ORDER_TYPE", "VARCHAR(12)"),
            ("LIMIT_PRICE", "DECIMAL(18,4)"),
            ("QUANTITY", "DECIMAL(18,4)"),
            ("STATUS", "VARCHAR(20)"),
            ("PLACED_AT", "DATETIME"),
            ("UPDATED_AT", "DATETIME"),
            ("TIF", "VARCHAR(6)"),
            ("VENUE", "VARCHAR(20)"),
            ("TRADER", "VARCHAR(40)"),
        ],
        "indexes": ["ACCOUNT_ID", "SECURITY_ID", "PLACED_AT"],
    },
    "EXECUTIONS": {
        "columns": [
            ("EXEC_ID", "BIGINT PRIMARY KEY"),
            ("ORDER_ID", "BIGINT"),
            ("EXEC_QTY", "DECIMAL(18,4)"),
            ("EXEC_PRICE", "DECIMAL(18,4)"),
            ("EXEC_TIME", "DATETIME"),
            ("VENUE", "VARCHAR(20)"),
            ("FEE_USD", "DECIMAL(12,4)"),
            ("LIQUIDITY_FLAG", "CHAR(1)"),
        ],
        "indexes": ["ORDER_ID", "EXEC_TIME"],
    },
    "POSITIONS": {
        "columns": [
            ("POSITION_ID", "BIGINT PRIMARY KEY"),
            ("AS_OF", "DATE"),
            ("ACCOUNT_ID", "INT"),
            ("SECURITY_ID", "INT"),
            ("QUANTITY", "DECIMAL(18,4)"),
            ("AVG_COST", "DECIMAL(18,4)"),
            ("MARKET_PRICE", "DECIMAL(18,4)"),
            ("MARKET_VALUE_USD", "DECIMAL(18,2)"),
            ("UNREALIZED_PNL_USD", "DECIMAL(18,2)"),
            ("UPDATED_AT", "DATETIME"),
        ],
        "indexes": ["AS_OF", "ACCOUNT_ID"],
    },
    "CASH_MOVEMENTS": {
        "columns": [
            ("MOVEMENT_ID", "BIGINT PRIMARY KEY"),
            ("ACCOUNT_ID", "INT"),
            ("POSTED_AT", "DATETIME"),
            ("KIND", "VARCHAR(20)"),
            ("AMOUNT_USD", "DECIMAL(18,2)"),
            ("REFERENCE", "VARCHAR(60)"),
        ],
        "indexes": ["ACCOUNT_ID", "POSTED_AT"],
    },
    "PNL_DAILY": {
        "columns": [
            ("PNL_ID", "BIGINT PRIMARY KEY"),
            ("AS_OF", "DATE"),
            ("ACCOUNT_ID", "INT"),
            ("GROSS_PNL_USD", "DECIMAL(18,2)"),
            ("FEES_USD", "DECIMAL(12,2)"),
            ("SLIPPAGE_USD", "DECIMAL(12,2)"),
            ("NET_PNL_USD", "DECIMAL(18,2)"),
            ("INSERTED_AT", "DATETIME"),
        ],
        "indexes": ["AS_OF", "ACCOUNT_ID"],
    },
}

LOAD_ORDER = [
    "ACCOUNTS", "SECURITIES", "ORDERS", "EXECUTIONS",
    "POSITIONS", "CASH_MOVEMENTS", "PNL_DAILY",
]

# ─── Synthetic generators ─────────────────────────────────────────────────────

random.seed(42)

STRATEGIES = ["Long/Short Equity", "Global Macro", "Stat Arb", "Event Driven",
              "Quant Equity Market Neutral", "Credit Long/Short", "Sector Rotation"]
MANAGERS = ["A. Carrasco", "M. Singh", "R. Boucher", "J. Park", "T. Holloway",
            "V. Iyer", "L. Naumann", "P. Olawale"]
TRADERS = ["dpalmer", "tnguyen", "kgordon", "shall", "jrivera", "mcheng"]
VENUES = ["NASDAQ", "NYSE", "ARCA", "BATS", "IEX", "EDGX", "CME"]
SECTORS = ["Financials", "Technology", "Energy", "Healthcare", "Industrials",
           "Materials", "Cons Disc", "Cons Staples", "Utilities", "Real Estate",
           "Comms"]
TICKERS = [
    ("AAPL", "Apple Inc",           "Technology"),
    ("MSFT", "Microsoft Corp",      "Technology"),
    ("NVDA", "NVIDIA Corp",         "Technology"),
    ("GOOGL","Alphabet Inc Cl A",   "Comms"),
    ("META", "Meta Platforms",      "Comms"),
    ("AMZN", "Amazon.com Inc",      "Cons Disc"),
    ("TSLA", "Tesla Inc",           "Cons Disc"),
    ("JPM",  "JPMorgan Chase",      "Financials"),
    ("BAC",  "Bank of America",     "Financials"),
    ("WFC",  "Wells Fargo",         "Financials"),
    ("GS",   "Goldman Sachs",       "Financials"),
    ("MS",   "Morgan Stanley",      "Financials"),
    ("BRK.B","Berkshire Hathaway",  "Financials"),
    ("V",    "Visa Inc",            "Financials"),
    ("MA",   "Mastercard",          "Financials"),
    ("XOM",  "Exxon Mobil",         "Energy"),
    ("CVX",  "Chevron Corp",        "Energy"),
    ("COP",  "ConocoPhillips",      "Energy"),
    ("UNH",  "UnitedHealth",        "Healthcare"),
    ("JNJ",  "Johnson & Johnson",   "Healthcare"),
    ("LLY",  "Eli Lilly",           "Healthcare"),
    ("PFE",  "Pfizer Inc",          "Healthcare"),
    ("MRK",  "Merck & Co",          "Healthcare"),
    ("CAT",  "Caterpillar",         "Industrials"),
    ("DE",   "Deere & Co",          "Industrials"),
    ("BA",   "Boeing Co",           "Industrials"),
    ("HON",  "Honeywell",           "Industrials"),
    ("PG",   "Procter & Gamble",    "Cons Staples"),
    ("KO",   "Coca-Cola",           "Cons Staples"),
    ("PEP",  "PepsiCo",             "Cons Staples"),
    ("WMT",  "Walmart Inc",         "Cons Staples"),
    ("HD",   "Home Depot",          "Cons Disc"),
    ("NKE",  "Nike Inc",            "Cons Disc"),
    ("MCD",  "McDonald's Corp",     "Cons Disc"),
    ("SPY",  "SPDR S&P 500 ETF",    "ETF"),
    ("QQQ",  "Invesco QQQ Trust",   "ETF"),
    ("IWM",  "iShares Russell 2000","ETF"),
    ("TLT",  "iShares 20+ Yr Tsy",  "ETF"),
    ("HYG",  "iShares iBoxx HYG",   "ETF"),
    ("EEM",  "iShares MSCI EM",     "ETF"),
]


def gen_accounts(n=24):
    types = ["Hedge Fund", "Separately Managed", "Internal Prop", "Fund of Funds"]
    rows = []
    for i in range(1, n + 1):
        rows.append({
            "ACCOUNT_ID":   i,
            "ACCOUNT_NAME": f"Altavest {random.choice(['Alpha','Capital','Atlas','Vector','Catalyst','Crescent','Helios','Lighthouse','Meridian','Polaris','Sextant','Zenith'])} {random.choice(['I','II','III','Master','Onshore','Offshore'])}",
            "ACCOUNT_TYPE": random.choice(types),
            "STRATEGY":     random.choice(STRATEGIES),
            "MANAGER":      random.choice(MANAGERS),
            "BASE_CCY":     "USD",
            "OPENED_ON":    date(2019, 1, 1) + timedelta(days=random.randint(0, 2400)),
            "STATUS":       "ACTIVE" if random.random() > 0.05 else "WINDDOWN",
            "AUM_USD":      round(random.uniform(50_000_000, 2_500_000_000), 2),
            "UPDATED_AT":   datetime(2026, 5, 24, 7, 14, 0),
        })
    return rows


def gen_securities():
    rows = []
    for i, (tkr, name, sector) in enumerate(TICKERS, start=1):
        rows.append({
            "SECURITY_ID": i,
            "TICKER":      tkr,
            "ISIN":        f"US{random.randint(10000000, 99999999)}{random.randint(0,9)}",
            "CUSIP":       f"{random.randint(100000000, 999999999)}",
            "NAME":        name,
            "ASSET_CLASS": "ETF" if sector == "ETF" else "EQUITY",
            "SECTOR":      sector,
            "COUNTRY":     "US",
            "CCY":         "USD",
            "LAST_PRICE":  round(random.uniform(15, 950), 4),
            "UPDATED_AT":  datetime(2026, 5, 24, 7, 14, 0),
        })
    return rows


def gen_orders(accounts, securities, n=6000):
    sides = ["BUY", "SELL"]
    otypes = ["MKT", "LMT", "STP", "VWAP", "TWAP"]
    statuses_weighted = (["FILLED"] * 78 + ["PARTIAL"] * 8 + ["OPEN"] * 9 + ["CANCEL"] * 5)
    tifs = ["DAY", "GTC", "IOC", "FOK"]
    start = datetime(2026, 1, 2, 9, 30, 0)
    rows = []
    for i in range(1, n + 1):
        sec = random.choice(securities)
        side = random.choice(sides)
        otype = random.choice(otypes)
        qty = round(random.choice([100, 200, 250, 500, 750, 1000, 1500, 2500, 5000]) * random.uniform(0.5, 2.5), 2)
        px = sec["LAST_PRICE"] * random.uniform(0.96, 1.04)
        placed = start + timedelta(minutes=random.randint(0, 60 * 24 * 140))
        rows.append({
            "ORDER_ID":   1_000_000 + i,
            "ACCOUNT_ID": random.choice(accounts)["ACCOUNT_ID"],
            "SECURITY_ID": sec["SECURITY_ID"],
            "SIDE":       side,
            "ORDER_TYPE": otype,
            "LIMIT_PRICE": round(px, 4) if otype != "MKT" else None,
            "QUANTITY":   qty,
            "STATUS":     random.choice(statuses_weighted),
            "PLACED_AT":  placed,
            "UPDATED_AT": placed + timedelta(seconds=random.randint(1, 600)),
            "TIF":        random.choice(tifs),
            "VENUE":      random.choice(VENUES),
            "TRADER":     random.choice(TRADERS),
        })
    return rows


def gen_executions(orders):
    rows = []
    exec_id = 5_000_000
    for o in orders:
        if o["STATUS"] in ("OPEN", "CANCEL"):
            continue
        n_fills = 1 if o["STATUS"] == "PARTIAL" else random.choice([1, 1, 1, 2, 3])
        remaining = float(o["QUANTITY"]) if o["STATUS"] != "PARTIAL" else float(o["QUANTITY"]) * random.uniform(0.2, 0.7)
        ref_px = float(o["LIMIT_PRICE"]) if o["LIMIT_PRICE"] is not None else random.uniform(50, 400)
        for j in range(n_fills):
            exec_id += 1
            qty = remaining if j == n_fills - 1 else round(remaining * random.uniform(0.2, 0.6), 4)
            remaining = round(remaining - qty, 4)
            px = ref_px * random.uniform(0.998, 1.002)
            fee = round(qty * 0.0025, 4)
            rows.append({
                "EXEC_ID":   exec_id,
                "ORDER_ID":  o["ORDER_ID"],
                "EXEC_QTY":  round(qty, 4),
                "EXEC_PRICE": round(px, 4),
                "EXEC_TIME": o["PLACED_AT"] + timedelta(seconds=random.randint(1, 1800)),
                "VENUE":     o["VENUE"],
                "FEE_USD":   fee,
                "LIQUIDITY_FLAG": random.choice(["A", "R", "A", "R", "A"]),
            })
    return rows


def gen_positions(accounts, securities):
    rows = []
    pid = 7_000_000
    today = date(2026, 5, 24)
    for acct in accounts:
        for sec in random.sample(securities, k=random.randint(8, len(securities))):
            pid += 1
            qty = round(random.choice([1, -1, 1, 1]) * random.uniform(500, 25000), 4)
            cost = sec["LAST_PRICE"] * random.uniform(0.7, 1.1)
            mkt = sec["LAST_PRICE"]
            mv = round(qty * mkt, 2)
            upnl = round(qty * (mkt - cost), 2)
            rows.append({
                "POSITION_ID": pid,
                "AS_OF":       today,
                "ACCOUNT_ID":  acct["ACCOUNT_ID"],
                "SECURITY_ID": sec["SECURITY_ID"],
                "QUANTITY":    qty,
                "AVG_COST":    round(cost, 4),
                "MARKET_PRICE": round(mkt, 4),
                "MARKET_VALUE_USD": mv,
                "UNREALIZED_PNL_USD": upnl,
                "UPDATED_AT":  datetime(2026, 5, 24, 7, 14, 0),
            })
    return rows


def gen_cash_movements(accounts, n=2400):
    kinds_w = (["DIVIDEND"] * 20 + ["INTEREST"] * 12 + ["FEE"] * 18 +
               ["WIRE_IN"] * 8 + ["WIRE_OUT"] * 8 + ["FX_SETTLE"] * 16 +
               ["MARGIN_CALL"] * 4 + ["TRADE_SETTLE"] * 14)
    start = datetime(2026, 1, 2)
    rows = []
    for i in range(1, n + 1):
        kind = random.choice(kinds_w)
        amt = round(random.uniform(50, 4_500_000), 2)
        if kind in ("WIRE_OUT", "FEE", "MARGIN_CALL"):
            amt = -amt
        rows.append({
            "MOVEMENT_ID": 8_000_000 + i,
            "ACCOUNT_ID":  random.choice(accounts)["ACCOUNT_ID"],
            "POSTED_AT":   start + timedelta(minutes=random.randint(0, 60 * 24 * 140)),
            "KIND":        kind,
            "AMOUNT_USD":  amt,
            "REFERENCE":   f"REF-{random.randint(100000, 999999)}",
        })
    return rows


def gen_pnl_daily(accounts):
    rows = []
    pid = 9_000_000
    start = date(2026, 1, 2)
    for d in range(140):
        as_of = start + timedelta(days=d)
        if as_of.weekday() >= 5:
            continue
        for a in accounts:
            pid += 1
            gross = round(random.gauss(8500, 42000), 2)
            fees = round(abs(random.gauss(450, 180)), 2)
            slip = round(abs(random.gauss(180, 90)), 2)
            net = round(gross - fees - slip, 2)
            rows.append({
                "PNL_ID":        pid,
                "AS_OF":         as_of,
                "ACCOUNT_ID":    a["ACCOUNT_ID"],
                "GROSS_PNL_USD": gross,
                "FEES_USD":      fees,
                "SLIPPAGE_USD":  slip,
                "NET_PNL_USD":   net,
                "INSERTED_AT":   datetime(2026, 5, 24, 7, 18, 0),
            })
    return rows


# ─── DB helpers (mirror Clarity load_to_sqlserver.py) ──────────────────────────

def autocommit_conn(database):
    return pymssql.connect(
        server=HOST, port=PORT, user=USER, password=PWD,
        database=database, autocommit=True, timeout=30, login_timeout=15,
    )


def conn(database):
    return pymssql.connect(
        server=HOST, port=PORT, user=USER, password=PWD,
        database=database, timeout=60, login_timeout=15,
    )


def ensure_database():
    with autocommit_conn("master") as c:
        cur = c.cursor()
        cur.execute(
            f"IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = '{DB}') "
            f"CREATE DATABASE [{DB}]"
        )
        cur.close()
    log.info(f"Database {DB} ready")


def ensure_schema(c):
    cur = c.cursor()
    cur.execute(
        f"IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = '{SCHEMA}') "
        f"EXEC('CREATE SCHEMA {SCHEMA}')"
    )
    c.commit()
    cur.close()
    log.info(f"Schema {SCHEMA} ready")


def drop_table(c, tbl):
    cur = c.cursor()
    cur.execute(f"IF OBJECT_ID('{SCHEMA}.{tbl}', 'U') IS NOT NULL DROP TABLE {SCHEMA}.{tbl}")
    c.commit()
    cur.close()


def create_table(c, tbl, defn):
    cols = ", ".join(f"{col} {ty}" for col, ty in defn["columns"])
    sql = f"CREATE TABLE {SCHEMA}.{tbl} ({cols})"
    cur = c.cursor()
    cur.execute(sql)
    c.commit()
    cur.close()
    log.info(f"  created {SCHEMA}.{tbl}")


def create_indexes(c, tbl, defn):
    if "indexes" not in defn:
        return
    cur = c.cursor()
    for col in defn["indexes"]:
        idx = f"IX_{tbl}_{col}"
        cur.execute(
            f"IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = '{idx}') "
            f"CREATE INDEX {idx} ON {SCHEMA}.{tbl} ({col})"
        )
        c.commit()
    cur.close()


def bulk_insert(c, tbl, defn, rows):
    # Multi-row VALUES batching — pymssql executemany is row-at-a-time RPCs and
    # crawls against the remote EC2 SQL Server. This collapses N round trips into
    # ceil(N/CHUNK), ~50x faster. See feedback-pymssql-remote-inserts memory.
    if not rows:
        log.warning(f"  no rows for {tbl}")
        return 0
    cols = [name for name, _ in defn["columns"]]
    col_list = ", ".join(cols)
    placeholders_one = "(" + ", ".join(["%s"] * len(cols)) + ")"
    CHUNK = 200
    if CHUNK * len(cols) > 2000:  # SQL Server caps to 2100 params per call
        CHUNK = max(1, 2000 // len(cols))
    cur = c.cursor()
    total = 0
    for i in range(0, len(rows), CHUNK):
        chunk = rows[i:i + CHUNK]
        values_sql = ", ".join([placeholders_one] * len(chunk))
        sql = f"INSERT INTO {SCHEMA}.{tbl} ({col_list}) VALUES {values_sql}"
        params = tuple(v for r in chunk for v in (r.get(col) for col in cols))
        cur.execute(sql, params)
        c.commit()
        total += len(chunk)
    cur.close()
    log.info(f"  inserted {total:,} rows into {SCHEMA}.{tbl}")
    return total


def main():
    log.info("=" * 60)
    log.info("ALTAVEST TRADE LEDGER → SQL SERVER")
    log.info(f"  host:     {HOST}:{PORT}")
    log.info(f"  database: {DB}")
    log.info(f"  schema:   {SCHEMA}")
    log.info("=" * 60)

    log.info("generating synthetic ledger...")
    accounts = gen_accounts()
    securities = gen_securities()
    orders = gen_orders(accounts, securities)
    executions = gen_executions(orders)
    positions = gen_positions(accounts, securities)
    cash = gen_cash_movements(accounts)
    pnl = gen_pnl_daily(accounts)

    data = {
        "ACCOUNTS": accounts,
        "SECURITIES": securities,
        "ORDERS": orders,
        "EXECUTIONS": executions,
        "POSITIONS": positions,
        "CASH_MOVEMENTS": cash,
        "PNL_DAILY": pnl,
    }
    for tbl in LOAD_ORDER:
        log.info(f"  {tbl}: {len(data[tbl]):,} rows generated")

    ensure_database()
    c = conn(DB)
    try:
        ensure_schema(c)
        for tbl in LOAD_ORDER:
            log.info(f"loading {tbl}...")
            drop_table(c, tbl)
            create_table(c, tbl, TABLE_DEFS[tbl])
            bulk_insert(c, tbl, TABLE_DEFS[tbl], data[tbl])
            create_indexes(c, tbl, TABLE_DEFS[tbl])
        log.info("=" * 60)
        log.info("LOAD COMPLETE")
        log.info("=" * 60)
    finally:
        c.close()


if __name__ == "__main__":
    main()
