"""
Load generated Epic Clarity data into AWS RDS SQL Server.
Uses pymssql (no ODBC driver required).
"""

import os
import sys
import csv
import logging
import time
from dotenv import load_dotenv
import pymssql

# Setup logging
log_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'logs')
os.makedirs(log_dir, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(os.path.join(log_dir, 'load_errors.log')),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

load_dotenv()

SQLSERVER_HOST     = os.getenv('SQLSERVER_HOST')
SQLSERVER_PORT     = int(os.getenv('SQLSERVER_PORT', '1433'))
SQLSERVER_USERNAME = os.getenv('SQLSERVER_USERNAME')
SQLSERVER_PASSWORD = os.getenv('SQLSERVER_PASSWORD')
SQLSERVER_DATABASE = os.getenv('SQLSERVER_DATABASE', 'HEALTHCAREDEMO')
SCHEMA_NAME        = os.getenv('SCHEMA_NAME', 'CLARITY')
DATA_DIR           = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'raw')

# Table definitions with SQL Server data types
TABLE_DEFINITIONS = {
    'ZC_RACE': {
        'columns': [('RACE_C', 'INT PRIMARY KEY'), ('NAME', 'VARCHAR(100)')]
    },
    'ZC_ENC_TYPE': {
        'columns': [('ENC_TYPE_C', 'INT PRIMARY KEY'), ('NAME', 'VARCHAR(100)')]
    },
    'PATIENT': {
        'columns': [
            ('PAT_ID', 'INT PRIMARY KEY'), ('PAT_MRN_ID', 'VARCHAR(50) UNIQUE'),
            ('PAT_FIRST_NAME', 'VARCHAR(100)'), ('PAT_LAST_NAME', 'VARCHAR(100)'),
            ('BIRTH_DATE', 'DATE'), ('SEX', 'CHAR(1)'), ('ZIP', 'VARCHAR(10)'),
            ('PAT_STATUS', 'VARCHAR(20)')
        ],
        'indexes': ['PAT_MRN_ID']
    },
    'PATIENT_RACE': {
        'columns': [('PAT_ID', 'INT'), ('RACE_C', 'INT')],
        'indexes': ['PAT_ID']
    },
    'CLARITY_DEP': {
        'columns': [
            ('DEPARTMENT_ID', 'INT PRIMARY KEY'), ('DEPARTMENT_NAME', 'VARCHAR(200)'),
            ('SPECIALTY_DEP_C', 'INT'), ('REV_LOC_ID', 'INT'), ('SERV_AREA_ID', 'INT')
        ]
    },
    'CLARITY_SER': {
        'columns': [
            ('PROV_ID', 'INT PRIMARY KEY'), ('PROV_NAME', 'VARCHAR(200)'),
            ('PROV_TYPE', 'VARCHAR(100)'), ('CLINICIAN_TITLE', 'VARCHAR(50)'),
            ('CLINICIAN_TYPE_C', 'INT'), ('DEPARTMENT_ID', 'INT')
        ],
        'indexes': ['DEPARTMENT_ID']
    },
    'CLARITY_EDG': {
        'columns': [
            ('DX_ID', 'INT PRIMARY KEY'), ('DX_NAME', 'VARCHAR(500)'),
            ('ICD9_CODE', 'VARCHAR(20)'), ('ICD10_CODE', 'VARCHAR(20)')
        ],
        'indexes': ['ICD10_CODE']
    },
    'CLARITY_EAP': {
        'columns': [
            ('PROC_ID', 'INT PRIMARY KEY'), ('PROC_NAME', 'VARCHAR(500)'),
            ('PROC_CODE', 'VARCHAR(50)'), ('TYPE_C', 'INT')
        ]
    },
    'CLARITY_MEDICATION': {
        'columns': [
            ('MEDICATION_ID', 'INT PRIMARY KEY'), ('NAME', 'VARCHAR(500)'),
            ('GENERIC_NAME', 'VARCHAR(500)'), ('THERA_CLASS_C', 'INT'),
            ('PHARM_CLASS_C', 'INT')
        ]
    },
    'PAT_ENC': {
        'columns': [
            ('PAT_ENC_CSN_ID', 'INT PRIMARY KEY'), ('PAT_ID', 'INT'),
            ('CONTACT_DATE', 'DATE'), ('ENC_TYPE_C', 'INT'),
            ('VISIT_PROV_ID', 'INT'), ('DEPARTMENT_ID', 'INT'),
            ('HOSP_ADMSN_TIME', 'DATETIME'), ('HOSP_DISCH_TIME', 'DATETIME')
        ],
        'indexes': ['PAT_ID', 'CONTACT_DATE']
    },
    'PAT_ENC_DX': {
        'columns': [
            ('PAT_ENC_CSN_ID', 'INT'), ('LINE', 'INT'),
            ('DX_ID', 'INT'), ('PRIMARY_DX_YN', 'CHAR(1)')
        ],
        'indexes': ['PAT_ENC_CSN_ID', 'DX_ID']
    },
    'ORDER_PROC': {
        'columns': [
            ('ORDER_PROC_ID', 'INT PRIMARY KEY'), ('PAT_ENC_CSN_ID', 'INT'),
            ('PAT_ID', 'INT'), ('PROC_ID', 'INT'), ('ORDER_TIME', 'DATETIME'),
            ('ORDER_STATUS_C', 'INT'), ('RESULT_TIME', 'DATETIME')
        ],
        'indexes': ['PAT_ENC_CSN_ID', 'PAT_ID']
    },
    'ORDER_RESULTS': {
        'columns': [
            ('ORDER_PROC_ID', 'INT'), ('LINE', 'INT'), ('RESULT_VALUE', 'VARCHAR(500)'),
            ('RESULT_FLAG_C', 'VARCHAR(10)'), ('REFERENCE_LOW', 'VARCHAR(50)'),
            ('REFERENCE_HIGH', 'VARCHAR(50)'), ('RESULT_UNIT', 'VARCHAR(50)')
        ],
        'indexes': ['ORDER_PROC_ID']
    },
    'ORDER_MED': {
        'columns': [
            ('ORDER_MED_ID', 'INT PRIMARY KEY'), ('PAT_ENC_CSN_ID', 'INT'),
            ('PAT_ID', 'INT'), ('MEDICATION_ID', 'INT'), ('ORDER_INST', 'DATETIME'),
            ('MED_ROUTE_C', 'INT'), ('HV_DOSE_UNIT_C', 'INT'),
            ('MIN_DISCRETE_DOSE', 'DECIMAL(18,2)')
        ],
        'indexes': ['PAT_ENC_CSN_ID', 'PAT_ID']
    },
    'HSP_ACCOUNT': {
        'columns': [
            ('HSP_ACCOUNT_ID', 'INT PRIMARY KEY'), ('PAT_ID', 'INT'),
            ('PAT_ENC_CSN_ID', 'INT'), ('ACCOUNT_TYPE_C', 'INT'),
            ('TOT_CHARGES', 'DECIMAL(18,2)'), ('TOT_PMTS', 'DECIMAL(18,2)'),
            ('TOT_ADJ', 'DECIMAL(18,2)')
        ],
        'indexes': ['PAT_ID', 'PAT_ENC_CSN_ID']
    },
    'ARPB_TRANSACTIONS': {
        'columns': [
            ('TX_ID', 'INT PRIMARY KEY'), ('HSP_ACCOUNT_ID', 'INT'),
            ('TX_TYPE_C', 'INT'), ('TX_AMOUNT', 'DECIMAL(18,2)'),
            ('POST_DATE', 'DATE'), ('VOID_DATE', 'DATE')
        ],
        'indexes': ['HSP_ACCOUNT_ID', 'POST_DATE']
    }
}

