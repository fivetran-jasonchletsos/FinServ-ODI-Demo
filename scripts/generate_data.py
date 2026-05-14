"""
Generate synthetic Epic Clarity healthcare data for demo purposes.

This script generates realistic healthcare data conforming to the Epic Clarity
data model with referential integrity across all tables.
"""

import os
import csv
import random
from datetime import datetime, timedelta
from faker import Faker
import logging

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Faker
fake = Faker()
Faker.seed(42)
random.seed(42)

# Output directory
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'raw')
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Configuration
NUM_PATIENTS = 1000
NUM_PROVIDERS = 50
NUM_DEPARTMENTS = 20
NUM_MEDICATIONS = 100
NUM_PROCEDURES = 150

# Date range for encounters
START_DATE = datetime(2022, 1, 1)
END_DATE = datetime(2024, 12, 31)

# ICD-10 codes for common chronic conditions
ICD10_CODES = {
    'diabetes': ['E11.9', 'E11.65', 'E11.22', 'E11.40', 'E11.51', 'E11.21', 'E11.69'],
    'hypertension': ['I10', 'I11.9', 'I12.9', 'I13.10', 'I15.9'],
    'copd': ['J44.9', 'J44.0', 'J44.1', 'J43.9', 'J42'],
    'chf': ['I50.9', 'I50.23', 'I50.33', 'I50.43', 'I50.22', 'I50.32'],
    'ckd': ['N18.9', 'N18.3', 'N18.4', 'N18.5', 'N18.6'],
    'other': ['M79.3', 'R53.83', 'K21.9', 'F41.9', 'M25.50', 'R51', 'J06.9', 'K59.00']
}

# Lab test configurations
LAB_TESTS = {
    'Glucose': {'unit': 'mg/dL', 'low': 70, 'high': 100, 'mean': 95, 'std': 20},
    'Hemoglobin A1C': {'unit': '%', 'low': 4.0, 'high': 5.6, 'mean': 5.3, 'std': 1.2},
    'Creatinine': {'unit': 'mg/dL', 'low': 0.7, 'high': 1.3, 'mean': 1.0, 'std': 0.3},
    'BUN': {'unit': 'mg/dL', 'low': 7, 'high': 20, 'mean': 15, 'std': 8},
    'Sodium': {'unit': 'mmol/L', 'low': 136, 'high': 145, 'mean': 140, 'std': 3},
    'Potassium': {'unit': 'mmol/L', 'low': 3.5, 'high': 5.0, 'mean': 4.2, 'std': 0.5},
    'WBC': {'unit': '10^3/uL', 'low': 4.5, 'high': 11.0, 'mean': 7.5, 'std': 2.0},
    'Hemoglobin': {'unit': 'g/dL', 'low': 12.0, 'high': 16.0, 'mean': 14.0, 'std': 1.5},
}


