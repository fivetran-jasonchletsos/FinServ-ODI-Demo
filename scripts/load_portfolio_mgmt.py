"""
Generate + load Altavest Capital Portfolio Management System into Oracle RDS.

Sibling of load_trade_ledger.py (SQL Server / trade-ledger book).  This loader
mirrors the *book-of-record / fund-accounting* view: portfolios, instruments,
benchmarks, holdings snapshots, daily NAV, performance returns, mandates, and
valuation audits.  Targets an Oracle RDS instance (schema PORTFOLIO_MGMT).

A Fivetran Oracle connector then mirrors PORTFOLIO_MGMT into the lake.

Driver: python-oracledb in thin mode (no Instant Client required).

Env (read from this repo's .env, falls back to the shared Healthcare demo .env):

    ORACLE_HOST          (required — e.g. `terraform output oracle_endpoint`)
    ORACLE_PORT          (default: 1521)
    ORACLE_SERVICE       (default: ORCL)
    ORACLE_USERNAME      (default: admin)
    ORACLE_PASSWORD      (required)
    ALTAVEST_PMS_SCHEMA  (default: PORTFOLIO_MGMT)
"""

import os
import sys
import random
import logging
import secrets
import string
from datetime import date, datetime, timedelta
from pathlib import Path

import oracledb
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parent.parent
LOG_DIR = REPO_ROOT / "logs"
LOG_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.FileHandler(LOG_DIR / "load_portfolio_mgmt.log"),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("altavest-pms")

# Load .env: prefer this repo's, then fall back to the shared Healthcare demo
# (which is where the shared credentials live by default).
load_dotenv(REPO_ROOT / ".env")
SHARED_ENV = Path.home() / "Documents" / "GitHub" / "Healthcare-Epic-MDLS-DuckDB" / ".env"
if SHARED_ENV.exists():
    load_dotenv(SHARED_ENV, override=False)

HOST = os.getenv("ORACLE_HOST", "").strip()
PORT = int(os.getenv("ORACLE_PORT", "1521"))
SERVICE = os.getenv("ORACLE_SERVICE", "ORCL")
USER = os.getenv("ORACLE_USERNAME", "admin")
PWD = os.getenv("ORACLE_PASSWORD")
SCHEMA = os.getenv("ALTAVEST_PMS_SCHEMA", "PORTFOLIO_MGMT").upper()

if not HOST:
    log.error(
        "ORACLE_HOST is not set. Set ORACLE_HOST "
        "(e.g. `terraform output oracle_endpoint`) and re-run."
    )
    sys.exit(1)

if not PWD:
    log.error("ORACLE_PASSWORD not set in .env (or the shared Healthcare demo .env).")
    sys.exit(1)

DSN = f"{HOST}:{PORT}/{SERVICE}"

# ─── Schema (Oracle types) ─────────────────────────────────────────────────────