LOAD_ORDER = [
    'ZC_RACE', 'ZC_ENC_TYPE', 'PATIENT', 'PATIENT_RACE',
    'CLARITY_DEP', 'CLARITY_SER', 'CLARITY_EDG', 'CLARITY_EAP',
    'CLARITY_MEDICATION', 'PAT_ENC', 'PAT_ENC_DX', 'ORDER_PROC',
    'ORDER_RESULTS', 'ORDER_MED', 'HSP_ACCOUNT', 'ARPB_TRANSACTIONS'
]


def get_connection(database='master'):
    """Create a pymssql connection."""
    if not SQLSERVER_HOST:
        logger.error("SQLSERVER_HOST not set in .env")
        sys.exit(1)
    return pymssql.connect(
        server=SQLSERVER_HOST,
        port=SQLSERVER_PORT,
        user=SQLSERVER_USERNAME,
        password=SQLSERVER_PASSWORD,
        database=database,
        timeout=30,
        login_timeout=15
    )


def ensure_database(conn):
    """Create HEALTHCAREDEMO database if it doesn't exist."""
    # CREATE DATABASE cannot run inside a transaction — use autocommit connection
    conn_ac = pymssql.connect(
        server=SQLSERVER_HOST, port=SQLSERVER_PORT,
        user=SQLSERVER_USERNAME, password=SQLSERVER_PASSWORD,
        database='master', autocommit=True, timeout=30
    )
    cursor = conn_ac.cursor()
    cursor.execute(
        f"IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = '{SQLSERVER_DATABASE}') "
        f"CREATE DATABASE [{SQLSERVER_DATABASE}]"
    )
    cursor.close()
    conn_ac.close()
    logger.info(f"Database {SQLSERVER_DATABASE} ready")


def create_schema(conn):
    """Create CLARITY schema if it doesn't exist."""
    cursor = conn.cursor()
    cursor.execute(
        f"IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = '{SCHEMA_NAME}') "
        f"EXEC('CREATE SCHEMA {SCHEMA_NAME}')"
    )
    conn.commit()
    cursor.close()
    logger.info(f"Schema {SCHEMA_NAME} ready")


