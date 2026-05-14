#!/usr/bin/env python3
"""
Test SQL Server connectivity using pymssql (doesn't require ODBC drivers).
"""

import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

try:
    import pymssql
    print("[OK] pymssql is installed")
except ImportError:
    print("[ERROR] pymssql not installed. Installing...")
    os.system(f"{sys.executable} -m pip install pymssql")
    import pymssql

# Get connection details
host = os.getenv('SQLSERVER_HOST')
port = int(os.getenv('SQLSERVER_PORT', '1433'))
username = os.getenv('SQLSERVER_USERNAME')
password = os.getenv('SQLSERVER_PASSWORD')

# Try connecting to master first
for database in ['master', os.getenv('SQLSERVER_DATABASE', 'HEALTHCAREDEMO')]:
    print(f"\nTesting connection to SQL Server:")
    print(f"  Host: {host}:{port}")
    print(f"  Username: {username}")
    print(f"  Database: {database}")
    print()

    try:
        print("Attempting to connect...")
        conn = pymssql.connect(
            server=host,
            port=port,
            user=username,
            password=password,
            database=database,
            timeout=10,
            login_timeout=10
        )
        print("[OK] Connection successful!")
        
        cursor = conn.cursor()
        cursor.execute("SELECT @@VERSION")
        version = cursor.fetchone()[0]
        print(f"\nSQL Server Version:")
        print(version[:200])  # First 200 chars
        
        # List databases
        cursor.execute("SELECT name FROM sys.databases ORDER BY name")
        databases = [row[0] for row in cursor.fetchall()]
        print(f"\nAvailable databases:")
        for db in databases:
            print(f"  - {db}")
        
        cursor.close()
        conn.close()
        break
        
    except Exception as e:
        print(f"[ERROR] Connection failed: {e}")
        if database == 'master':
            print("Trying HEALTHCAREDEMO database...")
            continue
        else:
            print("\n[WARN]  SQL Server might not be fully started yet.")
            print("This could mean:")
            print("  1. SQL Server service is still starting up (wait 1-2 minutes)")
            print("  2. SQL Server is not installed on this EC2 instance")
            print("  3. Windows Firewall is blocking port 1433")
            print("\nYou may need to RDP into the instance to verify SQL Server status.")
            sys.exit(1)