TABLE_DEFS = {
    "PORTFOLIOS": {
        "columns": [
            ("PORTFOLIO_ID",    "NUMBER(10) PRIMARY KEY"),
            ("PORTFOLIO_CODE",  "VARCHAR2(30)"),
            ("FUND_NAME",       "VARCHAR2(160)"),
            ("STRATEGY",        "VARCHAR2(60)"),
            ("MANAGER",         "VARCHAR2(80)"),
            ("INCEPTION_DATE",  "DATE"),
            ("BENCHMARK",       "VARCHAR2(40)"),
            ("BASE_CCY",        "CHAR(3)"),
            ("STATUS",          "VARCHAR2(20)"),
            ("AUM_USD",         "NUMBER(18,2)"),
            ("UPDATED_AT",      "TIMESTAMP"),
        ],
    },
    "INSTRUMENTS": {
        "columns": [
            ("INSTRUMENT_ID",   "NUMBER(10) PRIMARY KEY"),
            ("TICKER",          "VARCHAR2(12)"),
            ("CUSIP",           "VARCHAR2(9)"),
            ("ISIN",            "VARCHAR2(12)"),
            ("NAME",            "VARCHAR2(200)"),
            ("ASSET_CLASS",     "VARCHAR2(20)"),
            ("SECTOR",          "VARCHAR2(40)"),
            ("CCY",             "CHAR(3)"),
            ("COUNTRY",         "CHAR(2)"),
            ("LISTED_EXCHANGE", "VARCHAR2(20)"),
        ],
        "indexes": ["TICKER"],
    },
    "BENCHMARKS": {
        "columns": [
            ("BENCHMARK_ID",   "NUMBER(10) PRIMARY KEY"),
            ("BENCHMARK_CODE", "VARCHAR2(20)"),
            ("NAME",           "VARCHAR2(120)"),
            ("CCY",            "CHAR(3)"),
            ("PROVIDER",       "VARCHAR2(40)"),
        ],
    },
    "HOLDINGS": {
        "columns": [
            ("HOLDING_ID",       "NUMBER(12) PRIMARY KEY"),
            ("AS_OF",            "DATE"),
            ("PORTFOLIO_ID",     "NUMBER(10)"),
            ("INSTRUMENT_ID",    "NUMBER(10)"),
            ("QUANTITY",         "NUMBER(18,4)"),
            ("AVG_COST",         "NUMBER(18,4)"),
            ("MARKET_PRICE",     "NUMBER(18,4)"),
            ("MARKET_VALUE_USD", "NUMBER(18,2)"),
            ("WEIGHT_PCT",       "NUMBER(8,4)"),
            ("UPDATED_AT",       "TIMESTAMP"),
        ],
        "indexes": ["AS_OF", "PORTFOLIO_ID", "INSTRUMENT_ID"],
    },
    "NAV_DAILY": {
        "columns": [
            ("NAV_ID",             "NUMBER(12) PRIMARY KEY"),
            ("AS_OF",              "DATE"),
            ("PORTFOLIO_ID",       "NUMBER(10)"),
            ("NAV_PER_SHARE",      "NUMBER(18,6)"),
            ("TOTAL_NAV_USD",      "NUMBER(18,2)"),
            ("SHARES_OUTSTANDING", "NUMBER(18,4)"),
            ("GAV_USD",            "NUMBER(18,2)"),
            ("EXPENSES_USD",       "NUMBER(14,2)"),
            ("UPDATED_AT",         "TIMESTAMP"),
        ],
        "indexes": ["AS_OF", "PORTFOLIO_ID"],
    },
    "PERFORMANCE_RETURNS": {
        "columns": [
            ("RETURN_ID",        "NUMBER(12) PRIMARY KEY"),
            ("AS_OF",            "DATE"),
            ("PORTFOLIO_ID",     "NUMBER(10)"),
            ("BENCHMARK_ID",     "NUMBER(10)"),
            ("PORTFOLIO_RETURN", "NUMBER(10,6)"),
            ("BENCHMARK_RETURN", "NUMBER(10,6)"),
            ("ACTIVE_RETURN",    "NUMBER(10,6)"),
            ("RETURN_TYPE",      "VARCHAR2(10)"),
        ],
        "indexes": ["AS_OF", "PORTFOLIO_ID"],
    },
    "MANDATES": {
        "columns": [
            ("MANDATE_ID",       "NUMBER(10) PRIMARY KEY"),
            ("PORTFOLIO_ID",     "NUMBER(10)"),
            ("MANDATE_TYPE",     "VARCHAR2(40)"),
            ("CONSTRAINT_VALUE", "VARCHAR2(120)"),
            ("EFFECTIVE_DATE",   "DATE"),
            ("EXPIRY_DATE",      "DATE"),
            ("STATUS",           "VARCHAR2(20)"),
        ],
        "indexes": ["PORTFOLIO_ID"],
    },
    "VALUATION_AUDIT": {
        "columns": [
            ("AUDIT_ID",       "NUMBER(12) PRIMARY KEY"),
            ("AS_OF",          "DATE"),
            ("PORTFOLIO_ID",   "NUMBER(10)"),
            ("CHECK_NAME",     "VARCHAR2(80)"),
            ("RESULT",         "VARCHAR2(20)"),
            ("VARIANCE_BPS",   "NUMBER(10,2)"),
            ("CHECKED_AT",     "TIMESTAMP"),
        ],
        "indexes": ["AS_OF", "PORTFOLIO_ID"],
    },
}

LOAD_ORDER = [
    "PORTFOLIOS", "INSTRUMENTS", "BENCHMARKS", "HOLDINGS",
    "NAV_DAILY", "PERFORMANCE_RETURNS", "MANDATES", "VALUATION_AUDIT",
]

# ─── Synthetic generators ─────────────────────────────────────────────────────

random.seed(42)

STRATEGIES = [
    "Long/Short Equity", "Global Macro", "Stat Arb", "Event Driven",
    "Quant Equity Market Neutral", "Credit Long/Short", "Sector Rotation",
    "Multi-Asset", "Risk Parity", "Convertible Arb",
]
MANAGERS = [
    "A. Carrasco", "M. Singh", "R. Boucher", "J. Park", "T. Holloway",
    "V. Iyer", "L. Naumann", "P. Olawale", "S. Marchetti", "K. Yamada",
]
FUND_LINES = ["Alpha", "Capital", "Atlas", "Vector", "Catalyst", "Crescent",
              "Helios", "Lighthouse", "Meridian", "Polaris", "Sextant", "Zenith"]
FUND_TIERS = ["I", "II", "III", "Master", "Onshore", "Offshore", "Fund"]
COUNTRIES = ["US", "GB", "DE", "FR", "JP", "CH", "CA", "AU", "HK", "SG"]
EXCHANGES = ["NASDAQ", "NYSE", "ARCA", "LSE", "XETRA", "TSE", "HKEX", "SGX"]
SECTORS = ["Financials", "Technology", "Energy", "Healthcare", "Industrials",
           "Materials", "Cons Disc", "Cons Staples", "Utilities", "Real Estate",
           "Comms", "Government", "Corporate Credit"]
