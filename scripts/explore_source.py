#!/usr/bin/env python3
"""
Explore the Epic SQL Server: list databases, schemas, tables, and row counts.
"""
import os, sys
from dotenv import load_dotenv

load_dotenv(override=True)

try:
    import pymssql
except ImportError:
    os.system(f"{sys.executable} -m pip install pymssql -q")
    import pymssql

HOST     = os.getenv('SQLSERVER_HOST')
PORT     = int(os.getenv('SQLSERVER_PORT', '1433'))
USER     = os.getenv('SQLSERVER_USERNAME')
PASSWORD = os.getenv('SQLSERVER_PASSWORD')
DATABASE = os.getenv('SQLSERVER_DATABASE', 'master')

print(f"\nConnecting to {HOST}:{PORT} as {USER} -> {DATABASE}\n")

try:
    conn = pymssql.connect(server=HOST, port=PORT, user=USER,
                           password=PASSWORD, database=DATABASE,
                           timeout=15, login_timeout=10)
    print("[OK] Connected!\n")
except Exception as e:
    print(f"[ERROR] Connection failed: {e}")
    sys.exit(1)

cur = conn.cursor()

# 1. SQL Server version
cur.execute("SELECT @@VERSION")
print("SQL Server Version:")
print(cur.fetchone()[0][:120])

# 2. All databases
print("\n--- Databases ---")
cur.execute("SELECT name FROM sys.databases WHERE name NOT IN ('master','model','msdb','tempdb','rdsadmin') ORDER BY name")
databases = [r[0] for r in cur.fetchall()]
for db in databases:
    print(f"  {db}")

# 3. All schemas in target database
print(f"\n--- Schemas in [{DATABASE}] ---")
cur.execute("SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA ORDER BY SCHEMA_NAME")
schemas = [r[0] for r in cur.fetchall()]
for s in schemas:
    print(f"  {s}")

# 4. All tables with row counts
print(f"\n--- Tables in [{DATABASE}] ---")
cur.execute("""
    SELECT
        t.TABLE_SCHEMA,
        t.TABLE_NAME,
        p.rows AS ROW_COUNT
    FROM INFORMATION_SCHEMA.TABLES t
    JOIN sys.tables st ON st.name = t.TABLE_NAME
    JOIN sys.partitions p ON p.object_id = st.object_id AND p.index_id IN (0,1)
    WHERE t.TABLE_TYPE = 'BASE TABLE'
    ORDER BY t.TABLE_SCHEMA, t.TABLE_NAME
""")
rows = cur.fetchall()
print(f"{'SCHEMA':<20} {'TABLE':<50} {'ROWS':>10}")
print("-" * 82)
for schema, table, count in rows:
    print(f"{schema:<20} {table:<50} {count:>10,}")

print(f"\nTotal tables: {len(rows)}")

cur.close()
conn.close()
