"""
Enrich ehr_demo with realistic Epic Clarity data.
Uses row-by-row inserts with progress reporting — reliable over slow/flaky connections.
"""

import os, sys, random, time
from datetime import datetime, date, timedelta
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'), override=True)
import pymssql

HOST     = os.getenv('SQLSERVER_HOST')
PORT     = int(os.getenv('SQLSERVER_PORT', 1433))
USER     = os.getenv('SQLSERVER_USERNAME')
PASSWORD = os.getenv('SQLSERVER_PASSWORD')
DB       = 'ehr_demo'

random.seed(42)

# ── connection (reconnects automatically) ─────────────────────────────────────
def get_conn():
    return pymssql.connect(server=HOST, port=PORT, user=USER,
                           password=PASSWORD, database=DB,
                           timeout=60, login_timeout=15)

def insert_rows(sql, rows, label, commit_every=25):
    """Insert rows one at a time, reconnecting if needed, committing every N rows."""
    c = get_conn()
    cur = c.cursor()
    ok = 0
    for idx, row in enumerate(rows):
        for attempt in range(3):
            try:
                cur.execute(sql, row)
                ok += 1
                if ok % commit_every == 0:
                    c.commit()
                    sys.stdout.write(f"\r   {label}: {ok:,}/{len(rows):,}")
                    sys.stdout.flush()
                break
            except Exception as e:
                c.close()
                time.sleep(2)
                c = get_conn()
                cur = c.cursor()
    c.commit()
    cur.close()
    c.close()
    print(f"\r   {label}: {ok:,}/{len(rows):,} — done")
    return ok

def run(sql, label=""):
    """Run a single DDL/DML statement."""
    c = get_conn()
    c.autocommit(True)
    cur = c.cursor()
    try:
        cur.execute(sql)
    except Exception as e:
        print(f"   (skipped: {e})")
    cur.close()
    c.close()

def count(table):
    c = get_conn()
    cur = c.cursor()
    cur.execute(f"SELECT COUNT(*) FROM dbo.{table} WITH (NOLOCK)")
    n = cur.fetchone()[0]
    cur.close(); c.close()
    return n

def max_id(table, col):
    c = get_conn()
    cur = c.cursor()
    cur.execute(f"SELECT MAX({col}) FROM dbo.{table} WITH (NOLOCK)")
    val = cur.fetchone()[0]
    cur.close(); c.close()
    return int(val) if val else 0

# ── reference data ─────────────────────────────────────────────────────────────
FIRST_NAMES_M = ['James','John','Robert','Michael','William','David','Richard','Joseph',
                 'Thomas','Charles','Christopher','Daniel','Matthew','Anthony','Mark',
                 'Donald','Steven','Paul','Andrew','Kenneth','George','Joshua','Kevin',
                 'Brian','Edward','Ronald','Timothy','Jason','Jeffrey','Ryan']
FIRST_NAMES_F = ['Mary','Patricia','Jennifer','Linda','Barbara','Elizabeth','Susan',
                 'Jessica','Sarah','Karen','Lisa','Nancy','Betty','Margaret','Sandra',
                 'Ashley','Dorothy','Kimberly','Emily','Donna','Michelle','Carol',
                 'Amanda','Melissa','Deborah','Stephanie','Rebecca','Sharon','Laura','Cynthia']
LAST_NAMES = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis',
              'Rodriguez','Martinez','Hernandez','Lopez','Gonzalez','Wilson','Anderson',
              'Thomas','Taylor','Moore','Jackson','Martin','Lee','Perez','Thompson',
              'White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson',
              'Walker','Young','Allen','King','Wright','Scott','Torres','Nguyen',
              'Hill','Flores','Green','Adams','Nelson','Baker','Hall','Rivera',
              'Campbell','Mitchell','Carter','Roberts']
CITIES = [
    ('New York','NY','10001'),('Los Angeles','CA','90001'),('Chicago','IL','60601'),
    ('Houston','TX','77001'),('Phoenix','AZ','85001'),('Philadelphia','PA','19101'),
    ('San Antonio','TX','78201'),('San Diego','CA','92101'),('Dallas','TX','75201'),
    ('San Jose','CA','95101'),('Austin','TX','73301'),('Jacksonville','FL','32099'),
    ('Columbus','OH','43085'),('Charlotte','NC','28201'),('Indianapolis','IN','46201'),
    ('San Francisco','CA','94102'),('Seattle','WA','98101'),('Denver','CO','80201'),
    ('Nashville','TN','37201'),('Boston','MA','02101'),
]
RACES     = ['White or Caucasian','Black or African American','Hispanic or Latino',
             'Asian','American Indian or Alaska Native','Other','Unknown']