ASSET_CLASSES_W = (["EQUITY"] * 55 + ["ETF"] * 15 + ["BOND"] * 18 +
                   ["FUTURE"] * 6 + ["FX"] * 3 + ["CASH"] * 3)
RETURN_TYPES_W = (["DAILY"] * 70 + ["MTD"] * 12 + ["QTD"] * 8 + ["YTD"] * 10)

BENCHMARK_SEED = [
    ("SPX",  "S&P 500 Index",              "USD", "S&P Dow Jones"),
    ("NDX",  "Nasdaq 100 Index",           "USD", "Nasdaq"),
    ("RUT",  "Russell 2000 Index",         "USD", "FTSE Russell"),
    ("MXEF", "MSCI Emerging Markets",      "USD", "MSCI"),
    ("MXEA", "MSCI EAFE",                  "USD", "MSCI"),
    ("AGG",  "Bloomberg US Aggregate",     "USD", "Bloomberg"),
    ("HYG",  "iBoxx USD High Yield",       "USD", "Markit"),
    ("LUACTRUU", "Bloomberg US Corporate", "USD", "Bloomberg"),
    ("SX5E", "EURO STOXX 50",              "EUR", "STOXX"),
    ("UKX",  "FTSE 100",                   "GBP", "FTSE Russell"),
    ("NKY",  "Nikkei 225",                 "JPY", "Nikkei"),
    ("HSI",  "Hang Seng Index",            "HKD", "Hang Seng Indexes"),
]