def write_csv(filename, data, fieldnames):
    """Write data to CSV file."""
    filepath = os.path.join(OUTPUT_DIR, filename)
    with open(filepath, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(data)
    logger.info(f"Written {len(data)} rows to {filename}")


def random_date(start, end):
    """Generate random date between start and end."""
    delta = end - start
    random_days = random.randint(0, delta.days)
    return start + timedelta(days=random_days)


def generate_race_codes():
    """Generate race code lookup table."""
    races = [
        {'RACE_C': 1, 'NAME': 'White'},
        {'RACE_C': 2, 'NAME': 'Black or African American'},
        {'RACE_C': 3, 'NAME': 'Asian'},
        {'RACE_C': 4, 'NAME': 'American Indian or Alaska Native'},
        {'RACE_C': 5, 'NAME': 'Native Hawaiian or Other Pacific Islander'},
        {'RACE_C': 6, 'NAME': 'Other'},
        {'RACE_C': 7, 'NAME': 'Declined to Specify'},
    ]
    write_csv('ZC_RACE.csv', races, ['RACE_C', 'NAME'])
    return races


def generate_encounter_types():
    """Generate encounter type lookup table."""
    enc_types = [
        {'ENC_TYPE_C': 101, 'NAME': 'Office Visit'},
        {'ENC_TYPE_C': 102, 'NAME': 'Emergency'},
        {'ENC_TYPE_C': 103, 'NAME': 'Hospital Encounter'},
        {'ENC_TYPE_C': 104, 'NAME': 'Telephone'},
        {'ENC_TYPE_C': 105, 'NAME': 'Telemedicine'},
        {'ENC_TYPE_C': 106, 'NAME': 'Urgent Care'},
        {'ENC_TYPE_C': 107, 'NAME': 'Observation'},
        {'ENC_TYPE_C': 108, 'NAME': 'Surgical'},
    ]
    write_csv('ZC_ENC_TYPE.csv', enc_types, ['ENC_TYPE_C', 'NAME'])
    return enc_types


def generate_patients():
    """Generate patient demographic data."""
    patients = []
    patient_races = []
    
    for i in range(1, NUM_PATIENTS + 1):
        birth_date = fake.date_of_birth(minimum_age=18, maximum_age=90)
        sex = random.choice(['M', 'F'])
        
        patient = {
            'PAT_ID': i,
            'PAT_MRN_ID': f'MRN{i:07d}',
            'PAT_FIRST_NAME': fake.first_name_male() if sex == 'M' else fake.first_name_female(),
            'PAT_LAST_NAME': fake.last_name(),
            'BIRTH_DATE': birth_date.strftime('%Y-%m-%d'),
            'SEX': sex,
            'ZIP': fake.zipcode(),
            'PAT_STATUS': random.choice(['Active', 'Active', 'Active', 'Inactive'])
        }
        patients.append(patient)
        
        # Assign race (can have multiple)
        num_races = random.choices([1, 2], weights=[0.95, 0.05])[0]
        for _ in range(num_races):
            patient_races.append({
                'PAT_ID': i,
                'RACE_C': random.randint(1, 7)
            })
    
    write_csv('PATIENT.csv', patients, 
              ['PAT_ID', 'PAT_MRN_ID', 'PAT_FIRST_NAME', 'PAT_LAST_NAME', 
               'BIRTH_DATE', 'SEX', 'ZIP', 'PAT_STATUS'])
    write_csv('PATIENT_RACE.csv', patient_races, ['PAT_ID', 'RACE_C'])
    
    return patients


def generate_providers():
    """Generate provider data."""
    providers = []
    titles = ['MD', 'DO', 'NP', 'PA', 'RN', 'PharmD']
    types = ['Physician', 'Nurse Practitioner', 'Physician Assistant', 'Nurse']
    
    for i in range(1, NUM_PROVIDERS + 1):
        title = random.choice(titles)
        provider = {
            'PROV_ID': i,
            'PROV_NAME': fake.name(),
            'PROV_TYPE': random.choice(types),
            'CLINICIAN_TITLE': title,
            'CLINICIAN_TYPE_C': random.randint(1, 10),
            'DEPARTMENT_ID': random.randint(1, NUM_DEPARTMENTS)
        }
        providers.append(provider)
    
    write_csv('CLARITY_SER.csv', providers,
              ['PROV_ID', 'PROV_NAME', 'PROV_TYPE', 'CLINICIAN_TITLE', 
               'CLINICIAN_TYPE_C', 'DEPARTMENT_ID'])
    
    return providers


def generate_departments():
    """Generate department data."""
    departments = []
    specialties = [
        'Cardiology', 'Endocrinology', 'Nephrology', 'Pulmonology',
        'Primary Care', 'Emergency Medicine', 'Surgery', 'Orthopedics',
        'Neurology', 'Gastroenterology', 'Oncology', 'Psychiatry',
        'Dermatology', 'Ophthalmology', 'ENT', 'Urology',
        'Obstetrics', 'Pediatrics', 'Radiology', 'Pathology'
    ]
    
    for i in range(1, NUM_DEPARTMENTS + 1):
        dept = {
            'DEPARTMENT_ID': i,
            'DEPARTMENT_NAME': f'{specialties[i-1]} Department',
            'SPECIALTY_DEP_C': i,
            'REV_LOC_ID': random.randint(1000, 9999),
            'SERV_AREA_ID': random.randint(1, 5)
        }
        departments.append(dept)
    
    write_csv('CLARITY_DEP.csv', departments,
              ['DEPARTMENT_ID', 'DEPARTMENT_NAME', 'SPECIALTY_DEP_C', 
               'REV_LOC_ID', 'SERV_AREA_ID'])
    
    return departments


def generate_diagnoses():
    """Generate diagnosis master data."""
    diagnoses = []
    dx_id = 1
    
    # Add chronic condition diagnoses
    for condition, codes in ICD10_CODES.items():
        for code in codes:
            dx = {
                'DX_ID': dx_id,
                'DX_NAME': f'{condition.upper()} - {code}',
                'ICD9_CODE': '',
                'ICD10_CODE': code
            }
            diagnoses.append(dx)
            dx_id += 1
    
    write_csv('CLARITY_EDG.csv', diagnoses,
              ['DX_ID', 'DX_NAME', 'ICD9_CODE', 'ICD10_CODE'])
    
    return diagnoses


def generate_procedures():
    """Generate procedure master data."""
    procedures = []
    proc_types = ['Lab', 'Imaging', 'Procedure', 'Therapy']
    
    lab_names = list(LAB_TESTS.keys())
    imaging_names = ['Chest X-Ray', 'CT Scan', 'MRI', 'Ultrasound', 'Mammogram']
    proc_names = ['Biopsy', 'Endoscopy', 'Colonoscopy', 'EKG', 'Echocardiogram']
    
    proc_id = 1
    
    # Lab tests
    for name in lab_names:
        procedures.append({
            'PROC_ID': proc_id,
            'PROC_NAME': name,
            'PROC_CODE': f'LAB{proc_id:04d}',
            'TYPE_C': 1
        })
        proc_id += 1
    
    # Imaging
    for name in imaging_names:
        procedures.append({
            'PROC_ID': proc_id,
            'PROC_NAME': name,
            'PROC_CODE': f'IMG{proc_id:04d}',
            'TYPE_C': 2
        })
        proc_id += 1
    
    # Other procedures
    for name in proc_names:
        procedures.append({
            'PROC_ID': proc_id,
            'PROC_NAME': name,
            'PROC_CODE': f'PROC{proc_id:04d}',
            'TYPE_C': 3
        })
        proc_id += 1
    
    # Fill remaining
    while proc_id <= NUM_PROCEDURES:
        procedures.append({
            'PROC_ID': proc_id,
            'PROC_NAME': f'Procedure {proc_id}',
            'PROC_CODE': f'PROC{proc_id:04d}',
            'TYPE_C': random.randint(1, 4)
        })
        proc_id += 1
    
    write_csv('CLARITY_EAP.csv', procedures,
              ['PROC_ID', 'PROC_NAME', 'PROC_CODE', 'TYPE_C'])
    
    return procedures


def generate_medications():
    """Generate medication master data."""
    medications = []
    
    med_names = [
        'Metformin', 'Lisinopril', 'Amlodipine', 'Atorvastatin', 'Levothyroxine',
        'Metoprolol', 'Albuterol', 'Omeprazole', 'Losartan', 'Gabapentin',
        'Hydrochlorothiazide', 'Sertraline', 'Simvastatin', 'Montelukast', 'Furosemide',
        'Pantoprazole', 'Aspirin', 'Insulin Glargine', 'Clopidogrel', 'Rosuvastatin'
    ]
    
    for i in range(1, NUM_MEDICATIONS + 1):
        if i <= len(med_names):
            name = med_names[i-1]
            generic = name
        else:
            name = f'Medication {i}'
            generic = f'Generic {i}'
        
        med = {
            'MEDICATION_ID': i,
            'NAME': name,
            'GENERIC_NAME': generic,
            'THERA_CLASS_C': random.randint(1, 20),
            'PHARM_CLASS_C': random.randint(1, 30)
        }
        medications.append(med)
    
    write_csv('CLARITY_MEDICATION.csv', medications,
              ['MEDICATION_ID', 'NAME', 'GENERIC_NAME', 'THERA_CLASS_C', 'PHARM_CLASS_C'])
    
    return medications


def generate_encounters(patients):
    """Generate patient encounters."""
    encounters = []
    encounter_diagnoses = []
    csn_id = 1
    
    for patient in patients:
        pat_id = patient['PAT_ID']
        num_encounters = random.randint(1, 15)
        
        for _ in range(num_encounters):
            contact_date = random_date(START_DATE, END_DATE)
            enc_type_c = random.choice([101, 101, 101, 102, 103, 104, 105, 106])
            
            # Determine if inpatient
            is_inpatient = enc_type_c in [103, 107, 108]
            
            encounter = {
                'PAT_ENC_CSN_ID': csn_id,
                'PAT_ID': pat_id,
                'CONTACT_DATE': contact_date.strftime('%Y-%m-%d'),
                'ENC_TYPE_C': enc_type_c,
                'VISIT_PROV_ID': random.randint(1, NUM_PROVIDERS),
                'DEPARTMENT_ID': random.randint(1, NUM_DEPARTMENTS),
                'HOSP_ADMSN_TIME': contact_date.strftime('%Y-%m-%d %H:%M:%S') if is_inpatient else '',
                'HOSP_DISCH_TIME': (contact_date + timedelta(days=random.randint(1, 7))).strftime('%Y-%m-%d %H:%M:%S') if is_inpatient else ''
            }
            encounters.append(encounter)
            
            # Add diagnoses (1-5 per encounter)
            num_dx = random.randint(1, 5)
            all_icd10 = [code for codes in ICD10_CODES.values() for code in codes]
            
            for line in range(1, num_dx + 1):
                # Find DX_ID for the selected ICD10 code
                icd10_code = random.choice(all_icd10)
                dx_id = next((i for i, dx in enumerate(generate_diagnoses(), 1) 
                             if dx['ICD10_CODE'] == icd10_code), random.randint(1, 50))
                
                enc_dx = {
                    'PAT_ENC_CSN_ID': csn_id,
                    'LINE': line,
                    'DX_ID': dx_id,
                    'PRIMARY_DX_YN': 'Y' if line == 1 else 'N'
                }
                encounter_diagnoses.append(enc_dx)
            
            csn_id += 1
    
    write_csv('PAT_ENC.csv', encounters,
              ['PAT_ENC_CSN_ID', 'PAT_ID', 'CONTACT_DATE', 'ENC_TYPE_C', 
               'VISIT_PROV_ID', 'DEPARTMENT_ID', 'HOSP_ADMSN_TIME', 'HOSP_DISCH_TIME'])
    write_csv('PAT_ENC_DX.csv', encounter_diagnoses,
              ['PAT_ENC_CSN_ID', 'LINE', 'DX_ID', 'PRIMARY_DX_YN'])
    
    return encounters


def generate_orders(encounters):
    """Generate lab orders and results."""
    orders = []
    order_results = []
    order_id = 1
    
    # Get lab procedure IDs
    lab_proc_ids = list(range(1, len(LAB_TESTS) + 1))
    
    for encounter in encounters:
        csn_id = encounter['PAT_ENC_CSN_ID']
        pat_id = encounter['PAT_ID']
        contact_date = datetime.strptime(encounter['CONTACT_DATE'], '%Y-%m-%d')
        
        # 60% of encounters have lab orders
        if random.random() < 0.6:
            num_orders = random.randint(1, 5)
            
            for _ in range(num_orders):
                proc_id = random.choice(lab_proc_ids)
                order_time = contact_date + timedelta(hours=random.randint(0, 4))
                result_time = order_time + timedelta(hours=random.randint(2, 24))
                
                order = {
                    'ORDER_PROC_ID': order_id,
                    'PAT_ENC_CSN_ID': csn_id,
                    'PAT_ID': pat_id,
                    'PROC_ID': proc_id,
                    'ORDER_TIME': order_time.strftime('%Y-%m-%d %H:%M:%S'),
                    'ORDER_STATUS_C': random.choice([5, 5, 5, 3]),  # 5=Completed, 3=Pending
                    'RESULT_TIME': result_time.strftime('%Y-%m-%d %H:%M:%S') if random.random() < 0.9 else ''
                }
                orders.append(order)
                
                # Generate result if completed
                if order['ORDER_STATUS_C'] == 5 and order['RESULT_TIME']:
                    # Get lab test config
                    lab_name = list(LAB_TESTS.keys())[proc_id - 1] if proc_id <= len(LAB_TESTS) else 'Unknown'
                    if lab_name in LAB_TESTS:
                        config = LAB_TESTS[lab_name]
                        
                        # Generate result value
                        result_value = random.gauss(config['mean'], config['std'])
                        result_value = max(0, result_value)  # No negative values
                        
                        # Determine if abnormal (15% chance)
                        is_abnormal = random.random() < 0.15
                        if is_abnormal:
                            if random.random() < 0.5:
                                result_value = config['low'] - random.uniform(0, config['std'])
                                flag = 'L'
                            else:
                                result_value = config['high'] + random.uniform(0, config['std'])
                                flag = 'H'
                        else:
                            flag = ''
                        
                        result = {
                            'ORDER_PROC_ID': order_id,
                            'LINE': 1,
                            'RESULT_VALUE': f'{result_value:.2f}',
                            'RESULT_FLAG_C': flag,
                            'REFERENCE_LOW': f'{config["low"]:.2f}',
                            'REFERENCE_HIGH': f'{config["high"]:.2f}',
                            'RESULT_UNIT': config['unit']
                        }
                        order_results.append(result)
                
                order_id += 1
    
    write_csv('ORDER_PROC.csv', orders,
              ['ORDER_PROC_ID', 'PAT_ENC_CSN_ID', 'PAT_ID', 'PROC_ID', 
               'ORDER_TIME', 'ORDER_STATUS_C', 'RESULT_TIME'])
    write_csv('ORDER_RESULTS.csv', order_results,
              ['ORDER_PROC_ID', 'LINE', 'RESULT_VALUE', 'RESULT_FLAG_C', 
               'REFERENCE_LOW', 'REFERENCE_HIGH', 'RESULT_UNIT'])
    
    return orders


def generate_medication_orders(encounters):
    """Generate medication orders."""
    med_orders = []
    order_id = 1
    
    routes = ['Oral', 'IV', 'IM', 'Subcutaneous', 'Topical', 'Inhalation']
    
    for encounter in encounters:
        csn_id = encounter['PAT_ENC_CSN_ID']
        pat_id = encounter['PAT_ID']
        contact_date = datetime.strptime(encounter['CONTACT_DATE'], '%Y-%m-%d')
        
        # 70% of encounters have medication orders
        if random.random() < 0.7:
            num_meds = random.randint(1, 5)
            
            for _ in range(num_meds):
                order_time = contact_date + timedelta(hours=random.randint(0, 6))
                
                med_order = {
                    'ORDER_MED_ID': order_id,
                    'PAT_ENC_CSN_ID': csn_id,
                    'PAT_ID': pat_id,
                    'MEDICATION_ID': random.randint(1, NUM_MEDICATIONS),
                    'ORDER_INST': order_time.strftime('%Y-%m-%d %H:%M:%S'),
                    'MED_ROUTE_C': random.randint(1, len(routes)),
                    'HV_DOSE_UNIT_C': random.randint(1, 10),
                    'MIN_DISCRETE_DOSE': round(random.uniform(5, 500), 2)
                }
                med_orders.append(med_order)
                order_id += 1
    
    write_csv('ORDER_MED.csv', med_orders,
              ['ORDER_MED_ID', 'PAT_ENC_CSN_ID', 'PAT_ID', 'MEDICATION_ID', 
               'ORDER_INST', 'MED_ROUTE_C', 'HV_DOSE_UNIT_C', 'MIN_DISCRETE_DOSE'])
    
    return med_orders


def generate_billing(encounters):
    """Generate billing and transaction data."""
    accounts = []
    transactions = []
    account_id = 1
    tx_id = 1
    
    for encounter in encounters:
        csn_id = encounter['PAT_ENC_CSN_ID']
        pat_id = encounter['PAT_ID']
        
        # Generate charges based on encounter type
        enc_type = encounter['ENC_TYPE_C']
        if enc_type == 101:  # Office visit
            base_charge = random.uniform(150, 400)
        elif enc_type == 102:  # Emergency
            base_charge = random.uniform(1000, 5000)
        elif enc_type == 103:  # Hospital
            base_charge = random.uniform(5000, 50000)
        else:
            base_charge = random.uniform(100, 1000)
        
        tot_charges = round(base_charge, 2)
        tot_pmts = round(tot_charges * random.uniform(0.6, 0.95), 2)
        tot_adj = round(tot_charges * random.uniform(0, 0.2), 2)
        
        account = {
            'HSP_ACCOUNT_ID': account_id,
            'PAT_ID': pat_id,
            'PAT_ENC_CSN_ID': csn_id,
            'ACCOUNT_TYPE_C': random.randint(1, 5),
            'TOT_CHARGES': f'{tot_charges:.2f}',
            'TOT_PMTS': f'{tot_pmts:.2f}',
            'TOT_ADJ': f'{tot_adj:.2f}'
        }
        accounts.append(account)
        
        # Generate transactions
        contact_date = datetime.strptime(encounter['CONTACT_DATE'], '%Y-%m-%d')
        
        # Charge transaction
        transactions.append({
            'TX_ID': tx_id,
            'HSP_ACCOUNT_ID': account_id,
            'TX_TYPE_C': 1,  # Charge
            'TX_AMOUNT': f'{tot_charges:.2f}',
            'POST_DATE': contact_date.strftime('%Y-%m-%d'),
            'VOID_DATE': ''
        })
        tx_id += 1
        
        # Payment transactions (1-3)
        num_pmts = random.randint(1, 3)
        remaining_pmt = tot_pmts
        for i in range(num_pmts):
            if i == num_pmts - 1:
                pmt_amt = remaining_pmt
            else:
                pmt_amt = round(remaining_pmt * random.uniform(0.3, 0.7), 2)
                remaining_pmt -= pmt_amt
            
            post_date = contact_date + timedelta(days=random.randint(7, 90))
            transactions.append({
                'TX_ID': tx_id,
                'HSP_ACCOUNT_ID': account_id,
                'TX_TYPE_C': 2,  # Payment
                'TX_AMOUNT': f'{pmt_amt:.2f}',
                'POST_DATE': post_date.strftime('%Y-%m-%d'),
                'VOID_DATE': ''
            })
            tx_id += 1
        
        # Adjustment transaction
        if tot_adj > 0:
            post_date = contact_date + timedelta(days=random.randint(14, 60))
            transactions.append({
                'TX_ID': tx_id,
                'HSP_ACCOUNT_ID': account_id,
                'TX_TYPE_C': 3,  # Adjustment
                'TX_AMOUNT': f'{tot_adj:.2f}',
                'POST_DATE': post_date.strftime('%Y-%m-%d'),
                'VOID_DATE': ''
            })
            tx_id += 1
        
        account_id += 1
    
    write_csv('HSP_ACCOUNT.csv', accounts,
              ['HSP_ACCOUNT_ID', 'PAT_ID', 'PAT_ENC_CSN_ID', 'ACCOUNT_TYPE_C', 
               'TOT_CHARGES', 'TOT_PMTS', 'TOT_ADJ'])
    write_csv('ARPB_TRANSACTIONS.csv', transactions,
              ['TX_ID', 'HSP_ACCOUNT_ID', 'TX_TYPE_C', 'TX_AMOUNT', 
               'POST_DATE', 'VOID_DATE'])
    
    return accounts, transactions


def main():
    """Main execution function."""
    logger.info("Starting Epic Clarity data generation...")
    
    # Generate lookup tables
    logger.info("Generating lookup tables...")
    generate_race_codes()
    generate_encounter_types()
    
    # Generate master data
    logger.info("Generating master data...")
    patients = generate_patients()
    providers = generate_providers()
    departments = generate_departments()
    diagnoses = generate_diagnoses()
    procedures = generate_procedures()
    medications = generate_medications()
    
    # Generate transactional data
    logger.info("Generating encounters...")
    encounters = generate_encounters(patients)
    
    logger.info("Generating orders and results...")
    orders = generate_orders(encounters)
    
    logger.info("Generating medication orders...")
    med_orders = generate_medication_orders(encounters)
    
    logger.info("Generating billing data...")
    accounts, transactions = generate_billing(encounters)
    
    # Summary
    logger.info("\n" + "="*60)
    logger.info("DATA GENERATION COMPLETE")
    logger.info("="*60)
    logger.info(f"Patients: {len(patients)}")
    logger.info(f"Providers: {len(providers)}")
    logger.info(f"Departments: {len(departments)}")
    logger.info(f"Diagnoses: {len(diagnoses)}")
    logger.info(f"Procedures: {len(procedures)}")
    logger.info(f"Medications: {len(medications)}")
    logger.info(f"Encounters: {len(encounters)}")
    logger.info(f"Lab Orders: {len(orders)}")
    logger.info(f"Medication Orders: {len(med_orders)}")
    logger.info(f"Accounts: {len(accounts)}")
    logger.info(f"Transactions: {len(transactions)}")
    logger.info(f"\nAll files written to: {OUTPUT_DIR}")
    logger.info("="*60)


if __name__ == '__main__':
    main()