LANGUAGES = ['English','Spanish','Mandarin','French','Arabic','Portuguese','Russian','Vietnamese']
RELIGIONS = ['Christian','Catholic','Protestant','Jewish','Muslim','Buddhist','Hindu','None','Other']
FIN_CLASSES = ['Commercial','Medicare','Medicaid','Self Pay','Workers Comp','Charity']
PAYORS = [
    ('Blue Cross Blue Shield','Commercial'),('Medicare','Government'),
    ('Medicaid','Government'),('United Healthcare','Commercial'),
    ('Aetna','Commercial'),('Cigna','Commercial'),('Humana','Commercial'),
    ('Self Pay','Self Pay'),('Kaiser Permanente','Commercial'),('Anthem','Commercial'),
]
DEPARTMENTS = [
    (1001,'Emergency Department','Emergency Medicine'),
    (1002,'Internal Medicine Clinic','Internal Medicine'),
    (1003,'Cardiology Clinic','Cardiology'),
    (1004,'Oncology Clinic','Oncology'),
    (1005,'Orthopedics Clinic','Orthopedics'),
    (1006,'Neurology Clinic','Neurology'),
    (1007,'Pediatrics Clinic','Pediatrics'),
    (1008,'OB/GYN Clinic','Obstetrics and Gynecology'),
    (1009,'Radiology','Radiology'),
    (1010,'Family Medicine','Family Medicine'),
]
PROV_TITLES = ['MD','DO','NP','PA']
PROV_TYPES  = ['Physician','Nurse Practitioner','Physician Assistant']
SPECIALTIES = ['Internal Medicine','Family Medicine','Cardiology','Oncology','Orthopedics',
               'Neurology','Pediatrics','Obstetrics and Gynecology','Emergency Medicine','Radiology']
ICD10_CODES = [
    ('I10','Essential (primary) hypertension'),
    ('E11.9','Type 2 diabetes mellitus without complications'),
    ('J18.9','Pneumonia, unspecified organism'),
    ('N39.0','Urinary tract infection, site not specified'),
    ('M54.5','Low back pain'),
    ('I25.10','Atherosclerotic heart disease of native coronary artery'),
    ('F32.9','Major depressive disorder, single episode, unspecified'),
    ('J44.1','Chronic obstructive pulmonary disease with acute exacerbation'),
    ('E78.5','Hyperlipidemia, unspecified'),
    ('K21.0','Gastro-esophageal reflux disease with esophagitis'),
    ('M17.11','Primary osteoarthritis, right knee'),
    ('F41.1','Generalized anxiety disorder'),
    ('I50.9','Heart failure, unspecified'),
    ('N18.3','Chronic kidney disease, stage 3'),
    ('J06.9','Acute upper respiratory infection, unspecified'),
    ('R51','Headache'),
    ('A41.9','Sepsis, unspecified organism'),
    ('G43.909','Migraine, unspecified'),
    ('E03.9','Hypothyroidism, unspecified'),
    ('I48.91','Unspecified atrial fibrillation'),
]
CPT_CODES = [
    (99213,'Office visit, established patient, low complexity','E&M'),
    (99214,'Office visit, established patient, moderate complexity','E&M'),
    (99215,'Office visit, established patient, high complexity','E&M'),
    (99203,'Office visit, new patient, low complexity','E&M'),
    (99204,'Office visit, new patient, moderate complexity','E&M'),
    (99283,'Emergency department visit, moderate severity','E&M'),
    (93000,'Electrocardiogram, routine ECG','Cardiology'),
    (71046,'Chest X-ray, 2 views','Radiology'),
    (80053,'Comprehensive metabolic panel','Lab'),
    (85025,'Complete blood count with differential','Lab'),
]
MEDICATIONS = [
    (1,'Lisinopril 10mg','Lisinopril','ACE Inhibitor','Antihypertensive'),
    (2,'Metformin 500mg','Metformin','Biguanide','Antidiabetic'),
    (3,'Atorvastatin 40mg','Atorvastatin','Statin','Antihyperlipidemic'),
    (4,'Amlodipine 5mg','Amlodipine','Calcium Channel Blocker','Antihypertensive'),
    (5,'Omeprazole 20mg','Omeprazole','PPI','GI Agent'),
    (6,'Metoprolol 25mg','Metoprolol','Beta Blocker','Antihypertensive'),
    (7,'Levothyroxine 50mcg','Levothyroxine','Thyroid Hormone','Thyroid Agent'),
    (8,'Sertraline 50mg','Sertraline','SSRI','Antidepressant'),
    (9,'Albuterol 90mcg','Albuterol','Beta-2 Agonist','Bronchodilator'),
    (10,'Amoxicillin 500mg','Amoxicillin','Penicillin','Antibiotic'),
]
ENC_STATUSES = ['Completed','Scheduled','Canceled','No Show']
APPT_TYPES   = ['New Patient','Return Visit','Follow-up','Annual Physical','Urgent Care']