INSTRUMENT_SEED = [
    ("AAPL",  "Apple Inc",            "EQUITY", "Technology",   "US", "NASDAQ"),
    ("MSFT",  "Microsoft Corp",       "EQUITY", "Technology",   "US", "NASDAQ"),
    ("NVDA",  "NVIDIA Corp",          "EQUITY", "Technology",   "US", "NASDAQ"),
    ("GOOGL", "Alphabet Inc Cl A",    "EQUITY", "Comms",        "US", "NASDAQ"),
    ("META",  "Meta Platforms",       "EQUITY", "Comms",        "US", "NASDAQ"),
    ("AMZN",  "Amazon.com Inc",       "EQUITY", "Cons Disc",    "US", "NASDAQ"),
    ("TSLA",  "Tesla Inc",            "EQUITY", "Cons Disc",    "US", "NASDAQ"),
    ("JPM",   "JPMorgan Chase",       "EQUITY", "Financials",   "US", "NYSE"),
    ("BAC",   "Bank of America",      "EQUITY", "Financials",   "US", "NYSE"),
    ("WFC",   "Wells Fargo",          "EQUITY", "Financials",   "US", "NYSE"),
    ("GS",    "Goldman Sachs",        "EQUITY", "Financials",   "US", "NYSE"),
    ("MS",    "Morgan Stanley",       "EQUITY", "Financials",   "US", "NYSE"),
    ("BRK.B", "Berkshire Hathaway",   "EQUITY", "Financials",   "US", "NYSE"),
    ("V",     "Visa Inc",             "EQUITY", "Financials",   "US", "NYSE"),
    ("MA",    "Mastercard",           "EQUITY", "Financials",   "US", "NYSE"),
    ("XOM",   "Exxon Mobil",          "EQUITY", "Energy",       "US", "NYSE"),
    ("CVX",   "Chevron Corp",         "EQUITY", "Energy",       "US", "NYSE"),
    ("COP",   "ConocoPhillips",       "EQUITY", "Energy",       "US", "NYSE"),
    ("UNH",   "UnitedHealth",         "EQUITY", "Healthcare",   "US", "NYSE"),
    ("JNJ",   "Johnson & Johnson",    "EQUITY", "Healthcare",   "US", "NYSE"),
    ("LLY",   "Eli Lilly",            "EQUITY", "Healthcare",   "US", "NYSE"),
    ("PFE",   "Pfizer Inc",           "EQUITY", "Healthcare",   "US", "NYSE"),
    ("MRK",   "Merck & Co",           "EQUITY", "Healthcare",   "US", "NYSE"),
    ("CAT",   "Caterpillar",          "EQUITY", "Industrials",  "US", "NYSE"),
    ("DE",    "Deere & Co",           "EQUITY", "Industrials",  "US", "NYSE"),
    ("BA",    "Boeing Co",            "EQUITY", "Industrials",  "US", "NYSE"),
    ("HON",   "Honeywell",            "EQUITY", "Industrials",  "US", "NYSE"),
    ("PG",    "Procter & Gamble",     "EQUITY", "Cons Staples", "US", "NYSE"),
    ("KO",    "Coca-Cola",            "EQUITY", "Cons Staples", "US", "NYSE"),
    ("PEP",   "PepsiCo",              "EQUITY", "Cons Staples", "US", "NASDAQ"),
    ("WMT",   "Walmart Inc",          "EQUITY", "Cons Staples", "US", "NYSE"),
    ("HD",    "Home Depot",           "EQUITY", "Cons Disc",    "US", "NYSE"),
    ("NKE",   "Nike Inc",             "EQUITY", "Cons Disc",    "US", "NYSE"),
    ("MCD",   "McDonald's Corp",      "EQUITY", "Cons Disc",    "US", "NYSE"),
    ("SPY",   "SPDR S&P 500 ETF",     "ETF",    "Financials",   "US", "ARCA"),
    ("QQQ",   "Invesco QQQ Trust",    "ETF",    "Technology",   "US", "NASDAQ"),
    ("IWM",   "iShares Russell 2000", "ETF",    "Financials",   "US", "ARCA"),
    ("TLT",   "iShares 20+ Yr Tsy",   "ETF",    "Government",   "US", "NASDAQ"),
    ("HYG",   "iShares iBoxx HYG",    "ETF",    "Corporate Credit", "US", "ARCA"),
    ("EEM",   "iShares MSCI EM",      "ETF",    "Financials",   "US", "ARCA"),
    ("AGG",   "iShares Core US Agg",  "ETF",    "Government",   "US", "ARCA"),
    ("LQD",   "iShares iBoxx IG",     "ETF",    "Corporate Credit", "US", "ARCA"),
    ("TIP",   "iShares TIPS Bond",    "ETF",    "Government",   "US", "ARCA"),
    ("GLD",   "SPDR Gold Shares",     "ETF",    "Materials",    "US", "ARCA"),
    ("UST10", "US Treasury 10Y",      "BOND",   "Government",   "US", "OTC"),
    ("UST2",  "US Treasury 2Y",       "BOND",   "Government",   "US", "OTC"),
    ("UST30", "US Treasury 30Y",      "BOND",   "Government",   "US", "OTC"),
    ("BUND10","Bund 10Y",             "BOND",   "Government",   "DE", "OTC"),
    ("GILT10","UK Gilt 10Y",          "BOND",   "Government",   "GB", "OTC"),
    ("JGB10", "JGB 10Y",              "BOND",   "Government",   "JP", "OTC"),
    ("AAPL35","Apple 3.85% 2043",     "BOND",   "Corporate Credit", "US", "OTC"),
    ("MSFT40","Microsoft 4.00% 2050", "BOND",   "Corporate Credit", "US", "OTC"),
    ("GS525", "Goldman 5.25% 2034",   "BOND",   "Corporate Credit", "US", "OTC"),
    ("JPM475","JPM 4.75% 2033",       "BOND",   "Corporate Credit", "US", "OTC"),
    ("ESM6",  "S&P 500 Future Jun",   "FUTURE", "Financials",   "US", "CME"),
    ("NQM6",  "Nasdaq 100 Future Jun","FUTURE", "Technology",   "US", "CME"),
    ("CLM6",  "WTI Crude Future Jun", "FUTURE", "Energy",       "US", "CME"),
    ("GCM6",  "Gold Future Jun",      "FUTURE", "Materials",    "US", "CME"),
    ("ZNM6",  "10Y Note Future Jun",  "FUTURE", "Government",   "US", "CME"),
    ("EURUSD","EUR/USD Spot",         "FX",     "Financials",   "US", "OTC"),
    ("GBPUSD","GBP/USD Spot",         "FX",     "Financials",   "US", "OTC"),
    ("USDJPY","USD/JPY Spot",         "FX",     "Financials",   "JP", "OTC"),
    ("USDCASH","USD Cash",            "CASH",   "Financials",   "US", "OTC"),
    ("ASML",  "ASML Holding",         "EQUITY", "Technology",   "NL", "XETRA"),
    ("SAP",   "SAP SE",               "EQUITY", "Technology",   "DE", "XETRA"),
    ("NESN",  "Nestle SA",            "EQUITY", "Cons Staples", "CH", "XETRA"),
    ("MC",    "LVMH",                 "EQUITY", "Cons Disc",    "FR", "XETRA"),
    ("AZN",   "AstraZeneca",          "EQUITY", "Healthcare",   "GB", "LSE"),
    ("HSBA",  "HSBC Holdings",        "EQUITY", "Financials",   "GB", "LSE"),
    ("SHEL",  "Shell plc",            "EQUITY", "Energy",       "GB", "LSE"),
    ("BP",    "BP plc",               "EQUITY", "Energy",       "GB", "LSE"),
    ("7203",  "Toyota Motor",         "EQUITY", "Cons Disc",    "JP", "TSE"),
    ("6758",  "Sony Group",           "EQUITY", "Technology",   "JP", "TSE"),
    ("9988",  "Alibaba Group",        "EQUITY", "Cons Disc",    "HK", "HKEX"),
    ("700",   "Tencent Holdings",     "EQUITY", "Comms",        "HK", "HKEX"),
    ("DBS",   "DBS Group",            "EQUITY", "Financials",   "SG", "SGX"),
    ("RIO",   "Rio Tinto",            "EQUITY", "Materials",    "AU", "LSE"),
    ("BHP",   "BHP Group",            "EQUITY", "Materials",    "AU", "LSE"),
    ("CBA",   "Commonwealth Bank",    "EQUITY", "Financials",   "AU", "LSE"),
    ("RY",    "Royal Bank of Canada", "EQUITY", "Financials",   "CA", "NYSE"),
    ("TD",    "Toronto-Dominion",     "EQUITY", "Financials",   "CA", "NYSE"),
    ("ENB",   "Enbridge Inc",         "EQUITY", "Energy",       "CA", "NYSE"),
    ("UBSG",  "UBS Group",            "EQUITY", "Financials",   "CH", "XETRA"),
]


