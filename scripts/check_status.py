#!/usr/bin/env python3
"""
Check the status of all components in the Healthcare Epic demo environment.
"""

import os
import sys
import logging
import requests
from requests.auth import HTTPBasicAuth
from dotenv import load_dotenv
import pyodbc
from typing import Dict, Any

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

def check_sql_server() -> Dict[str, Any]:
    """Check SQL Server connection and database status."""
    logger.info("=" * 60)
    logger.info("CHECKING SQL SERVER")
    logger.info("=" * 60)
    
    result = {
        "status": "unknown",
        "connection": False,
        "database_exists": False,
        "tables": [],
        "row_counts": {}
    }
    
    try:
        # Get connection details
        host = os.getenv('SQLSERVER_HOST')
        port = os.getenv('SQLSERVER_PORT', '1433')
        database = os.getenv('SQLSERVER_DATABASE', 'HEALTHCAREDEMO')
        username = os.getenv('SQLSERVER_USERNAME')
        password = os.getenv('SQLSERVER_PASSWORD')
        
        logger.info(f"Host: {host}:{port}")
        logger.info(f"Database: {database}")
        logger.info(f"Username: {username}")
        
        # Build connection string
        conn_str = (
            f"DRIVER={{ODBC Driver 17 for SQL Server}};"
            f"SERVER={host},{port};"
            f"DATABASE={database};"
            f"UID={username};"
            f"PWD={password};"
            f"TrustServerCertificate=yes;"
        )
        
        # Try to connect
        logger.info("Attempting connection...")
        conn = pyodbc.connect(conn_str, timeout=10)
        result["connection"] = True
        logger.info("[OK] Connection successful!")
        
        cursor = conn.cursor()
        
        # Check if database exists
        cursor.execute("SELECT DB_NAME()")
        db_name = cursor.fetchone()[0]
        result["database_exists"] = (db_name == database)
        logger.info(f"[OK] Connected to database: {db_name}")
        
        # Check for CLARITY schema tables
        cursor.execute("""
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_SCHEMA = 'CLARITY'
            ORDER BY TABLE_NAME
        """)
        
        tables = [row[0] for row in cursor.fetchall()]
        result["tables"] = tables
        
        if tables:
            logger.info(f"[OK] Found {len(tables)} tables in CLARITY schema:")
            for table in tables:
                # Get row count
                cursor.execute(f"SELECT COUNT(*) FROM CLARITY.{table}")
                count = cursor.fetchone()[0]
                result["row_counts"][table] = count
                logger.info(f"   - {table}: {count:,} rows")
            result["status"] = "ready"
        else:
            logger.warning("[WARN]  No tables found in CLARITY schema")
            result["status"] = "empty"
        
        cursor.close()
        conn.close()
        
    except pyodbc.Error as e:
        logger.error(f"[ERROR] SQL Server error: {e}")
        result["status"] = "error"
        result["error"] = str(e)
    except Exception as e:
        logger.error(f"[ERROR] Unexpected error: {e}")
        result["status"] = "error"
        result["error"] = str(e)
    
    return result

