"""
Validation script to check the status of all components.

This script provides a comprehensive health check of the entire pipeline.
"""

import os
import sys
import logging
from dotenv import load_dotenv
import pyodbc
import requests
from datetime import datetime

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Configuration
RDS_ENDPOINT = os.getenv('RDS_ENDPOINT')
RDS_PORT = os.getenv('RDS_PORT', '1433')
RDS_USERNAME = os.getenv('RDS_USERNAME')
RDS_PASSWORD = os.getenv('RDS_PASSWORD')
DB_NAME = os.getenv('DB_NAME', 'HEALTHCAREDEMO')
SCHEMA_NAME = os.getenv('SCHEMA_NAME', 'CLARITY')
FIVETRAN_API_KEY = os.getenv('FIVETRAN_API_KEY')
FIVETRAN_API_SECRET = os.getenv('FIVETRAN_API_SECRET')

FIVETRAN_API_BASE = 'https://api.fivetran.com/v1'


def print_section(title):
    """Print formatted section header."""
    logger.info("\n" + "="*60)
    logger.info(title)
    logger.info("="*60)


def check_rds_status():
    """Check RDS instance status and connectivity."""
    print_section("1. AWS RDS SQL SERVER STATUS")
    
    if not RDS_ENDPOINT:
        logger.error("[ERROR] RDS_ENDPOINT not configured in .env")
        return False
    
    try:
        conn_str = (
            f'DRIVER={{ODBC Driver 17 for SQL Server}};'
            f'SERVER={RDS_ENDPOINT},{RDS_PORT};'
            f'DATABASE={DB_NAME};'
            f'UID={RDS_USERNAME};'
            f'PWD={RDS_PASSWORD}'
        )
        
        logger.info(f"Connecting to {RDS_ENDPOINT}...")
        conn = pyodbc.connect(conn_str, timeout=10)
        cursor = conn.cursor()
        
        # Check database
        cursor.execute("SELECT @@VERSION")
        version = cursor.fetchone()[0]
        logger.info(f"[OK] Connected successfully")
        logger.info(f"  SQL Server Version: {version.split('\\n')[0]}")
        
        # Check schema
        cursor.execute(f"""
            SELECT COUNT(*) 
            FROM sys.schemas 
            WHERE name = '{SCHEMA_NAME}'
        """)
        schema_exists = cursor.fetchone()[0] > 0
        
        if schema_exists:
            logger.info(f"[OK] Schema '{SCHEMA_NAME}' exists")
        else:
            logger.warning(f"[WARN] Schema '{SCHEMA_NAME}' not found")
        
        cursor.close()
        conn.close()
        return True
        
    except Exception as e:
        logger.error(f"[ERROR] RDS connection failed: {e}")
        return False


def check_table_row_counts():
    """Check row counts for all tables."""
    print_section("2. TABLE ROW COUNTS")
    
    tables = [
        'ZC_RACE', 'ZC_ENC_TYPE', 'PATIENT', 'PATIENT_RACE',
        'CLARITY_DEP', 'CLARITY_SER', 'CLARITY_EDG', 'CLARITY_EAP',
        'CLARITY_MEDICATION', 'PAT_ENC', 'PAT_ENC_DX', 'ORDER_PROC',
        'ORDER_RESULTS', 'ORDER_MED', 'HSP_ACCOUNT', 'ARPB_TRANSACTIONS'
    ]
    
    try:
        conn_str = (
            f'DRIVER={{ODBC Driver 17 for SQL Server}};'
            f'SERVER={RDS_ENDPOINT},{RDS_PORT};'
            f'DATABASE={DB_NAME};'
            f'UID={RDS_USERNAME};'
            f'PWD={RDS_PASSWORD}'
        )
        
        conn = pyodbc.connect(conn_str, timeout=10)
        cursor = conn.cursor()
        
        total_rows = 0
        for table in tables:
            try:
                cursor.execute(f"SELECT COUNT(*) FROM {SCHEMA_NAME}.{table}")
                count = cursor.fetchone()[0]
                total_rows += count
                logger.info(f"  {SCHEMA_NAME}.{table}: {count:,} rows")
            except Exception as e:
                logger.warning(f"  {SCHEMA_NAME}.{table}: Error - {e}")
        
        logger.info(f"\nTotal rows across all tables: {total_rows:,}")
        
        cursor.close()
        conn.close()
        return True
        
    except Exception as e:
        logger.error(f"[ERROR] Error checking table counts: {e}")
        return False