def gen_portfolios(n=30):
    rows = []
    bench_codes = [b[0] for b in BENCHMARK_SEED]
    for i in range(1, n + 1):
        line = random.choice(FUND_LINES)
        tier = random.choice(FUND_TIERS)
        rows.append({
            "PORTFOLIO_ID":   i,
            "PORTFOLIO_CODE": f"ALT-{line[:3].upper()}-{i:03d}",
            "FUND_NAME":      f"Altavest {line} {tier}",
            "STRATEGY":       random.choice(STRATEGIES),
            "MANAGER":        random.choice(MANAGERS),
            "INCEPTION_DATE": date(2017, 1, 1) + timedelta(days=random.randint(0, 3000)),
            "BENCHMARK":      random.choice(bench_codes),
            "BASE_CCY":       "USD",
            "STATUS":         "ACTIVE" if random.random() > 0.07 else "WINDDOWN",
            "AUM_USD":        round(random.uniform(75_000_000, 3_500_000_000), 2),
            "UPDATED_AT":     datetime(2026, 5, 24, 7, 14, 0),
        })
    return rows


def gen_instruments():
    rows = []
    for i, (tkr, name, ac, sector, country, exch) in enumerate(INSTRUMENT_SEED, start=1):
        ccy = {"US": "USD", "GB": "GBP", "DE": "EUR", "FR": "EUR",
               "NL": "EUR", "CH": "CHF", "JP": "JPY", "HK": "HKD",
               "SG": "SGD", "AU": "AUD", "CA": "CAD"}.get(country, "USD")
        rows.append({
            "INSTRUMENT_ID":   i,
            "TICKER":          tkr,
            "CUSIP":           f"{random.randint(100000000, 999999999)}",
            "ISIN":            f"{country}{random.randint(1000000000, 9999999999)}",
            "NAME":            name,
            "ASSET_CLASS":     ac,
            "SECTOR":          sector,
            "CCY":             ccy,
            "COUNTRY":         country,
            "LISTED_EXCHANGE": exch,
        })
    return rows


def gen_benchmarks():
    rows = []
    for i, (code, name, ccy, prov) in enumerate(BENCHMARK_SEED, start=1):
        rows.append({
            "BENCHMARK_ID":   i,
            "BENCHMARK_CODE": code,
            "NAME":           name,
            "CCY":            ccy,
            "PROVIDER":       prov,
        })
    return rows


def _instrument_price(inst):
    ac = inst["ASSET_CLASS"]
    if ac == "BOND":
        return random.uniform(82, 112)
    if ac == "FUTURE":
        return random.uniform(2200, 6200)
    if ac == "FX":
        return random.uniform(0.65, 1.45)
    if ac == "CASH":
        return 1.0
    if ac == "ETF":
        return random.uniform(35, 580)
    return random.uniform(15, 950)


def gen_holdings(portfolios, instruments):
    rows = []
    hid = 100_000
    today = date(2026, 5, 24)
    # ~12,000 rows ⇒ ~400 instruments per portfolio across 30 portfolios.
    # We have ~80 instruments, so we snapshot across ~5 historical as_of dates.
    snapshot_dates = [today - timedelta(days=d * 21) for d in range(5)]
    target_total = 12_000
    per_snapshot = target_total // (len(portfolios) * len(snapshot_dates))
    for as_of in snapshot_dates:
        for p in portfolios:
            picks = random.sample(instruments, k=min(per_snapshot, len(instruments)))
            mv_list = []
            staged = []
            for inst in picks:
                price = _instrument_price(inst)
                qty_sign = 1 if random.random() > 0.12 else -1
                qty = round(qty_sign * random.uniform(250, 28000), 4)
                cost = price * random.uniform(0.75, 1.15)
                mv = round(qty * price, 2)
                mv_list.append(abs(mv))
                staged.append((inst, price, qty, cost, mv))
            total_abs_mv = sum(mv_list) or 1.0
            for inst, price, qty, cost, mv in staged:
                hid += 1
                weight = round(abs(mv) / total_abs_mv * 100.0, 4)
                rows.append({
                    "HOLDING_ID":       hid,
                    "AS_OF":            as_of,
                    "PORTFOLIO_ID":     p["PORTFOLIO_ID"],
                    "INSTRUMENT_ID":    inst["INSTRUMENT_ID"],
                    "QUANTITY":         qty,
                    "AVG_COST":         round(cost, 4),
                    "MARKET_PRICE":     round(price, 4),
                    "MARKET_VALUE_USD": mv,
                    "WEIGHT_PCT":       weight,
                    "UPDATED_AT":       datetime(2026, 5, 24, 7, 14, 0),
                })
    return rows


