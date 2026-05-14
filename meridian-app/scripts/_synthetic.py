"""
Synthetic FinServ Open Data Initiative (ODI) dataset generator.

Mirrors what build_snapshot.py would receive from a live Athena/Iceberg
gold-layer query so the React frontend renders identically whether the
data came from:

    SEC EDGAR + FRED + CFPB  →  S3 (bronze)  →  dbt  →  Iceberg gold tables

…or this deterministic generator.

The generator is pure stdlib — no faker, no boto3 — and is seeded so the
same demo always shows JPM with the same risk score, the same complaint
mix, the same 8-K cluster.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import math
import random
from typing import Any

# ---------------------------------------------------------------------------
# S&P-500-ish company universe.  Heavy Financials weight by design — this is
# Meridian's house view.  Each row: (ticker, name, sector, industry, exchange,
# cik_real_or_None, hq_city, hq_state, employees, mkt_cap_usd, rev_ttm)
#
# CIK is real where it's common knowledge for the major tickers; otherwise we
# synthesize a deterministic 10-digit value below.
# ---------------------------------------------------------------------------

COMPANIES_SEED: list[tuple[str, str, str, str, str, str | None, str, str, int, int, int]] = [
    # ── Financials (heavy) ────────────────────────────────────────────────
    ("JPM",  "JPMorgan Chase & Co.",      "Financials", "Diversified Banks",      "NYSE", "0000019617", "New York",      "NY", 309000, 620_000_000_000, 162_000_000_000),
    ("BAC",  "Bank of America Corp.",     "Financials", "Diversified Banks",      "NYSE", "0000070858", "Charlotte",     "NC", 213000, 330_000_000_000, 99_000_000_000),
    ("WFC",  "Wells Fargo & Company",     "Financials", "Diversified Banks",      "NYSE", "0000072971", "San Francisco", "CA", 226000, 215_000_000_000, 82_000_000_000),
    ("C",    "Citigroup Inc.",            "Financials", "Diversified Banks",      "NYSE", "0000831001", "New York",      "NY", 240000, 130_000_000_000, 79_000_000_000),
    ("MS",   "Morgan Stanley",            "Financials", "Investment Banking",     "NYSE", "0000895421", "New York",      "NY",  82000, 175_000_000_000, 56_000_000_000),
    ("GS",   "Goldman Sachs Group, Inc.", "Financials", "Investment Banking",     "NYSE", "0000886982", "New York",      "NY",  49000, 165_000_000_000, 47_000_000_000),
    ("BLK",  "BlackRock, Inc.",           "Financials", "Asset Management",       "NYSE", "0001364742", "New York",      "NY",  19000, 140_000_000_000, 18_000_000_000),
    ("USB",  "U.S. Bancorp",              "Financials", "Regional Banks",         "NYSE", "0000036104", "Minneapolis",   "MN",  77000,  72_000_000_000, 27_000_000_000),
    ("PNC",  "PNC Financial Services",    "Financials", "Regional Banks",         "NYSE", "0000713676", "Pittsburgh",    "PA",  56000,  62_000_000_000, 21_000_000_000),
    ("AXP",  "American Express Company",  "Financials", "Consumer Finance",       "NYSE", "0000004962", "New York",      "NY",  77000, 175_000_000_000, 60_000_000_000),
    ("COF",  "Capital One Financial",     "Financials", "Consumer Finance",       "NYSE", "0000927628", "McLean",        "VA",  52000,  56_000_000_000, 36_000_000_000),
    ("SCHW", "The Charles Schwab Corp.",  "Financials", "Investment Services",    "NYSE", "0000316709", "Westlake",      "TX",  34000, 130_000_000_000, 20_000_000_000),
    ("MET",  "MetLife, Inc.",             "Financials", "Life Insurance",         "NYSE", "0001099219", "New York",      "NY",  45000,  56_000_000_000, 67_000_000_000),
    ("AIG",  "American International Grp", "Financials", "Insurance",             "NYSE", "0000005272", "New York",      "NY",  26000,  48_000_000_000, 47_000_000_000),
    ("PRU",  "Prudential Financial",      "Financials", "Life Insurance",         "NYSE", "0001137774", "Newark",        "NJ",  40000,  41_000_000_000, 55_000_000_000),
    ("ALL",  "The Allstate Corporation",  "Financials", "Property & Casualty Ins","NYSE", "0000899051", "Northbrook",    "IL",  54000,  44_000_000_000, 57_000_000_000),
    ("TRV",  "The Travelers Companies",   "Financials", "Property & Casualty Ins","NYSE", "0000086312", "New York",      "NY",  30000,  53_000_000_000, 41_000_000_000),
    ("BK",   "Bank of New York Mellon",   "Financials", "Custody Banks",          "NYSE", "0001390777", "New York",      "NY",  53000,  56_000_000_000, 18_000_000_000),
    ("STT",  "State Street Corporation",  "Financials", "Custody Banks",          "NYSE", "0000093751", "Boston",        "MA",  46000,  25_000_000_000, 12_000_000_000),
    ("DFS",  "Discover Financial Services","Financials","Consumer Finance",       "NYSE", "0001393612", "Riverwoods",    "IL",  21000,  35_000_000_000, 16_000_000_000),
    ("CB",   "Chubb Limited",             "Financials", "Property & Casualty Ins","NYSE", "0000896159", "Zurich",        "NA",  43000, 110_000_000_000, 49_000_000_000),
    ("V",    "Visa Inc.",                 "Financials", "Transaction Processing", "NYSE", "0001403161", "San Francisco", "CA",  31000, 540_000_000_000, 35_000_000_000),
    ("MA",   "Mastercard Incorporated",   "Financials", "Transaction Processing", "NYSE", "0001141391", "Purchase",      "NY",  33000, 425_000_000_000, 26_000_000_000),
    ("ICE",  "Intercontinental Exchange", "Financials", "Financial Exchanges",    "NYSE", "0001571949", "Atlanta",       "GA",  10000,  85_000_000_000,  9_000_000_000),
    ("CME",  "CME Group Inc.",            "Financials", "Financial Exchanges",    "NASDAQ","0001156375","Chicago",       "IL",   4000,  78_000_000_000,  5_700_000_000),

    # ── Technology ────────────────────────────────────────────────────────
    ("AAPL", "Apple Inc.",                "Technology", "Consumer Electronics",   "NASDAQ","0000320193","Cupertino",     "CA", 161000, 2_900_000_000_000, 385_000_000_000),
    ("MSFT", "Microsoft Corporation",     "Technology", "Software—Infrastructure","NASDAQ","0000789019","Redmond",       "WA", 221000, 3_100_000_000_000, 245_000_000_000),
    ("NVDA", "NVIDIA Corporation",        "Technology", "Semiconductors",         "NASDAQ","0001045810","Santa Clara",   "CA",  29000, 2_400_000_000_000, 96_000_000_000),
    ("GOOG", "Alphabet Inc.",             "Technology", "Internet Content",       "NASDAQ","0001652044","Mountain View", "CA", 182000, 2_000_000_000_000, 318_000_000_000),
    ("META", "Meta Platforms, Inc.",      "Technology", "Internet Content",       "NASDAQ","0001326801","Menlo Park",    "CA",  74000, 1_300_000_000_000, 142_000_000_000),
    ("AMZN", "Amazon.com, Inc.",          "Consumer Discretionary","Internet Retail","NASDAQ","0001018724","Seattle",    "WA",1540000, 1_900_000_000_000, 575_000_000_000),
    ("ORCL", "Oracle Corporation",        "Technology", "Software—Infrastructure","NYSE", "0001341439","Austin",        "TX", 159000, 380_000_000_000, 53_000_000_000),
    ("CRM",  "Salesforce, Inc.",          "Technology", "Software—Application",   "NYSE", "0001108524","San Francisco", "CA",  72000, 280_000_000_000, 35_000_000_000),

    # ── Healthcare ────────────────────────────────────────────────────────
    ("JNJ",  "Johnson & Johnson",         "Healthcare", "Drug Manufacturers",     "NYSE", "0000200406","New Brunswick", "NJ", 134000, 380_000_000_000, 85_000_000_000),
    ("UNH",  "UnitedHealth Group Inc.",   "Healthcare", "Healthcare Plans",       "NYSE", "0000731766","Minnetonka",    "MN", 440000, 460_000_000_000, 372_000_000_000),
    ("PFE",  "Pfizer Inc.",               "Healthcare", "Drug Manufacturers",     "NYSE", "0000078003","New York",      "NY",  88000, 165_000_000_000, 58_000_000_000),
    ("LLY",  "Eli Lilly and Company",     "Healthcare", "Drug Manufacturers",     "NYSE", "0000059478","Indianapolis",  "IN",  43000, 720_000_000_000, 42_000_000_000),

    # ── Consumer Staples / Discretionary ──────────────────────────────────
    ("WMT",  "Walmart Inc.",              "Consumer Staples","Discount Stores",   "NYSE", "0000104169","Bentonville",   "AR",2100000, 540_000_000_000, 648_000_000_000),
    ("HD",   "The Home Depot, Inc.",      "Consumer Discretionary","Home Improvement","NYSE","0000354950","Atlanta",    "GA", 463000, 360_000_000_000, 153_000_000_000),
    ("KO",   "The Coca-Cola Company",     "Consumer Staples","Beverages",         "NYSE", "0000021344","Atlanta",       "GA",  79000, 275_000_000_000, 46_000_000_000),
    ("PEP",  "PepsiCo, Inc.",             "Consumer Staples","Beverages",         "NASDAQ","0000077476","Purchase",     "NY", 318000, 230_000_000_000, 91_000_000_000),
    ("MCD",  "McDonald's Corporation",    "Consumer Discretionary","Restaurants", "NYSE", "0000063908","Chicago",       "IL", 150000, 215_000_000_000, 25_000_000_000),

    # ── Industrials ───────────────────────────────────────────────────────
    ("BA",   "The Boeing Company",        "Industrials","Aerospace & Defense",    "NYSE", "0000012927","Arlington",     "VA", 156000, 110_000_000_000, 78_000_000_000),
    ("CAT",  "Caterpillar Inc.",          "Industrials","Farm & Heavy Machinery", "NYSE", "0000018230","Irving",        "TX", 109000, 165_000_000_000, 67_000_000_000),
    ("GE",   "GE Aerospace",              "Industrials","Aerospace & Defense",    "NYSE", "0000040545","Cincinnati",    "OH",  52000, 195_000_000_000, 35_000_000_000),
    ("UNP",  "Union Pacific Corporation", "Industrials","Railroads",              "NYSE", "0000100885","Omaha",         "NE",  32000, 145_000_000_000, 24_000_000_000),

    # ── Energy ────────────────────────────────────────────────────────────
    ("XOM",  "Exxon Mobil Corporation",   "Energy",     "Oil & Gas Integrated",   "NYSE", "0000034088","Spring",        "TX",  62000, 480_000_000_000, 345_000_000_000),
    ("CVX",  "Chevron Corporation",       "Energy",     "Oil & Gas Integrated",   "NYSE", "0000093410","San Ramon",     "CA",  45000, 290_000_000_000, 200_000_000_000),

    # ── Utilities ─────────────────────────────────────────────────────────
    ("NEE",  "NextEra Energy, Inc.",      "Utilities",  "Utilities—Regulated",    "NYSE", "0000753308","Juno Beach",    "FL",  16000, 160_000_000_000, 28_000_000_000),
    ("SO",   "The Southern Company",      "Utilities",  "Utilities—Regulated",    "NYSE", "0000092122","Atlanta",       "GA",  28000,  82_000_000_000, 26_000_000_000),

    # ── Real Estate ───────────────────────────────────────────────────────
    ("AMT",  "American Tower Corporation","Real Estate","REIT—Specialty",         "NYSE", "0001053507","Boston",        "MA",   6000,  90_000_000_000, 11_000_000_000),
    ("PLD",  "Prologis, Inc.",            "Real Estate","REIT—Industrial",        "NYSE", "0001045609","San Francisco", "CA",   2600, 105_000_000_000,  8_000_000_000),
    ("SPG",  "Simon Property Group, Inc.","Real Estate","REIT—Retail",            "NYSE", "0001063761","Indianapolis",  "IN",   2400,  55_000_000_000,  5_700_000_000),

    # ── Materials ─────────────────────────────────────────────────────────
    ("LIN",  "Linde plc",                 "Materials",  "Specialty Chemicals",    "NYSE", "0001707925","Woking",        "NA",  66000, 215_000_000_000, 33_000_000_000),
    ("APD",  "Air Products and Chemicals","Materials",  "Specialty Chemicals",    "NYSE", "0000002969","Allentown",     "PA",  23000,  62_000_000_000, 12_000_000_000),

    # ── Communication Services ────────────────────────────────────────────
    ("DIS",  "The Walt Disney Company",   "Communication Services","Entertainment","NYSE","0001744489","Burbank",       "CA", 225000, 200_000_000_000, 91_000_000_000),
    ("T",    "AT&T Inc.",                 "Communication Services","Telecom",     "NYSE", "0000732717","Dallas",        "TX", 141000, 130_000_000_000, 122_000_000_000),
    ("VZ",   "Verizon Communications",    "Communication Services","Telecom",     "NYSE", "0000732712","New York",      "NY", 105000, 175_000_000_000, 134_000_000_000),
    ("NFLX", "Netflix, Inc.",             "Communication Services","Entertainment","NASDAQ","0001065280","Los Gatos",   "CA",  14000, 280_000_000_000, 36_000_000_000),
    ("CMCSA","Comcast Corporation",       "Communication Services","Telecom",     "NASDAQ","0001166691","Philadelphia", "PA", 186000, 175_000_000_000, 121_000_000_000),
]

# CFPB product taxonomy — weights are roughly aligned with public statistics.
PRODUCTS = [
    ("Credit reporting, credit repair services, or other personal consumer reports",
     ["Credit reporting", "Credit repair", "Identity theft reporting"], 0.40, "credit-reporting-errors"),
    ("Debt collection",
     ["Other debt", "Credit card debt", "Medical debt", "Mortgage debt", "Auto debt"], 0.15, "debt-collection-tactics"),
    ("Credit card or prepaid card",
     ["General-purpose credit card", "Store credit card", "Prepaid card"], 0.10, "billing-disputes"),
    ("Mortgage",
     ["Conventional home mortgage", "FHA mortgage", "VA mortgage", "Home equity loan or line of credit"], 0.10, "mortgage-servicing"),
    ("Checking or savings account",
     ["Checking account", "Savings account", "CD (Certificate of Deposit)"], 0.10, "account-fraud"),
    ("Student loan",
     ["Federal student loan servicing", "Private student loan"], 0.04, "loan-modification"),
    ("Vehicle loan or lease",
     ["Loan", "Lease"], 0.04, "loan-modification"),
    ("Money transfer, virtual currency, or money service",
     ["Domestic (US) money transfer", "International money transfer", "Virtual currency"], 0.05, "customer-service"),
    ("Payday loan, title loan, or personal loan",
     ["Personal line of credit", "Installment loan", "Payday loan"], 0.02, "fee-disputes"),
]

ISSUES_BY_PRODUCT: dict[str, list[str]] = {
    "Credit reporting, credit repair services, or other personal consumer reports": [
        "Incorrect information on your report",
        "Improper use of your report",
        "Problem with a credit reporting company's investigation into an existing problem",
        "Unable to get your credit report or credit score",
        "Credit monitoring or identity theft protection services",
    ],
    "Debt collection": [
        "Attempts to collect debt not owed",
        "Communication tactics",
        "Written notification about debt",
        "False statements or representation",
        "Took or threatened to take negative or legal action",
    ],
    "Credit card or prepaid card": [
        "Problem with a purchase shown on your statement",
        "Fees or interest",
        "Other features, terms, or problems",
        "Getting a credit card",
        "Closing your account",
    ],
    "Mortgage": [
        "Trouble during payment process",
        "Struggling to pay mortgage",
        "Applying for a mortgage or refinancing an existing mortgage",
        "Closing on a mortgage",
        "Incorrect information on your report",
    ],
    "Checking or savings account": [
        "Managing an account",
        "Problem with a lender or other company charging your account",
        "Closing an account",
        "Opening an account",
        "Problem caused by your funds being low",
    ],
    "Student loan": [
        "Dealing with your lender or servicer",
        "Struggling to repay your loan",
        "Problem with a credit reporting company's investigation into an existing problem",
    ],
    "Vehicle loan or lease": [
        "Problem with the payoff process at the end of the loan",
        "Managing the loan or lease",
        "Struggling to pay your loan",
        "Getting a loan or lease",
    ],
    "Money transfer, virtual currency, or money service": [
        "Fraud or scam",
        "Money was not available when promised",
        "Other transaction problem",
        "Confusing or missing disclosures",
    ],
    "Payday loan, title loan, or personal loan": [
        "Charged fees or interest you didn't expect",
        "Struggling to pay your loan",
        "Getting the loan",
    ],
}

STATES = ["NY", "CA", "TX", "FL", "IL", "PA", "OH", "GA", "NC", "MI", "NJ", "VA",
          "WA", "AZ", "MA", "TN", "IN", "MO", "MD", "WI", "CO", "MN", "SC", "AL"]

TOPIC_CLUSTERS = [
    "billing-disputes", "credit-reporting-errors", "debt-collection-tactics",
    "mortgage-servicing", "loan-modification", "account-fraud",
    "identity-theft", "fee-disputes", "customer-service", "other",
]

# FRED-style macro series with realistic generation parameters
# (series_id, title, units, frequency, category, start_value, drift, vol, bounds)
MACRO_SERIES_SEED: list[tuple[str, str, str, str, str, float, float, float, tuple[float, float]]] = [
    ("DGS10",    "10-Year Treasury Constant Maturity Rate",       "Percent",            "Daily",     "rates",     1.55, 0.060,  0.12, (0.5, 5.2)),
    ("DGS2",     "2-Year Treasury Constant Maturity Rate",        "Percent",            "Daily",     "rates",     0.18, 0.075,  0.15, (0.05, 5.5)),
    ("DGS30",    "30-Year Treasury Constant Maturity Rate",       "Percent",            "Daily",     "rates",     2.05, 0.052,  0.10, (1.0, 5.4)),
    ("T10Y2Y",   "10-Year minus 2-Year Treasury Yield Spread",    "Percent",            "Daily",     "rates",     1.40,-0.030,  0.08, (-1.1, 1.7)),
    ("FEDFUNDS", "Effective Federal Funds Rate",                  "Percent",            "Monthly",   "rates",     0.08, 0.090,  0.05, (0.05, 5.5)),
    ("CPIAUCSL", "Consumer Price Index for All Urban Consumers",  "Index 1982-84=100",  "Monthly",   "inflation", 268.0, 0.45,  0.20, (260.0, 320.0)),
    ("UNRATE",   "Unemployment Rate",                             "Percent",            "Monthly",   "employment",3.95,-0.005,  0.10, (3.4, 4.8)),
    ("GDP",      "Gross Domestic Product",                        "Billions of Dollars","Quarterly", "growth",   24500,  150.0, 80.0, (23000, 30000)),
    ("HOUST",    "Housing Starts: Total New Privately Owned",     "Thousands of Units", "Monthly",   "growth",    1620,-3.500, 60.0, (1100, 1800)),
    ("UMCSENT",  "University of Michigan Consumer Sentiment",     "Index 1966:Q1=100",  "Monthly",   "other",      72.0, 0.10,  3.50, (50.0, 105.0)),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _weighted_choice(rng: random.Random, items_with_weight: list[tuple[Any, float]]):
    total = sum(w for _, w in items_with_weight)
    r = rng.random() * total
    cum = 0.0
    for item, w in items_with_weight:
        cum += w
        if r <= cum:
            return item
    return items_with_weight[-1][0]


def _zero_padded_cik(real: str | None, ticker: str) -> str:
    if real:
        return real
    h = int(hashlib.sha1(ticker.encode()).hexdigest(), 16) % 10_000_000
    return f"{h:010d}"


def _accession(rng: random.Random, cik: str, year: int) -> str:
    # SEC accession format: NNNNNNNNNN-YY-NNNNNN  (filer CIK, 2-digit year, seq)
    filer = cik[-10:]
    seq = rng.randint(1, 999999)
    return f"{filer}-{str(year)[-2:]}-{seq:06d}"


# ---------------------------------------------------------------------------
# Macro time-series generator: pseudo-realistic random walks with regime drift
# ---------------------------------------------------------------------------

def _gen_macro_observations(
    rng: random.Random,
    today: dt.date,
    series_id: str,
    title: str,
    units: str,
    frequency: str,
    start_value: float,
    drift: float,
    vol: float,
    bounds: tuple[float, float],
) -> list[dict[str, Any]]:
    obs: list[dict[str, Any]] = []
    if frequency == "Daily":
        # last 60 months of business days ≈ 60*21 = 1260 points
        n = 1260
        delta = dt.timedelta(days=1)
        # generate working days only
        dates = []
        d = today
        while len(dates) < n:
            if d.weekday() < 5:
                dates.append(d)
            d -= delta
        dates.reverse()
    elif frequency == "Quarterly":
        n = 20  # 5y of quarterly points
        dates = []
        # quarter ends going back
        y, m = today.year, ((today.month - 1) // 3) * 3 + 1
        for _ in range(n):
            dates.append(dt.date(y, m, 1))
            m -= 3
            if m <= 0:
                m += 12
                y -= 1
        dates.reverse()
    else:  # Monthly
        n = 60
        dates = []
        y, m = today.year, today.month
        for _ in range(n):
            dates.append(dt.date(y, m, 1))
            m -= 1
            if m <= 0:
                m += 12
                y -= 1
        dates.reverse()

    v = start_value
    lo, hi = bounds
    # special handling for T10Y2Y — derived later from DGS10/DGS2 if desired,
    # but for the demo we just simulate it directly with a believable inversion
    for i, d in enumerate(dates):
        # drift accelerates in the more recent half — gives us a visible "trend"
        recency_factor = 1.0 + (i / max(1, n - 1))
        step = drift * recency_factor / max(1, n / 10) + rng.gauss(0, vol)
        v = max(lo, min(hi, v + step))
        # FEDFUNDS — stepwise: only move ~10% of the time
        if series_id == "FEDFUNDS" and rng.random() > 0.10:
            pass  # hold flat
        # UNRATE: bias toward small reversion to 4.0
        elif series_id == "UNRATE":
            v = v + (4.0 - v) * 0.02
        obs.append({
            "series_id": series_id,
            "date": d.isoformat(),
            "value": round(v, 4 if v < 100 else 2),
        })
    return obs


# ---------------------------------------------------------------------------
# Risk score formula
# ---------------------------------------------------------------------------

def _bucket(score: float) -> str:
    if score < 25:   return "low"
    if score < 50:   return "moderate"
    if score < 75:   return "elevated"
    return "high"


def _risk_score(
    rng: random.Random,
    sector: str,
    complaints_per_quarter: float,
    employees: int,
    revenue_growth_yoy: float,
    eight_k_last_90: int,
    macro_stress: float,
) -> float:
    # Normalize complaint velocity by headcount (complaints per 10k employees)
    norm_comp = (complaints_per_quarter / max(1, employees / 10000)) / 12.0
    comp_pts = min(100, norm_comp * 25)

    growth_pts = 0.0
    if revenue_growth_yoy is None:
        growth_pts = 30
    elif revenue_growth_yoy < -0.10:
        growth_pts = 90
    elif revenue_growth_yoy < 0:
        growth_pts = 65
    elif revenue_growth_yoy < 0.03:
        growth_pts = 40
    elif revenue_growth_yoy < 0.08:
        growth_pts = 20
    else:
        growth_pts = 8

    eight_k_pts = min(100, eight_k_last_90 * 15)

    sector_base = {
        "Financials":           65,
        "Real Estate":          55,
        "Energy":               40,
        "Consumer Discretionary": 30,
        "Industrials":          30,
        "Healthcare":           28,
        "Materials":            25,
        "Utilities":            18,
        "Consumer Staples":     18,
        "Communication Services": 30,
        "Technology":           25,
    }.get(sector, 30)
    macro_pts = sector_base * macro_stress

    score = (
        0.40 * comp_pts
        + 0.25 * growth_pts
        + 0.20 * eight_k_pts
        + 0.15 * macro_pts
    )
    # small per-firm jitter so identical inputs don't collide
    score += rng.uniform(-3.0, 3.0)
    return max(0.0, min(100.0, score))


# ---------------------------------------------------------------------------
# Risk-factor / AI-summary templates
# ---------------------------------------------------------------------------

RISK_FACTOR_LIBRARY = {
    "Financials": [
        "Concentration in commercial real estate lending",
        "Rising delinquency in subprime auto book",
        "Exposure to office-sector CMBS",
        "Net interest margin compression as deposit beta rises",
        "Regulatory scrutiny on overdraft and NSF fees",
        "Cyber-incident notification under NYDFS Part 500",
        "Unrealized losses in held-to-maturity Treasury portfolio",
        "Litigation reserve build for legacy mortgage origination",
    ],
    "Technology": [
        "Customer concentration risk — top 10 customers > 30% of revenue",
        "FX headwind from strengthening USD vs. EUR/JPY",
        "Antitrust scrutiny in App Store / advertising business",
        "Supply chain dependency on Taiwan-based foundry capacity",
        "AI-related capex outpacing operating cash flow growth",
        "Talent retention costs rising with stock-based comp inflation",
    ],
    "Healthcare": [
        "Medicare Advantage star-rating downgrade risk",
        "Patent cliff on legacy biologic franchise",
        "Drug pricing reform (IRA Part D redesign) margin pressure",
        "Cybersecurity event impacting claims-processing platform",
        "Provider-network adequacy regulatory exposure",
    ],
    "Consumer Discretionary": [
        "Consumer credit-card delinquency leading indicators softening",
        "Inventory shrink elevated in urban store footprint",
        "Trade-down behavior in middle-income cohort",
        "Lease commitments outpace same-store-sales growth",
    ],
    "Consumer Staples": [
        "Private-label market share gains in core categories",
        "Commodity input cost volatility (cocoa, sugar, aluminum)",
        "GLP-1 demand-disruption risk in snack categories",
    ],
    "Energy": [
        "Stranded-asset risk on long-cycle upstream projects",
        "Refining crack-spread compression",
        "Permian Basin gas-takeaway constraints",
        "Methane emissions regulatory exposure (EPA 60 OOOOb)",
    ],
    "Industrials": [
        "Aerospace OEM production-rate uncertainty",
        "Rail-volume sensitivity to industrial production",
        "Working-capital pressure from extended customer payment terms",
    ],
    "Utilities": [
        "Wildfire-liability exposure in service territory",
        "Rate-case timing uncertainty",
        "Capex program funding gap given cost-of-debt repricing",
    ],
    "Real Estate": [
        "Office-portfolio occupancy below 80%",
        "Refinancing wall through 2026-2027",
        "Cap-rate expansion compressing NAV",
        "Tenant credit deterioration in coworking exposure",
    ],
    "Materials": [
        "Chinese demand-cycle exposure",
        "Industrial-gas pricing power tested by long-term contracts",
    ],
    "Communication Services": [
        "Cord-cutting acceleration in linear TV portfolio",
        "Spectrum-auction capital requirements",
        "Content-amortization step-up as streaming originals expand",
    ],
}

AI_SUMMARY_TEMPLATES = {
    "high": (
        "{name}'s complaint velocity has accelerated meaningfully over the trailing four quarters, with "
        "{cv:.0f} complaints/quarter normalized for headcount well above peer median. Combined with "
        "{eight_k} 8-K filings over the past 90 days and {growth} revenue trajectory, we maintain a High "
        "risk view and recommend underweight positioning into the next reporting cycle."
    ),
    "elevated": (
        "{name} screens as Elevated risk: a {growth} top-line and {cv:.0f} normalized complaints/quarter "
        "suggest customer-facing friction is compounding. The {eight_k}-event 8-K cadence over 90 days "
        "warrants close monitoring around the upcoming filing window."
    ),
    "moderate": (
        "{name} sits in the Moderate risk band. Revenue trajectory is {growth}, complaint volume is in line "
        "with sector medians ({cv:.0f}/qtr normalized), and 8-K activity is unremarkable. We see no "
        "near-term catalyst that changes the constructive view."
    ),
    "low": (
        "{name} screens cleanly across our cross-source signal set — {growth} revenue, complaint velocity "
        "below peer median, and a benign 8-K profile. We maintain an overweight bias subject to macro "
        "conditions in {sector}."
    ),
}


def _growth_phrase(g: float | None) -> str:
    if g is None:        return "uneven"
    if g >= 0.15:        return "double-digit"
    if g >= 0.07:        return "healthy mid-single-digit"
    if g >= 0.02:        return "modest positive"
    if g >= -0.02:       return "essentially flat"
    if g >= -0.10:       return "softening"
    return "materially negative"


SECTOR_TO_MACRO = {
    "Financials":           ["DGS10", "T10Y2Y", "FEDFUNDS"],
    "Real Estate":          ["HOUST", "DGS10", "DGS30"],
    "Technology":           ["UMCSENT", "DGS10"],
    "Healthcare":           ["CPIAUCSL", "UNRATE"],
    "Consumer Discretionary": ["UMCSENT", "UNRATE"],
    "Consumer Staples":     ["CPIAUCSL", "UMCSENT"],
    "Energy":               ["GDP", "CPIAUCSL"],
    "Industrials":          ["GDP", "DGS10"],
    "Utilities":            ["DGS30", "DGS10"],
    "Materials":            ["GDP", "CPIAUCSL"],
    "Communication Services": ["UMCSENT", "DGS10"],
}


# ---------------------------------------------------------------------------
# Iceberg / pipeline metadata
# ---------------------------------------------------------------------------

def _iceberg_tables(rng: random.Random,
                    n_companies: int,
                    n_filings: int,
                    n_complaints: int,
                    n_macro_obs: int,
                    today: dt.date) -> list[dict[str, Any]]:
    iso = today.isoformat()
    return [
        # ── Bronze (raw landings) ─────────────────────────────────────────
        {
            "database": "bronze", "table": "sec_edgar_submissions_raw",
            "rows": n_companies * 5 + rng.randint(50, 200),
            "bytes": rng.randint(180_000_000, 240_000_000),
            "partitions": ["ingest_date"], "source_system": "sec_edgar",
            "last_updated_at": iso, "schema_columns": 28,
        },
        {
            "database": "bronze", "table": "sec_edgar_filings_raw",
            "rows": n_filings + rng.randint(500, 2000),
            "bytes": rng.randint(1_400_000_000, 1_900_000_000),
            "partitions": ["filing_year", "form_type"], "source_system": "sec_edgar",
            "last_updated_at": iso, "schema_columns": 19,
        },
        {
            "database": "bronze", "table": "fred_observations_raw",
            "rows": n_macro_obs + rng.randint(2000, 5000),
            "bytes": rng.randint(95_000_000, 145_000_000),
            "partitions": ["series_id"], "source_system": "fred",
            "last_updated_at": iso, "schema_columns": 6,
        },
        {
            "database": "bronze", "table": "cfpb_complaints_raw",
            "rows": n_complaints + rng.randint(50_000, 80_000),
            "bytes": rng.randint(580_000_000, 720_000_000),
            "partitions": ["received_year", "product"], "source_system": "cfpb",
            "last_updated_at": iso, "schema_columns": 23,
        },
        # ── Silver (cleaned, conformed) ───────────────────────────────────
        {
            "database": "silver", "table": "stg_companies",
            "rows": n_companies, "bytes": rng.randint(2_500_000, 4_500_000),
            "partitions": [], "source_system": "sec_edgar",
            "last_updated_at": iso, "schema_columns": 24,
        },
        {
            "database": "silver", "table": "stg_filings",
            "rows": n_filings, "bytes": rng.randint(45_000_000, 65_000_000),
            "partitions": ["filing_year"], "source_system": "sec_edgar",
            "last_updated_at": iso, "schema_columns": 14,
        },
        {
            "database": "silver", "table": "stg_complaints",
            "rows": n_complaints, "bytes": rng.randint(180_000_000, 240_000_000),
            "partitions": ["received_year"], "source_system": "cfpb",
            "last_updated_at": iso, "schema_columns": 19,
        },
        # ── Gold (analytics-ready) ────────────────────────────────────────
        {
            "database": "gold", "table": "dim_companies",
            "rows": n_companies, "bytes": rng.randint(800_000, 1_500_000),
            "partitions": [], "source_system": "derived",
            "last_updated_at": iso, "schema_columns": 27,
        },
        {
            "database": "gold", "table": "fct_filings",
            "rows": n_filings, "bytes": rng.randint(18_000_000, 28_000_000),
            "partitions": ["filing_year", "form_type"], "source_system": "derived",
            "last_updated_at": iso, "schema_columns": 11,
        },
        {
            "database": "gold", "table": "fct_macro_observations",
            "rows": n_macro_obs, "bytes": rng.randint(12_000_000, 18_000_000),
            "partitions": ["series_id"], "source_system": "derived",
            "last_updated_at": iso, "schema_columns": 5,
        },
        {
            "database": "gold", "table": "fct_complaints",
            "rows": n_complaints, "bytes": rng.randint(95_000_000, 135_000_000),
            "partitions": ["received_year", "topic_cluster"], "source_system": "derived",
            "last_updated_at": iso, "schema_columns": 18,
        },
        {
            "database": "gold", "table": "fct_company_risk_signal",
            "rows": n_companies, "bytes": rng.randint(900_000, 1_400_000),
            "partitions": [], "source_system": "derived",
            "last_updated_at": iso, "schema_columns": 14,
        },
    ]


def _pipeline_layers(rng: random.Random,
                     n_companies: int,
                     n_filings: int,
                     n_complaints: int,
                     n_macro_obs: int,
                     today: dt.date) -> list[dict[str, Any]]:
    iso = today.isoformat()
    bronze_total = n_companies * 6 + n_filings + n_complaints + n_macro_obs + rng.randint(80_000, 120_000)
    silver_total = n_companies + n_filings + n_complaints
    gold_total   = silver_total + n_macro_obs + n_companies  # + risk signal table
    return [
        {"layer": "connector", "rows_in": 0,                "rows_out": bronze_total,
         "tables": 4, "last_run": iso, "status": "ok"},
        {"layer": "bronze",    "rows_in": bronze_total,     "rows_out": bronze_total,
         "tables": 4, "last_run": iso, "status": "ok"},
        {"layer": "silver",    "rows_in": bronze_total,     "rows_out": silver_total,
         "tables": 3, "last_run": iso, "status": "ok"},
        {"layer": "gold",      "rows_in": silver_total,     "rows_out": gold_total,
         "tables": 5, "last_run": iso, "status": "ok"},
    ]


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def generate(n_companies: int = 60, seed: int = 42) -> dict[str, Any]:
    rng = random.Random(seed)
    today = dt.date.today()

    # ---- Trim/extend the seed list to n_companies ----------------------------
    universe = COMPANIES_SEED[:n_companies] if n_companies <= len(COMPANIES_SEED) else COMPANIES_SEED

    # =====================================================================
    # 1. Macro observations (computed first — used for sector stress signals)
    # =====================================================================
    macro_series_meta: list[dict[str, Any]] = []
    macro_observations: dict[str, list[dict[str, Any]]] = {}

    for (sid, title, units, freq, cat, start, drift, vol, bounds) in MACRO_SERIES_SEED:
        obs = _gen_macro_observations(rng, today, sid, title, units, freq, start, drift, vol, bounds)
        macro_observations[sid] = obs
        latest = obs[-1]["value"]
        prior  = obs[-2]["value"] if len(obs) >= 2 else None
        # yoy: roughly 252 trading days back for daily, 12 for monthly, 4 for quarterly
        lookback = {"Daily": 252, "Monthly": 12, "Quarterly": 4}.get(freq, 12)
        prior_yoy = obs[-1 - lookback]["value"] if len(obs) > lookback else None
        yoy_change = None
        if prior_yoy and prior_yoy != 0:
            yoy_change = round((latest - prior_yoy) / prior_yoy, 4)
        macro_series_meta.append({
            "series_id": sid,
            "title": title,
            "units": units,
            "frequency": freq,
            "category": cat,
            "latest_value": latest,
            "latest_date": obs[-1]["date"],
            "prior_value": prior,
            "yoy_change": yoy_change,
            "observations_count": len(obs),
        })

    # Macro stress factor used in risk: T10Y2Y inversion magnitude
    t10y2y_latest = next((s["latest_value"] for s in macro_series_meta if s["series_id"] == "T10Y2Y"), 0.5)
    macro_stress = max(0.5, min(1.5, 1.0 + (0.5 - t10y2y_latest) * 0.6))

    # =====================================================================
    # 2. Companies + Filings
    # =====================================================================
    companies: list[dict[str, Any]] = []
    filings: list[dict[str, Any]] = []
    company_eight_k_90d: dict[str, int] = {}

    for (ticker, name, sector, industry, exch, real_cik, city, st, emp, mkt_cap, rev_ttm) in universe:
        cik = _zero_padded_cik(real_cik, ticker)

        # Financial fundamentals
        margin = rng.uniform(0.05, 0.32) if sector != "Financials" else rng.uniform(0.18, 0.36)
        net_inc = int(rev_ttm * margin)
        # banks have huge balance sheets
        assets_mult = rng.uniform(8.0, 14.0) if sector == "Financials" else rng.uniform(0.6, 1.8)
        total_assets = int(rev_ttm * assets_mult)
        liab_pct = rng.uniform(0.85, 0.92) if sector == "Financials" else rng.uniform(0.40, 0.70)
        total_liab = int(total_assets * liab_pct)
        growth_yoy = rng.gauss(0.06, 0.09)  # 6% mean, 9% sd
        # Bias some sectors negative
        if sector in ("Real Estate", "Energy"):
            growth_yoy -= 0.05
        growth_yoy = round(growth_yoy, 4)

        # ─── Filings: 4 years of 10-K + 10-Q + 8-K cadence ────────────────
        company_filings: list[dict[str, Any]] = []
        # Number of 8-K events skews higher for at-risk firms — preview via growth
        eight_k_intensity = 1.0
        if growth_yoy < -0.05: eight_k_intensity = 1.8
        elif growth_yoy < 0:   eight_k_intensity = 1.4

        for years_back in range(4):
            year = today.year - years_back
            # 10-K (annual): filed ~60-90 days after fiscal year end
            fy_end = dt.date(year - 1, 12, 31) if years_back > 0 else dt.date(year - 1, 12, 31)
            ten_k_date = fy_end + dt.timedelta(days=rng.randint(45, 90))
            if ten_k_date <= today:
                company_filings.append({
                    "accession_no": _accession(rng, cik, ten_k_date.year),
                    "cik": cik, "ticker": ticker, "company_name": name,
                    "form_type": "10-K",
                    "filing_date": ten_k_date.isoformat(),
                    "period_of_report": fy_end.isoformat(),
                    "filing_url": f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type=10-K",
                    "items": None,
                    "primary_topic": "Annual Report",
                    "word_count": rng.randint(85_000, 145_000),
                })

            # 10-Q quarterly: 3 per year
            for q in (1, 2, 3):
                q_end = dt.date(year, q * 3, 28)
                q_filing = q_end + dt.timedelta(days=rng.randint(30, 55))
                if q_filing > today:  continue
                company_filings.append({
                    "accession_no": _accession(rng, cik, q_filing.year),
                    "cik": cik, "ticker": ticker, "company_name": name,
                    "form_type": "10-Q",
                    "filing_date": q_filing.isoformat(),
                    "period_of_report": q_end.isoformat(),
                    "filing_url": f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type=10-Q",
                    "items": None,
                    "primary_topic": "Quarterly Report",
                    "word_count": rng.randint(28_000, 52_000),
                })

            # 8-K event-driven: 4-10 per year, scaled by stress
            n_8k = int(rng.randint(4, 10) * eight_k_intensity)
            ITEM_OPTIONS = [
                ("2.02", "Results of Operations and Financial Condition"),
                ("5.02", "Departure of Directors or Certain Officers"),
                ("1.01", "Entry into a Material Definitive Agreement"),
                ("8.01", "Other Events"),
                ("7.01", "Regulation FD Disclosure"),
                ("3.02", "Unregistered Sales of Equity Securities"),
                ("5.07", "Submission of Matters to a Vote of Security Holders"),
                ("2.05", "Costs Associated with Exit or Disposal Activities"),
            ]
            for _ in range(n_8k):
                day_in_year = rng.randint(1, 365)
                # don't allow future dates
                ed = dt.date(year, 1, 1) + dt.timedelta(days=day_in_year - 1)
                if ed > today: continue
                n_items = rng.randint(1, 3)
                items = rng.sample(ITEM_OPTIONS, n_items)
                primary = items[0][1]
                company_filings.append({
                    "accession_no": _accession(rng, cik, ed.year),
                    "cik": cik, "ticker": ticker, "company_name": name,
                    "form_type": "8-K",
                    "filing_date": ed.isoformat(),
                    "period_of_report": ed.isoformat(),
                    "filing_url": f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type=8-K",
                    "items": [f"{code} {label}" for code, label in items],
                    "primary_topic": primary,
                    "word_count": rng.randint(800, 5500),
                })

        company_filings.sort(key=lambda f: f["filing_date"], reverse=True)
        filings.extend(company_filings)

        # 8-K count in last 90 days (used in risk score)
        ninety = today - dt.timedelta(days=90)
        eight_k_90 = sum(
            1 for f in company_filings
            if f["form_type"] == "8-K" and dt.date.fromisoformat(f["filing_date"]) >= ninety
        )
        company_eight_k_90d[cik] = eight_k_90

        last_filing = company_filings[0]["filing_date"] if company_filings else None

        companies.append({
            "cik": cik,
            "ticker": ticker,
            "name": name,
            "sector": sector,
            "industry": industry,
            "exchange": exch,
            "market_cap": mkt_cap,
            "employees": emp,
            "hq_city": city,
            "hq_state": st,
            "description": f"{name} is a {industry.lower()} company headquartered in {city}, {st}.",
            "revenue_ttm": rev_ttm,
            "net_income_ttm": net_inc,
            "total_assets": total_assets,
            "total_liabilities": total_liab,
            "revenue_growth_yoy": growth_yoy,
            "net_margin": round(margin, 4),
            "risk_score": 0.0,       # filled below once complaints are known
            "risk_bucket": "low",
            "complaint_velocity": 0.0,
            "filings_count_ttm": sum(
                1 for f in company_filings
                if dt.date.fromisoformat(f["filing_date"]) >= today - dt.timedelta(days=365)
            ),
            "last_filing_date": last_filing,
            "last_complaint_date": None,
        })

    # =====================================================================
    # 3. Complaints: ~3000 total, weighted toward big banks / card issuers
    # =====================================================================
    cik_by_ticker = {c["ticker"]: c["cik"] for c in companies}
    name_by_cik   = {c["cik"]: c["name"]  for c in companies}

    # Per-ticker complaint weighting
    COMPLAINT_WEIGHTS: dict[str, float] = {
        # Big banks
        "JPM": 380, "BAC": 360, "WFC": 340, "C": 280,
        # Regional / consumer banks
        "USB": 110, "PNC": 95, "BK": 30, "STT": 12,
        # Credit card issuers
        "AXP": 150, "COF": 240, "DFS": 110, "V": 60, "MA": 55,
        # Investment & asset
        "MS": 45, "GS": 35, "SCHW": 80, "BLK": 10,
        # Insurance
        "ALL": 70, "MET": 50, "PRU": 45, "AIG": 35, "TRV": 30, "CB": 20,
        # Exchanges / processors
        "ICE": 5,  "CME": 5,
        # Non-financials with some complaints (mortgage servicing arms, store cards, etc.)
        "AMZN": 25, "WMT": 20, "AAPL": 15, "HD": 12,
    }
    total_target = 3000
    weighted_pool: list[tuple[str, float]] = []
    for c in companies:
        w = COMPLAINT_WEIGHTS.get(c["ticker"])
        if w is None:
            # Default trickle for non-financials: 0 to 8
            w = 4 if c["sector"] == "Financials" else 1
        weighted_pool.append((c["ticker"], w))

    total_weight = sum(w for _, w in weighted_pool)
    company_quota = {
        tkr: max(0, int(round(w / total_weight * total_target)))
        for tkr, w in weighted_pool
    }

    complaints: list[dict[str, Any]] = []
    complaint_seq = 0
    company_complaint_dates: dict[str, list[str]] = {c["cik"]: [] for c in companies}

    for c in companies:
        quota = company_quota.get(c["ticker"], 0)
        if quota == 0:
            continue
        for _ in range(quota):
            # Pick a product weighted by realistic CFPB mix
            product_choices = [(p, w) for (p, _subs, w, _topic) in [
                (p[0], p[1], p[2], p[3]) for p in PRODUCTS
            ]]
            product = _weighted_choice(rng, product_choices)
            # Find product metadata
            prod_meta = next(p for p in PRODUCTS if p[0] == product)
            _, subs, _w, default_topic = prod_meta
            sub_product = rng.choice(subs)
            issues = ISSUES_BY_PRODUCT[product]
            issue = rng.choice(issues)
            # Sub-issue is a synthesized variant
            sub_issue = rng.choice([
                "Information belongs to someone else",
                "Account status incorrect",
                "Account information incorrect",
                "Their investigation did not fix an error",
                "Debt is not yours",
                "Was not notified of investigation",
                "Account opened as a result of fraud",
                None,
            ])
            # Topic cluster: 70% default mapping, 30% spread across other clusters
            if rng.random() < 0.70:
                topic = default_topic
            else:
                topic = rng.choice(TOPIC_CLUSTERS)

            days_ago = rng.randint(1, 720)
            received = today - dt.timedelta(days=days_ago)
            state = rng.choice(STATES)
            zip_prefix = f"{rng.randint(100, 999)}xx"
            has_narrative = rng.random() < 0.55
            consumer_consent = has_narrative and rng.random() < 0.85
            timely = rng.random() < 0.94
            disputed = (rng.random() < 0.12) if rng.random() < 0.50 else None

            narrative_summary = None
            if has_narrative:
                narrative_summary = rng.choice([
                    "Consumer reports unauthorized account activity that was not promptly investigated.",
                    "Servicer failed to apply payment on the date received, triggering late fees.",
                    "Dispute filed against trade-line was closed without sufficient investigation.",
                    "Collection attempt on a debt that consumer believes was previously settled.",
                    "Branch staff refused to provide required disclosures at account opening.",
                    "Account was charged off despite ongoing modification negotiations.",
                ])

            resolution = rng.choice([
                "Closed with explanation",
                "Closed with non-monetary relief",
                "Closed with monetary relief",
                "Closed without relief",
                "In progress",
            ])

            complaint_seq += 1
            cid = f"CFPB-{8_400_000 + complaint_seq:08d}"
            complaints.append({
                "complaint_id": cid,
                "date_received": received.isoformat(),
                "product": product,
                "sub_product": sub_product,
                "issue": issue,
                "sub_issue": sub_issue,
                "company": c["name"],
                "company_normalized": c["name"].upper(),
                "cik": c["cik"],
                "state": state,
                "zip_prefix": zip_prefix,
                "consumer_consent": consumer_consent,
                "has_narrative": has_narrative,
                "narrative_summary": narrative_summary,
                "resolution": resolution,
                "timely_response": timely,
                "consumer_disputed": disputed,
                "topic_cluster": topic,
            })
            company_complaint_dates[c["cik"]].append(received.isoformat())

    # =====================================================================
    # 4. Backfill complaint velocity + risk score onto each company
    # =====================================================================
    for c in companies:
        dates = sorted(company_complaint_dates[c["cik"]], reverse=True)
        c["last_complaint_date"] = dates[0] if dates else None
        # complaints per quarter (last 4 quarters)
        four_q_cutoff = today - dt.timedelta(days=365)
        recent = [d for d in dates if dt.date.fromisoformat(d) >= four_q_cutoff]
        c["complaint_velocity"] = round(len(recent) / 4.0, 2)

        score = _risk_score(
            rng,
            c["sector"],
            c["complaint_velocity"],
            c["employees"] or 1,
            c["revenue_growth_yoy"],
            company_eight_k_90d.get(c["cik"], 0),
            macro_stress,
        )
        c["risk_score"] = round(score, 2)
        c["risk_bucket"] = _bucket(score)

    # Apply target risk distribution: bias bucket assignment to hit 10/20/40/30
    companies.sort(key=lambda x: x["risk_score"], reverse=True)
    n = len(companies)
    high_cut     = int(n * 0.10)
    elevated_cut = int(n * 0.30)
    moderate_cut = int(n * 0.70)
    for i, c in enumerate(companies):
        if   i < high_cut:     c["risk_bucket"] = "high"
        elif i < elevated_cut: c["risk_bucket"] = "elevated"
        elif i < moderate_cut: c["risk_bucket"] = "moderate"
        else:                  c["risk_bucket"] = "low"
    # re-sort by market_cap for default presentation
    companies.sort(key=lambda x: -(x["market_cap"] or 0))

    # =====================================================================
    # 5. CompanyDetail bundles for first 30 (by market cap)
    # =====================================================================
    company_details: dict[str, dict[str, Any]] = {}
    filings_by_cik: dict[str, list[dict[str, Any]]] = {}
    for f in filings:
        filings_by_cik.setdefault(f["cik"], []).append(f)
    complaints_by_cik: dict[str, list[dict[str, Any]]] = {}
    for cmp in complaints:
        if cmp["cik"]:
            complaints_by_cik.setdefault(cmp["cik"], []).append(cmp)

    macro_meta_by_id = {m["series_id"]: m for m in macro_series_meta}

    for c in companies[:30]:
        sector = c["sector"]
        risk_factors_pool = RISK_FACTOR_LIBRARY.get(sector, RISK_FACTOR_LIBRARY["Industrials"])
        n_rf = rng.randint(4, 6)
        risk_factors = rng.sample(risk_factors_pool, min(n_rf, len(risk_factors_pool)))

        ai_template = AI_SUMMARY_TEMPLATES[c["risk_bucket"]]
        ai_summary = ai_template.format(
            name=c["name"],
            cv=c["complaint_velocity"],
            growth=_growth_phrase(c["revenue_growth_yoy"]),
            eight_k=company_eight_k_90d.get(c["cik"], 0),
            sector=sector,
        )

        related_ids = SECTOR_TO_MACRO.get(sector, ["DGS10", "UMCSENT"])
        related_macro = [macro_meta_by_id[sid] for sid in related_ids if sid in macro_meta_by_id]

        detail = dict(c)  # CompanyDetail extends Company
        detail["filings"]              = filings_by_cik.get(c["cik"], [])[:25]
        detail["complaints"]           = complaints_by_cik.get(c["cik"], [])[:50]
        detail["related_macro_series"] = related_macro
        detail["risk_factors"]         = risk_factors
        detail["ai_summary"]           = ai_summary

        company_details[c["cik"]] = {"company": detail}

    # =====================================================================
    # 6. Iceberg / pipeline / summary
    # =====================================================================
    n_filings = len(filings)
    n_complaints = len(complaints)
    n_macro_obs  = sum(len(v) for v in macro_observations.values())

    iceberg = _iceberg_tables(rng, n_companies=len(companies),
                              n_filings=n_filings,
                              n_complaints=n_complaints,
                              n_macro_obs=n_macro_obs,
                              today=today)
    pipeline = _pipeline_layers(rng, n_companies=len(companies),
                                n_filings=n_filings,
                                n_complaints=n_complaints,
                                n_macro_obs=n_macro_obs,
                                today=today)

    bronze_rows = sum(t["rows"] for t in iceberg if t["database"] == "bronze")
    silver_rows = sum(t["rows"] for t in iceberg if t["database"] == "silver")
    gold_rows   = sum(t["rows"] for t in iceberg if t["database"] == "gold")
    s3_bytes    = sum(t["bytes"] for t in iceberg)

    summary: dict[str, Any] = {
        "total_companies":         len(companies),
        "total_filings":           n_filings,
        "total_complaints":        n_complaints,
        "total_macro_series":      len(macro_series_meta),
        "total_macro_observations": n_macro_obs,
        "bronze_rows":             bronze_rows,
        "silver_rows":             silver_rows,
        "gold_rows":                gold_rows,
        "iceberg_table_count":     len(iceberg),
        "s3_bytes":                s3_bytes,
        "last_sync_at":            today.isoformat(),
    }

    return {
        "summary":             summary,
        "companies":           companies,
        "filings":             filings,
        "complaints":          complaints,
        "macro_series":        macro_series_meta,
        "macro_observations":  macro_observations,
        "iceberg_tables":      iceberg,
        "pipeline_layers":     pipeline,
        "company_details":     company_details,
    }