def drop_table_if_exists(conn, table_name):
    cursor = conn.cursor()
    cursor.execute(f"IF OBJECT_ID('{SCHEMA_NAME}.{table_name}', 'U') IS NOT NULL "
                   f"DROP TABLE {SCHEMA_NAME}.{table_name}")
    conn.commit()
    cursor.close()


def create_table(conn, table_name, definition):
    col_defs = ', '.join(f'{c[0]} {c[1]}' for c in definition['columns'])
    sql = f"CREATE TABLE {SCHEMA_NAME}.{table_name} ({col_defs})"
    cursor = conn.cursor()
    cursor.execute(sql)
    conn.commit()
    cursor.close()
    logger.info(f"  Created {SCHEMA_NAME}.{table_name}")


def load_csv_to_table(conn, table_name, csv_file):
    """Batch-insert CSV rows using %s placeholders (pymssql style)."""
    with open(csv_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    if not rows:
        logger.warning(f"  No data in {csv_file}")
        return 0

    columns = list(rows[0].keys())
    placeholders = ', '.join(['%s'] * len(columns))
    insert_sql = (f"INSERT INTO {SCHEMA_NAME}.{table_name} "
                  f"({', '.join(columns)}) VALUES ({placeholders})")

    batch_size = 2000
    total = 0
    cursor = conn.cursor()

    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        values = [
            tuple(v if v != '' else None for v in row.values())
            for row in batch
        ]
        cursor.executemany(insert_sql, values)
        conn.commit()
        total += len(batch)
        if total % 5000 == 0:
            logger.info(f"    {total:,} rows loaded...")

    cursor.close()
    logger.info(f"  Loaded {total:,} rows into {SCHEMA_NAME}.{table_name}")
    return total


def create_indexes(conn, table_name, definition):
    if 'indexes' not in definition:
        return
    cursor = conn.cursor()
    for col in definition['indexes']:
        idx = f"IX_{table_name}_{col}"
        try:
            cursor.execute(
                f"IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = '{idx}') "
                f"CREATE INDEX {idx} ON {SCHEMA_NAME}.{table_name} ({col})"
            )
            conn.commit()
        except Exception as e:
            logger.warning(f"  Index {idx} skipped: {e}")
    cursor.close()


def get_row_count(conn, table_name):
    cursor = conn.cursor()
    cursor.execute(f"SELECT COUNT(*) FROM {SCHEMA_NAME}.{table_name}")
    count = cursor.fetchone()[0]
    cursor.close()
    return count


def main():
    logger.info("=" * 60)
    logger.info("STARTING DATA LOAD TO AWS RDS SQL SERVER")
    logger.info("=" * 60)
    logger.info(f"Host:     {SQLSERVER_HOST}")
    logger.info(f"Database: {SQLSERVER_DATABASE}")
    logger.info(f"Schema:   {SCHEMA_NAME}")
    logger.info(f"Data dir: {DATA_DIR}")
    logger.info("=" * 60)

    if not os.path.exists(DATA_DIR):
        logger.error(f"Data directory not found: {DATA_DIR}. Run generate_data.py first.")
        sys.exit(1)

    # Step 1 — create the database (autocommit connection to master)
    logger.info("Ensuring database exists...")
    ensure_database(None)  # uses its own internal connection

    # Step 2 — connect to HEALTHCAREDEMO and load data
    logger.info(f"Connecting to {SQLSERVER_DATABASE}...")
    conn = get_connection(database=SQLSERVER_DATABASE)

    try:
        create_schema(conn)

        row_counts = {}
        for table_name in LOAD_ORDER:
            logger.info(f"\nProcessing {table_name}...")
            csv_file = os.path.join(DATA_DIR, f'{table_name}.csv')
            if not os.path.exists(csv_file):
                logger.warning(f"  CSV not found: {csv_file} — skipping")
                continue
            drop_table_if_exists(conn, table_name)
            create_table(conn, table_name, TABLE_DEFINITIONS[table_name])
            row_counts[table_name] = load_csv_to_table(conn, table_name, csv_file)
            create_indexes(conn, table_name, TABLE_DEFINITIONS[table_name])

        # Final summary
        logger.info("\n" + "=" * 60)
        logger.info("LOAD COMPLETE — VALIDATION SUMMARY")
        logger.info("=" * 60)
        total_rows = 0
        for table_name in LOAD_ORDER:
            if table_name in row_counts:
                actual = get_row_count(conn, table_name)
                total_rows += actual
                logger.info(f"  [OK] {SCHEMA_NAME}.{table_name}: {actual:,} rows")
        logger.info(f"\n  Total rows loaded: {total_rows:,}")
        logger.info("=" * 60)

    except Exception as e:
        logger.error(f"Fatal error: {e}")
        raise
    finally:
        conn.close()


if __name__ == '__main__':
    main()