def gen_nav_daily(portfolios):
    rows = []
    nid = 200_000
    start = date(2026, 1, 2)
    # ~100 business days × 30 portfolios = ~3,000 rows.
    biz_days = []
    d = start
    while len(biz_days) < 100:
        if d.weekday() < 5:
            biz_days.append(d)
        d += timedelta(days=1)
    for p in portfolios:
        nav = random.uniform(95, 145)
        shares = round(p["AUM_USD"] / nav, 4)
        for as_of in biz_days:
            nid += 1
            nav *= (1.0 + random.gauss(0.0005, 0.012))
            total_nav = round(nav * shares, 2)
            expenses = round(abs(random.gauss(8500, 3500)), 2)
            gav = round(total_nav + expenses * random.uniform(1.0, 1.4), 2)
            rows.append({
                "NAV_ID":             nid,
                "AS_OF":              as_of,
                "PORTFOLIO_ID":       p["PORTFOLIO_ID"],
                "NAV_PER_SHARE":      round(nav, 6),
                "TOTAL_NAV_USD":      total_nav,
                "SHARES_OUTSTANDING": shares,
                "GAV_USD":            gav,
                "EXPENSES_USD":       expenses,
                "UPDATED_AT":         datetime(2026, 5, 24, 7, 16, 0),
            })
    return rows


def gen_performance_returns(portfolios, benchmarks):
    rows = []
    rid = 300_000
    start = date(2026, 1, 2)
    biz_days = []
    d = start
    while len(biz_days) < 100:
        if d.weekday() < 5:
            biz_days.append(d)
        d += timedelta(days=1)
    bench_lookup = {b["BENCHMARK_CODE"]: b["BENCHMARK_ID"] for b in benchmarks}
    for p in portfolios:
        bench_id = bench_lookup.get(p["BENCHMARK"], benchmarks[0]["BENCHMARK_ID"])
        for as_of in biz_days:
            rid += 1
            pret = round(random.gauss(0.0005, 0.011), 6)
            bret = round(random.gauss(0.0004, 0.009), 6)
            rows.append({
                "RETURN_ID":        rid,
                "AS_OF":            as_of,
                "PORTFOLIO_ID":     p["PORTFOLIO_ID"],
                "BENCHMARK_ID":     bench_id,
                "PORTFOLIO_RETURN": pret,
                "BENCHMARK_RETURN": bret,
                "ACTIVE_RETURN":    round(pret - bret, 6),
                "RETURN_TYPE":      random.choice(RETURN_TYPES_W),
            })
    return rows


def gen_mandates(portfolios):
    rows = []
    mid = 400_000
    mandate_specs = [
        ("MAX_SECTOR_WEIGHT", lambda: f"{random.choice(SECTORS)} <= {random.choice([15, 18, 20, 22, 25])}%"),
        ("MAX_ISSUER",        lambda: f"Single issuer <= {random.choice([3, 4, 5, 6, 7])}%"),
        ("MIN_CASH",          lambda: f"Cash >= {random.choice([1, 2, 3, 5])}%"),
        ("MAX_LEVERAGE",      lambda: f"Gross leverage <= {random.choice([1.2, 1.5, 1.8, 2.0, 2.5])}x"),
        ("ESG_EXCLUSION",     lambda: random.choice([
            "No tobacco", "No controversial weapons", "No thermal coal",
            "No private prisons", "MSCI ESG >= BBB",
        ])),
        ("REGION_LIMIT",      lambda: f"{random.choice(['EM','Asia ex-JP','EMEA','LatAm'])} <= {random.choice([10, 15, 20, 25])}%"),
    ]
    # ~120 rows ⇒ ~4 mandates per portfolio.
    for p in portfolios:
        for _ in range(random.randint(3, 5)):
            mid += 1
            mtype, build = random.choice(mandate_specs)
            eff = date(2024, 1, 1) + timedelta(days=random.randint(0, 700))
            expiry = eff + timedelta(days=random.randint(365, 1825))
            rows.append({
                "MANDATE_ID":       mid,
                "PORTFOLIO_ID":     p["PORTFOLIO_ID"],
                "MANDATE_TYPE":     mtype,
                "CONSTRAINT_VALUE": build(),
                "EFFECTIVE_DATE":   eff,
                "EXPIRY_DATE":      expiry,
                "STATUS":           "ACTIVE" if random.random() > 0.08 else "EXPIRED",
            })
    return rows