def check_fivetran() -> Dict[str, Any]:
    """Check Fivetran connector status."""
    logger.info("\n" + "=" * 60)
    logger.info("CHECKING FIVETRAN CONNECTOR")
    logger.info("=" * 60)
    
    result = {
        "status": "unknown",
        "connector_exists": False,
        "details": {}
    }
    
    try:
        # Get Fivetran credentials
        api_key = os.getenv('FIVETRAN_API_KEY')
        api_secret = os.getenv('FIVETRAN_API_SECRET')
        connector_id = os.getenv('FIVETRAN_CONNECTOR_ID', 'preferable_create')
        
        if not api_key or not api_secret:
            logger.error("[ERROR] Fivetran credentials not found in .env")
            result["status"] = "missing_credentials"
            return result
        
        logger.info(f"Connector ID: {connector_id}")
        
        # Get connector details
        url = f"https://api.fivetran.com/v1/connectors/{connector_id}"
        response = requests.get(
            url,
            auth=HTTPBasicAuth(api_key, api_secret),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            connector = data.get('data', {})
            result["connector_exists"] = True
            result["details"] = {
                "id": connector.get('id'),
                "name": connector.get('schema'),
                "service": connector.get('service'),
                "paused": connector.get('paused'),
                "sync_state": connector.get('status', {}).get('sync_state'),
                "setup_state": connector.get('status', {}).get('setup_state'),
                "succeeded_at": connector.get('succeeded_at'),
                "failed_at": connector.get('failed_at')
            }
            
            logger.info(f"[OK] Connector found: {result['details']['name']}")
            logger.info(f"   Service: {result['details']['service']}")
            logger.info(f"   Paused: {result['details']['paused']}")
            logger.info(f"   Sync State: {result['details']['sync_state']}")
            logger.info(f"   Setup State: {result['details']['setup_state']}")
            logger.info(f"   Last Success: {result['details']['succeeded_at']}")
            
            if result['details']['setup_state'] == 'connected':
                result["status"] = "ready"
            else:
                result["status"] = "not_configured"
                logger.warning(f"[WARN]  Connector setup incomplete: {result['details']['setup_state']}")
            
        elif response.status_code == 404:
            logger.error("[ERROR] Connector not found")
            result["status"] = "not_found"
        else:
            logger.error(f"[ERROR] API error: {response.status_code}")
            logger.error(f"   Response: {response.text}")
            result["status"] = "error"
            result["error"] = response.text
            
    except Exception as e:
        logger.error(f"[ERROR] Error checking Fivetran: {e}")
        result["status"] = "error"
        result["error"] = str(e)
    
    return result

def check_local_data() -> Dict[str, Any]:
    """Check if local CSV data files exist."""
    logger.info("\n" + "=" * 60)
    logger.info("CHECKING LOCAL DATA FILES")
    logger.info("=" * 60)
    
    result = {
        "status": "unknown",
        "data_dir_exists": False,
        "files": []
    }
    
    data_dir = "data/raw"
    
    if os.path.exists(data_dir):
        result["data_dir_exists"] = True
        files = [f for f in os.listdir(data_dir) if f.endswith('.csv')]
        result["files"] = files
        
        if files:
            logger.info(f"[OK] Found {len(files)} CSV files:")
            for file in sorted(files):
                file_path = os.path.join(data_dir, file)
                size = os.path.getsize(file_path)
                logger.info(f"   - {file} ({size:,} bytes)")
            result["status"] = "ready"
        else:
            logger.warning("[WARN]  No CSV files found")
            result["status"] = "empty"
    else:
        logger.warning(f"[WARN]  Data directory not found: {data_dir}")
        result["status"] = "missing"
    
    return result

def check_dbt() -> Dict[str, Any]:
    """Check dbt project configuration."""
    logger.info("\n" + "=" * 60)
    logger.info("CHECKING DBT PROJECT")
    logger.info("=" * 60)
    
    result = {
        "status": "unknown",
        "project_exists": False,
        "models": []
    }
    
    dbt_dir = "transform"
    
    if os.path.exists(dbt_dir):
        result["project_exists"] = True
        logger.info(f"[OK] dbt project directory exists: {dbt_dir}")
        
        # Check for dbt_project.yml
        if os.path.exists(os.path.join(dbt_dir, "dbt_project.yml")):
            logger.info("[OK] dbt_project.yml found")
            
            # Count models
            models_dir = os.path.join(dbt_dir, "models")
            if os.path.exists(models_dir):
                model_files = []
                for root, dirs, files in os.walk(models_dir):
                    for file in files:
                        if file.endswith('.sql'):
                            model_files.append(os.path.relpath(os.path.join(root, file), models_dir))
                
                result["models"] = model_files
                logger.info(f"[OK] Found {len(model_files)} dbt models:")
                
                # Group by layer
                staging = [m for m in model_files if 'staging' in m]
                intermediate = [m for m in model_files if 'intermediate' in m]
                marts = [m for m in model_files if 'marts' in m]
                
                logger.info(f"   - Staging: {len(staging)}")
                logger.info(f"   - Intermediate: {len(intermediate)}")
                logger.info(f"   - Marts: {len(marts)}")
                
                result["status"] = "ready"
            else:
                logger.warning("[WARN]  models/ directory not found")
                result["status"] = "incomplete"
        else:
            logger.warning("[WARN]  dbt_project.yml not found")
            result["status"] = "incomplete"
    else:
        logger.warning(f"[WARN]  dbt project directory not found: {dbt_dir}")
        result["status"] = "missing"
    
    return result

def print_summary(results: Dict[str, Dict[str, Any]]):
    """Print overall status summary."""
    logger.info("\n" + "=" * 60)
    logger.info("OVERALL STATUS SUMMARY")
    logger.info("=" * 60)
    
    components = {
        "Local Data Files": results["local_data"]["status"],
        "SQL Server": results["sql_server"]["status"],
        "Fivetran Connector": results["fivetran"]["status"],
        "dbt Project": results["dbt"]["status"]
    }
    
    for component, status in components.items():
        status_icon = "[OK]" if status == "ready" else "[WARN]" if status in ["empty", "not_configured"] else "[ERROR]"
        logger.info(f"{status_icon} {component}: {status.upper()}")
    
    # Determine next steps
    logger.info("\n" + "=" * 60)
    logger.info("RECOMMENDED NEXT STEPS")
    logger.info("=" * 60)
    
    if results["local_data"]["status"] != "ready":
        logger.info("1. Generate synthetic data:")
        logger.info("   python3 scripts/generate_data.py")
    
    if results["sql_server"]["status"] == "empty":
        logger.info("2. Load data to SQL Server:")
        logger.info("   python3 scripts/load_to_sqlserver.py")
    elif results["sql_server"]["status"] == "error":
        logger.info("2. Fix SQL Server connection issues (check logs above)")
    
    if results["fivetran"]["status"] == "not_configured":
        logger.info("3. Complete Fivetran connector setup in UI")
    elif results["fivetran"]["status"] == "ready" and results["sql_server"]["status"] == "ready":
        logger.info("3. Trigger Fivetran sync:")
        logger.info("   python3 scripts/trigger_fivetran_sync.py")
    
    if results["dbt"]["status"] == "ready":
        logger.info("4. Run dbt models:")
        logger.info("   cd transform && dbt run")
    
    logger.info("\n" + "=" * 60)

def main():
    """Main execution function."""
    logger.info("Healthcare Epic Demo - Environment Status Check")
    logger.info("=" * 60)
    
    results = {
        "local_data": check_local_data(),
        "sql_server": check_sql_server(),
        "fivetran": check_fivetran(),
        "dbt": check_dbt()
    }
    
    print_summary(results)
    
    # Exit with appropriate code
    all_ready = all(r["status"] == "ready" for r in results.values())
    sys.exit(0 if all_ready else 1)

if __name__ == "__main__":
    main()