def rand_date(s, e): return s + timedelta(days=random.randint(0, (e-s).days))
def rand_phone(): return f"{random.randint(200,999)}-{random.randint(100,999)}-{random.randint(1000,9999)}"
def rand_ssn():   return f"{random.randint(100,999)}-{random.randint(10,99)}-{random.randint(1000,9999)}"

# ── main ───────────────────────────────────────────────────────────────────────
def main():
    TARGET_PATIENTS = 50000

    print("=" * 60)
    print("ENRICHING ehr_demo DATABASE")
    print("=" * 60)

    # ── 1. PATIENT ────────────────────────────────────────────────────────────
    current = count('PATIENT')
    needed  = max(0, TARGET_PATIENTS - current)
    print(f"\n[1/9] PATIENT — current: {current:,}, inserting: {needed:,}")

    if needed > 0:
        start_id = max_id('PATIENT', 'PAT_ID') + 1
        rows = []
        for i in range(needed):
            pid = start_id + i
            sex = random.choice(['Male','Female'])
            fname = random.choice(FIRST_NAMES_M if sex=='Male' else FIRST_NAMES_F)
            lname = random.choice(LAST_NAMES)
            city, state, zipcode = random.choice(CITIES)
            payor_name, payor_type = random.choice(PAYORS)
            bdate = rand_date(date(1935,1,1), date(2005,12,31))
            rows.append((
                pid, f'{lname}, {fname}', bdate.strftime('%Y-%m-%d'), sex,
                city, state, zipcode, random.choice(RACES), random.choice(RELIGIONS),
                random.choice(FIN_CLASSES), random.choice(LANGUAGES),
                rand_phone(), rand_phone(), rand_ssn(), f'MRN{pid}', pid,
                payor_name, payor_type, 'Active', 'Adult',
                rand_date(date(2018,1,1), date(2022,12,31)).strftime('%Y-%m-%d'),
            ))
        insert_rows("""
            INSERT INTO dbo.PATIENT (PAT_ID, PAT_NAME, BIRTH_DATE, SEX_C_NAME,
                MAIL_CITY, MAIL_STATE_C_NAME, MAIL_ZIP, RACE_C_NAME, RELIGION_C_NAME,
                FIN_CLASS_C_NAME, LANGUAGE_C_NAME, HOME_PHONE, WORK_PHONE, SSN,
                PRIMARY_MRN, PATIENT_NUMBER, PAYOR_ID_PAYOR_NAME, PAYOR_ID_PAYOR_TYPE,
                PATIENT_STATUS_C_NAME, PATIENT_TYPE_C_NAME, REGISTRATION_DT)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """, rows, "patients", commit_every=100)
    print(f"   [OK] PATIENT total: {count('PATIENT'):,}")

    # ── 2. CLARITY_DEP ───────────────────────────────────────────────────────
    print(f"\n[2/9] CLARITY_DEP — creating & populating...")
    run("""
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='CLARITY_DEP' AND TABLE_SCHEMA='dbo')
        CREATE TABLE dbo.CLARITY_DEP (
            DEPARTMENT_ID INT PRIMARY KEY, DEPARTMENT_NAME VARCHAR(200),
            SPECIALTY_DEP_C VARCHAR(100), SERV_AREA_ID INT)
    """)
    run("IF OBJECT_ID('dbo.CLARITY_DEP','U') IS NOT NULL TRUNCATE TABLE dbo.CLARITY_DEP")
    insert_rows(
        "INSERT INTO dbo.CLARITY_DEP (DEPARTMENT_ID,DEPARTMENT_NAME,SPECIALTY_DEP_C,SERV_AREA_ID) VALUES (%s,%s,%s,%s)",
        [(d[0],d[1],d[2],1) for d in DEPARTMENTS], "departments")
    print(f"   [OK] CLARITY_DEP total: {count('CLARITY_DEP'):,}")

    # ── 3. CLARITY_SER ───────────────────────────────────────────────────────
    print(f"\n[3/9] CLARITY_SER — creating & populating 100 providers...")
    run("""
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='CLARITY_SER' AND TABLE_SCHEMA='dbo')
        CREATE TABLE dbo.CLARITY_SER (
            PROV_ID INT PRIMARY KEY, PROV_NAME VARCHAR(200), PROV_TYPE VARCHAR(100),
            CLINICIAN_TITLE VARCHAR(50), PRIMARY_SPECIALTY_C VARCHAR(100), DEPARTMENT_ID INT)
    """)
    run("IF OBJECT_ID('dbo.CLARITY_SER','U') IS NOT NULL TRUNCATE TABLE dbo.CLARITY_SER")
    providers = []
    for i in range(100):
        pid = 30001 + i
        sex = random.choice(['M','F'])
        fname = random.choice(FIRST_NAMES_M if sex=='M' else FIRST_NAMES_F)
        lname = random.choice(LAST_NAMES)
        providers.append((pid, f'Dr. {fname} {lname}', random.choice(PROV_TYPES),
                          random.choice(PROV_TITLES), random.choice(SPECIALTIES),
                          random.choice(DEPARTMENTS)[0]))
    insert_rows(
        "INSERT INTO dbo.CLARITY_SER (PROV_ID,PROV_NAME,PROV_TYPE,CLINICIAN_TITLE,PRIMARY_SPECIALTY_C,DEPARTMENT_ID) VALUES (%s,%s,%s,%s,%s,%s)",
        providers, "providers")
    print(f"   [OK] CLARITY_SER total: {count('CLARITY_SER'):,}")

    # ── 4. CLARITY_EDG ───────────────────────────────────────────────────────
    print(f"\n[4/9] CLARITY_EDG — creating & populating {len(ICD10_CODES)} diagnoses...")
    run("""
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='CLARITY_EDG' AND TABLE_SCHEMA='dbo')
        CREATE TABLE dbo.CLARITY_EDG (
            DX_ID INT PRIMARY KEY, DX_NAME VARCHAR(500), ICD10_CODE VARCHAR(20))
    """)
    run("IF OBJECT_ID('dbo.CLARITY_EDG','U') IS NOT NULL TRUNCATE TABLE dbo.CLARITY_EDG")
    insert_rows(
        "INSERT INTO dbo.CLARITY_EDG (DX_ID,DX_NAME,ICD10_CODE) VALUES (%s,%s,%s)",
        [(i+1, name, code) for i,(code,name) in enumerate(ICD10_CODES)], "diagnoses")
    print(f"   [OK] CLARITY_EDG total: {count('CLARITY_EDG'):,}")

    # ── 5. CLARITY_EAP ───────────────────────────────────────────────────────
    print(f"\n[5/9] CLARITY_EAP — creating & populating {len(CPT_CODES)} procedures...")
    run("""
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='CLARITY_EAP' AND TABLE_SCHEMA='dbo')
        CREATE TABLE dbo.CLARITY_EAP (
            PROC_ID INT PRIMARY KEY, PROC_NAME VARCHAR(500), PROC_CODE VARCHAR(20), TYPE_C VARCHAR(50))
    """)
    run("IF OBJECT_ID('dbo.CLARITY_EAP','U') IS NOT NULL TRUNCATE TABLE dbo.CLARITY_EAP")
    insert_rows(
        "INSERT INTO dbo.CLARITY_EAP (PROC_ID,PROC_NAME,PROC_CODE,TYPE_C) VALUES (%s,%s,%s,%s)",
        [(i+1, name, str(code), ptype) for i,(code,name,ptype) in enumerate(CPT_CODES)], "procedures")
    print(f"   [OK] CLARITY_EAP total: {count('CLARITY_EAP'):,}")

    # ── 6. CLARITY_MEDICATION ────────────────────────────────────────────────
    print(f"\n[6/9] CLARITY_MEDICATION — creating & populating {len(MEDICATIONS)} medications...")
    run("""
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='CLARITY_MEDICATION' AND TABLE_SCHEMA='dbo')
        CREATE TABLE dbo.CLARITY_MEDICATION (
            MEDICATION_ID INT PRIMARY KEY, NAME VARCHAR(500), GENERIC_NAME VARCHAR(500),
            PHARM_CLASS_C VARCHAR(100), THERA_CLASS_C VARCHAR(100))
    """)
    run("IF OBJECT_ID('dbo.CLARITY_MEDICATION','U') IS NOT NULL TRUNCATE TABLE dbo.CLARITY_MEDICATION")
    insert_rows(
        "INSERT INTO dbo.CLARITY_MEDICATION (MEDICATION_ID,NAME,GENERIC_NAME,PHARM_CLASS_C,THERA_CLASS_C) VALUES (%s,%s,%s,%s,%s)",
        [(m[0],m[1],m[2],m[3],m[4]) for m in MEDICATIONS], "medications")
    print(f"   [OK] CLARITY_MEDICATION total: {count('CLARITY_MEDICATION'):,}")

    # ── 7. PAT_ENC ────────────────────────────────────────────────────────────
    print(f"\n[7/9] PAT_ENC — widening varchar(1) stubs...")
    for stmt in [
        "ALTER TABLE dbo.PAT_ENC ALTER COLUMN PAT_ID VARCHAR(50)",
        "ALTER TABLE dbo.PAT_ENC ALTER COLUMN PCP_PROV_ID_PROV_NAME VARCHAR(200)",
        "ALTER TABLE dbo.PAT_ENC ALTER COLUMN FIN_CLASS_C_NAME VARCHAR(100)",
        "ALTER TABLE dbo.PAT_ENC ALTER COLUMN VISIT_PROV_ID_PROV_NAME VARCHAR(200)",
        "ALTER TABLE dbo.PAT_ENC ALTER COLUMN VISIT_PROV_TITLE_NAME VARCHAR(50)",
        "ALTER TABLE dbo.PAT_ENC ALTER COLUMN DEPARTMENT_ID_EXTERNAL_NAME VARCHAR(200)",
        "ALTER TABLE dbo.PAT_ENC ALTER COLUMN APPT_STATUS_C_NAME VARCHAR(100)",
    ]:
        run(stmt)

    # Get all patient IDs
    c = get_conn()
    cur = c.cursor()
    cur.execute("SELECT PAT_ID FROM dbo.PATIENT WITH (NOLOCK)")
    all_pat_ids = [str(int(r[0])) for r in cur.fetchall()]
    cur.close(); c.close()

    csn_start = max_id('PAT_ENC', 'PAT_ENC_CSN_ID') + 1
    prov_map  = {p[0]: (p[1], p[3]) for p in providers}  # prov_id -> (name, title)
    dept_map  = {d[0]: d[1] for d in DEPARTMENTS}

    enc_rows = []
    for pat_id in all_pat_ids:
        for _ in range(random.randint(3, 6)):
            csn = csn_start
            csn_start += 1
            cdate = rand_date(date(2022,1,1), date(2026,3,31))
            adm = datetime(cdate.year, cdate.month, cdate.day,
                           random.randint(7,17), random.randint(0,59))
            date_real = (cdate - date(1840,12,31)).days + (adm.hour*60+adm.minute)/1440.0
            prov_id   = random.choice(providers)[0]
            dept_id   = random.choice(DEPARTMENTS)[0]
            prov_name, prov_title = prov_map[prov_id]
            dept_name = dept_map[dept_id]
            status    = random.choices(ENC_STATUSES, weights=[70,10,10,10])[0]
            enc_rows.append((
                pat_id, date_real, csn, adm,
                prov_name, random.choice(FIN_CLASSES), prov_name, prov_title,
                dept_name, status, 'N'
            ))

    print(f"   Inserting {len(enc_rows):,} encounters...")
    insert_rows("""
        INSERT INTO dbo.PAT_ENC (PAT_ID, PAT_ENC_DATE_REAL, PAT_ENC_CSN_ID, CONTACT_DATE,
            PCP_PROV_ID_PROV_NAME, FIN_CLASS_C_NAME, VISIT_PROV_ID_PROV_NAME,
            VISIT_PROV_TITLE_NAME, DEPARTMENT_ID_EXTERNAL_NAME, APPT_STATUS_C_NAME, ENC_CLOSED_YN)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
    """, enc_rows, "encounters", commit_every=200)
    print(f"   [OK] PAT_ENC total: {count('PAT_ENC'):,}")

    # ── 8. PAT_ENC_DX ────────────────────────────────────────────────────────
    print(f"\n[8/9] PAT_ENC_DX — widening stubs...")
    for stmt in [
        "ALTER TABLE dbo.PAT_ENC_DX ALTER COLUMN DX_ID_DX_NAME VARCHAR(500)",
        "ALTER TABLE dbo.PAT_ENC_DX ALTER COLUMN DX_QUALIFIER_C_NAME VARCHAR(100)",
    ]:
        run(stmt)

    c = get_conn()
    cur = c.cursor()
    cur.execute("SELECT PAT_ENC_CSN_ID FROM dbo.PAT_ENC WITH (NOLOCK)")
    all_csns = [int(r[0]) for r in cur.fetchall()]
    cur.close(); c.close()

    dx_rows = []
    for csn in all_csns:
        n_dx = random.choices([1,2,3,4], weights=[40,35,15,10])[0]
        for line, (icd_code, icd_name) in enumerate(random.sample(ICD10_CODES, min(n_dx, len(ICD10_CODES))), 1):
            dx_rows.append((csn, line, icd_name, 'Y' if line==1 else 'N', 'N'))

    print(f"   Inserting {len(dx_rows):,} diagnosis records...")
    insert_rows(
        "INSERT INTO dbo.PAT_ENC_DX (PAT_ENC_CSN_ID, LINE, DX_ID_DX_NAME, PRIMARY_DX_YN, DX_CHRONIC_YN) VALUES (%s,%s,%s,%s,%s)",
        dx_rows, "diagnoses", commit_every=200)
    print(f"   [OK] PAT_ENC_DX total: {count('PAT_ENC_DX'):,}")

    # ── 9. HSP_ACCOUNT ───────────────────────────────────────────────────────
    print(f"\n[9/9] HSP_ACCOUNT — inserting for completed encounters...")
    c = get_conn()
    cur = c.cursor()
    cur.execute("SELECT PAT_ENC_CSN_ID, PAT_ID FROM dbo.PAT_ENC WITH (NOLOCK) WHERE APPT_STATUS_C_NAME = 'Completed'")
    completed = [(int(r[0]), r[1]) for r in cur.fetchall()]
    cur.close(); c.close()

    run("TRUNCATE TABLE dbo.HSP_ACCOUNT")

    hsp_rows = []
    for csn, pat_id in completed:
        try:
            numeric_pat = int(pat_id)
        except:
            numeric_pat = None
        adm = rand_date(date(2022,1,1), date(2026,3,31))
        dis = adm + timedelta(days=random.randint(0,7))
        _, fin_class = random.choice(PAYORS)
        hsp_rows.append((
            csn, numeric_pat, f'Patient {numeric_pat}', csn,
            random.choice(['Hospital','Outpatient','Professional']),
            adm.strftime('%Y-%m-%d'), dis.strftime('%Y-%m-%d'), fin_class,
            round(random.uniform(0,150),2),
            round(random.uniform(0,500),2),
            round(random.uniform(0,200),2),
        ))

    print(f"   Inserting {len(hsp_rows):,} hospital accounts...")
    insert_rows("""
        INSERT INTO dbo.HSP_ACCOUNT (HSP_ACCOUNT_ID, PAT_ID, PAT_ID_PATIENT_NAME, ENCOUNTER_ID,
            ACCOUNT_TYPE_C_NAME, ADMIT_DT, DISCHARGE_DT, FINANCIAL_CLASS_C_NAME,
            COPAY_AMT, DEDUCTIBLE_AMT, DISALLOWED_AMT)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
    """, hsp_rows, "accounts", commit_every=200)
    print(f"   [OK] HSP_ACCOUNT total: {count('HSP_ACCOUNT'):,}")

    # ── Summary ───────────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("ENRICHMENT COMPLETE — FINAL ROW COUNTS")
    print("=" * 60)
    tables = ['PATIENT','CLARITY_DEP','CLARITY_SER','CLARITY_EDG','CLARITY_EAP',
              'CLARITY_MEDICATION','PAT_ENC','PAT_ENC_DX','HSP_ACCOUNT']
    total = 0
    for t in tables:
        try:
            n = count(t)
            total += n
            print(f"  {t:<30} {n:>10,}")
        except:
            print(f"  {t:<30}  (not found)")
    print(f"  {'TOTAL':<30} {total:>10,}")
    print("=" * 60)

if __name__ == '__main__':
    main()