def gen_valuation_audit(portfolios):
    rows = []
    aid = 500_000
    start = date(2026, 1, 2)
    biz_days = []
    d = start
    while len(biz_days) < 100:
        if d.weekday() < 5:
            biz_days.append(d)
        d += timedelta(days=1)
    checks = [
        "NAV_RECON_VS_ADMIN", "PRICE_STALENESS", "POSITION_RECON_VS_CUSTODIAN",
        "CORPORATE_ACTION_APPLIED", "FX_RATE_FRESHNESS", "EXPENSE_ACCRUAL",
        "CASH_RECON", "TRADE_DATE_VS_SETTLE", "INCOME_ACCRUAL",
        "BENCHMARK_PRICE_AVAILABLE",
    ]
    results_w = ["PASS"] * 86 + ["WARN"] * 11 + ["FAIL"] * 3
    target_total = 6_000
    per_pday = max(1, target_total // (len(portfolios) * len(biz_days)))
    for as_of in biz_days:
        for p in portfolios:
            for _ in range(per_pday):
                aid += 1
                res = random.choice(results_w)
                if res == "PASS":
                    var = round(abs(random.gauss(0.5, 1.5)), 2)
                elif res == "WARN":
                    var = round(abs(random.gauss(8, 4)), 2)
                else:
                    var = round(abs(random.gauss(35, 15)), 2)
                rows.append({
                    "AUDIT_ID":     aid,
                    "AS_OF":        as_of,
                    "PORTFOLIO_ID": p["PORTFOLIO_ID"],
                    "CHECK_NAME":   random.choice(checks),
                    "RESULT":       res,
                    "VARIANCE_BPS": var,
                    "CHECKED_AT":   datetime.combine(as_of, datetime.min.time()) + timedelta(hours=7, minutes=random.randint(0, 90)),
                })
    return rows


# ─── DB helpers (Oracle / python-oracledb thin mode) ──────────────────────────

def connect_as(user, password):
    """Open a thin-mode oracledb connection."""
    return oracledb.connect(user=user, password=password, dsn=DSN)


def _exec_swallow(cur, sql, swallow_codes):
    """
    Execute DDL through a PL/SQL anonymous block that swallows specific
    ORA-#### errors (e.g. -955 'name already used', -942 'table does not exist',
    -1408 'such column list already indexed', -1418 'no such index').
    """
    codes = ", ".join(str(c) for c in swallow_codes)
    safe_sql = sql.replace("'", "''")
    plsql = (
        "BEGIN\n"
        f"  EXECUTE IMMEDIATE '{safe_sql}';\n"
        "EXCEPTION\n"
        f"  WHEN OTHERS THEN IF SQLCODE NOT IN ({codes}) THEN RAISE; END IF;\n"
        "END;"
    )
    cur.execute(plsql)


def ensure_schema_user():
    """
    Try to create the schema as an Oracle user.  On RDS the admin user can
    typically CREATE USER and GRANT UNLIMITED TABLESPACE.  If that fails, fall
    back to creating objects under the connecting user's own schema and return
    that name instead.
    """
    global SCHEMA
    # If the requested schema *is* the connecting user, nothing to do.
    if SCHEMA == USER.upper():
        log.info(f"Using connecting user's schema: {SCHEMA}")
        return SCHEMA

    pw_alphabet = string.ascii_letters + string.digits
    schema_pw = "".join(secrets.choice(pw_alphabet) for _ in range(20)) + "Aa1!"

    try:
        with connect_as(USER, PWD) as c:
            cur = c.cursor()
            _exec_swallow(
                cur,
                f'CREATE USER {SCHEMA} IDENTIFIED BY "{schema_pw}"',
                swallow_codes=[-1920],  # ORA-01920: user name conflicts
            )
            _exec_swallow(
                cur,
                f"GRANT UNLIMITED TABLESPACE TO {SCHEMA}",
                swallow_codes=[-1917],  # ORA-01917: user does not exist
            )
            _exec_swallow(
                cur,
                f"GRANT CREATE SESSION TO {SCHEMA}",
                swallow_codes=[-1917],
            )
            cur.close()
        log.info(f"Schema {SCHEMA} ready (created as Oracle user, or already existed)")
        return SCHEMA
    except oracledb.DatabaseError as e:
        log.warning(
            f"Could not create schema user {SCHEMA} ({e}). "
            f"Falling back to connecting user's schema: {USER.upper()}"
        )
        SCHEMA = USER.upper()
        return SCHEMA


def drop_table(c, tbl):
    cur = c.cursor()
    _exec_swallow(
        cur,
        f"DROP TABLE {SCHEMA}.{tbl} CASCADE CONSTRAINTS PURGE",
        swallow_codes=[-942],  # ORA-00942: table or view does not exist
    )
    c.commit()
    cur.close()


def create_table(c, tbl, defn):
    cols = ", ".join(f"{col} {ty}" for col, ty in defn["columns"])
    sql = f"CREATE TABLE {SCHEMA}.{tbl} ({cols})"
    cur = c.cursor()
    _exec_swallow(cur, sql, swallow_codes=[-955])  # ORA-00955: name already used
    c.commit()
    cur.close()
    log.info(f"  created {SCHEMA}.{tbl}")


def create_indexes(c, tbl, defn):
    if "indexes" not in defn:
        return
    cur = c.cursor()
    for col in defn["indexes"]:
        idx = f"IX_{tbl}_{col}"[:30]  # Oracle 11g limit; safe upper bound
        _exec_swallow(
            cur,
            f"CREATE INDEX {SCHEMA}.{idx} ON {SCHEMA}.{tbl} ({col})",
            swallow_codes=[-955, -1408],  # already used / column list already indexed
        )
    c.commit()
    cur.close()


def bulk_insert(c, tbl, defn, rows):
    if not rows:
        log.warning(f"  no rows for {tbl}")
        return 0
    cols = [name for name, _ in defn["columns"]]
    placeholders = ", ".join(f":{i+1}" for i in range(len(cols)))
    sql = f"INSERT INTO {SCHEMA}.{tbl} ({', '.join(cols)}) VALUES ({placeholders})"
    cur = c.cursor()
    batch = 1000
    total = 0
    for i in range(0, len(rows), batch):
        chunk = rows[i:i + batch]
        cur.executemany(
            sql,
            [tuple(r.get(col) for col in cols) for r in chunk],
        )
        c.commit()
        total += len(chunk)
    cur.close()
    log.info(f"  inserted {total:,} rows into {SCHEMA}.{tbl}")
    return total


def summarize(c):
    cur = c.cursor()
    log.info("-" * 60)
    log.info(f"final row counts in {SCHEMA}:")
    for tbl in LOAD_ORDER:
        try:
            cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.{tbl}")
            (n,) = cur.fetchone()
            log.info(f"  {SCHEMA}.{tbl:<22} {n:>10,}")
        except oracledb.DatabaseError as e:
            log.warning(f"  could not count {tbl}: {e}")
    cur.close()


def main():
    log.info("=" * 60)
    log.info("ALTAVEST PORTFOLIO MANAGEMENT → ORACLE RDS")
    log.info(f"  host:     {HOST}:{PORT}")
    log.info(f"  service:  {SERVICE}")
    log.info(f"  user:     {USER}")
    log.info(f"  schema:   {SCHEMA}")
    log.info("=" * 60)

    log.info("generating synthetic portfolio book...")
    portfolios = gen_portfolios()
    instruments = gen_instruments()
    benchmarks = gen_benchmarks()
    holdings = gen_holdings(portfolios, instruments)
    nav = gen_nav_daily(portfolios)
    perf = gen_performance_returns(portfolios, benchmarks)
    mandates = gen_mandates(portfolios)
    audit = gen_valuation_audit(portfolios)

    data = {
        "PORTFOLIOS":          portfolios,
        "INSTRUMENTS":         instruments,
        "BENCHMARKS":          benchmarks,
        "HOLDINGS":            holdings,
        "NAV_DAILY":           nav,
        "PERFORMANCE_RETURNS": perf,
        "MANDATES":            mandates,
        "VALUATION_AUDIT":     audit,
    }
    for tbl in LOAD_ORDER:
        log.info(f"  {tbl}: {len(data[tbl]):,} rows generated")

    ensure_schema_user()  # may rewrite SCHEMA in place on fallback

    c = connect_as(USER, PWD)
    try:
        # Set current schema if we created a separate user.  Harmless if it's
        # the same as the connecting user.
        try:
            cur = c.cursor()
            cur.execute(f"ALTER SESSION SET CURRENT_SCHEMA = {SCHEMA}")
            cur.close()
        except oracledb.DatabaseError as e:
            log.warning(f"ALTER SESSION SET CURRENT_SCHEMA failed: {e}")

        for tbl in LOAD_ORDER:
            log.info(f"loading {tbl}...")
            drop_table(c, tbl)
            create_table(c, tbl, TABLE_DEFS[tbl])
            bulk_insert(c, tbl, TABLE_DEFS[tbl], data[tbl])
            create_indexes(c, tbl, TABLE_DEFS[tbl])

        summarize(c)
        log.info("=" * 60)
        log.info("LOAD COMPLETE")
        log.info("=" * 60)
    finally:
        c.close()


if __name__ == "__main__":
    main()