def check_fivetran_status():
    """Check Fivetran connector status."""
    print_section("3. FIVETRAN CONNECTOR STATUS")
    
    if not FIVETRAN_API_KEY or not FIVETRAN_API_SECRET:
        logger.warning("[WARN] Fivetran credentials not configured in .env")
        return False
    
    try:
        # List connectors
        url = f'{FIVETRAN_API_BASE}/connectors'
        response = requests.get(url, auth=(FIVETRAN_API_KEY, FIVETRAN_API_SECRET))
        response.raise_for_status()
        
        data = response.json()
        connectors = data.get('data', {}).get('items', [])
        
        # Filter to healthcare connectors
        healthcare_connectors = [
            c for c in connectors 
            if 'healthcare' in c.get('schema', '').lower() or 
               'clarity' in c.get('schema', '').lower()
        ]
        
        if not healthcare_connectors:
            logger.warning("[WARN] No healthcare-related connectors found")
            return False
        
        for connector in healthcare_connectors:
            logger.info(f"\nConnector: {connector.get('id')}")
            logger.info(f"  Schema: {connector.get('schema')}")
            logger.info(f"  Service: {connector.get('service')}")
            
            status = connector.get('status', {})
            logger.info(f"  Sync State: {status.get('sync_state')}")
            logger.info(f"  Setup State: {status.get('setup_state')}")
            logger.info(f"  Update State: {status.get('update_state')}")
            
            if status.get('setup_state') == 'connected':
                logger.info("  [OK] Connector is healthy")
            else:
                logger.warning(f"  [WARN] Connector state: {status.get('setup_state')}")
        
        return True
        
    except Exception as e:
        logger.error(f"[ERROR] Error checking Fivetran status: {e}")
        return False


def check_dbt_project():
    """Check dbt project structure."""
    print_section("4. DBT PROJECT STATUS")
    
    dbt_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'transform')
    
    required_files = [
        'dbt_project.yml',
        'profiles.yml',
        'packages.yml'
    ]
    
    required_dirs = [
        'models/staging',
        'models/intermediate',
        'models/marts/clinical',
        'models/marts/financial',
        'tests',
        'macros',
        'seeds'
    ]
    
    all_good = True
    
    # Check files
    for file in required_files:
        path = os.path.join(dbt_dir, file)
        if os.path.exists(path):
            logger.info(f"[OK] {file}")
        else:
            logger.error(f"[ERROR] {file} not found")
            all_good = False
    
    # Check directories
    for dir in required_dirs:
        path = os.path.join(dbt_dir, dir)
        if os.path.exists(path):
            # Count files
            files = [f for f in os.listdir(path) if f.endswith('.sql') or f.endswith('.csv')]
            logger.info(f"[OK] {dir}/ ({len(files)} files)")
        else:
            logger.error(f"[ERROR] {dir}/ not found")
            all_good = False
    
    return all_good


def check_data_files():
    """Check generated data files."""
    print_section("5. GENERATED DATA FILES")
    
    data_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'raw')
    
    if not os.path.exists(data_dir):
        logger.warning("[WARN] Data directory not found")
        logger.info("  Run: python scripts/generate_data.py")
        return False
    
    csv_files = [f for f in os.listdir(data_dir) if f.endswith('.csv')]
    
    if not csv_files:
        logger.warning("[WARN] No CSV files found")
        logger.info("  Run: python scripts/generate_data.py")
        return False
    
    total_size = 0
    for file in sorted(csv_files):
        path = os.path.join(data_dir, file)
        size = os.path.getsize(path)
        total_size += size
        
        # Count rows
        with open(path, 'r') as f:
            row_count = sum(1 for line in f) - 1  # Subtract header
        
        logger.info(f"  {file}: {row_count:,} rows ({size/1024:.1f} KB)")
    
    logger.info(f"\nTotal: {len(csv_files)} files, {total_size/1024/1024:.2f} MB")
    return True


def main():
    """Main validation function."""
    logger.info("="*60)
    logger.info("HEALTHCARE EPIC CLARITY DEMO - VALIDATION REPORT")
    logger.info(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info("="*60)
    
    results = {}
    
    # Run all checks
    results['data_files'] = check_data_files()
    results['rds'] = check_rds_status()
    results['tables'] = check_table_row_counts()
    results['fivetran'] = check_fivetran_status()
    results['dbt'] = check_dbt_project()
    
    # Summary
    print_section("VALIDATION SUMMARY")
    
    for component, status in results.items():
        status_icon = "[OK]" if status else "[ERROR]"
        logger.info(f"{status_icon} {component.upper().replace('_', ' ')}")
    
    all_passed = all(results.values())
    
    logger.info("\n" + "="*60)
    if all_passed:
        logger.info("[OK] ALL CHECKS PASSED")
    else:
        logger.warning("[WARN] SOME CHECKS FAILED - Review output above")
    logger.info("="*60)
    
    return 0 if all_passed else 1


if __name__ == '__main__':
    sys.exit(main())
