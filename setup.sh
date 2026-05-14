#!/bin/bash

# Healthcare Epic Clarity Demo - Setup Helper Script
# This script guides you through the complete setup process

set -e

echo "=========================================="
echo "Healthcare Epic Clarity Demo Setup"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}[WARN] .env file not found${NC}"
    echo "Creating .env from template..."
    cp .env.example .env
    echo -e "${GREEN}[OK] Created .env file${NC}"
    echo ""
    echo "Please edit .env with your credentials:"
    echo "  nano .env"
    echo ""
    read -p "Press Enter after configuring .env..."
fi

# Load environment variables
source .env

echo ""
echo "=========================================="
echo "Step 1: Install Python Dependencies"
echo "=========================================="
echo ""

if command -v pip &> /dev/null; then
    pip install -r requirements.txt
    echo -e "${GREEN}[OK] Python dependencies installed${NC}"
else
    echo -e "${RED}[ERROR] pip not found. Please install Python 3.9+${NC}"
    exit 1
fi

echo ""
echo "=========================================="
echo "Step 2: Check Terraform Installation"
echo "=========================================="
echo ""

if command -v terraform &> /dev/null; then
    TERRAFORM_VERSION=$(terraform version | head -n 1)
    echo -e "${GREEN}[OK] Terraform installed: $TERRAFORM_VERSION${NC}"
else
    echo -e "${YELLOW}[WARN] Terraform not found${NC}"
    echo "Please install Terraform from https://www.terraform.io/downloads"
    read -p "Press Enter after installing Terraform..."
fi

echo ""
echo "=========================================="
echo "Step 3: Generate Sample Data"
echo "=========================================="
echo ""

read -p "Generate Epic Clarity sample data? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    python scripts/generate_data.py
    echo -e "${GREEN}[OK] Sample data generated${NC}"
fi

echo ""
echo "=========================================="
echo "Step 4: Provision AWS RDS (Optional)"
echo "=========================================="
echo ""
echo "This will create an AWS RDS SQL Server instance."
echo "Cost: ~$100/month for db.t3.medium"
echo ""

read -p "Provision RDS instance with Terraform? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    cd infra
    
    if [ ! -f terraform.tfvars ]; then
        cp terraform.tfvars.example terraform.tfvars
        echo "Please edit infra/terraform.tfvars with your values"
        read -p "Press Enter after editing terraform.tfvars..."
    fi
    
    terraform init
    terraform plan
    
    read -p "Apply Terraform plan? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        terraform apply
        
        # Extract RDS endpoint
        RDS_ENDPOINT=$(terraform output -raw rds_address)
        echo ""
        echo "RDS Endpoint: $RDS_ENDPOINT"
        echo ""
        echo "Add this to your .env file:"
        echo "RDS_ENDPOINT=$RDS_ENDPOINT"
        read -p "Press Enter after updating .env..."
    fi
    
    cd ..
fi

echo ""
echo "=========================================="
echo "Step 5: Load Data to RDS (Optional)"
echo "=========================================="
echo ""

if [ -z "$RDS_ENDPOINT" ]; then
    echo -e "${YELLOW}[WARN] RDS_ENDPOINT not set. Skipping data load.${NC}"
else
    read -p "Load data to RDS? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        python scripts/load_to_rds.py
        echo -e "${GREEN}[OK] Data loaded to RDS${NC}"
    fi
fi

echo ""
echo "=========================================="
echo "Step 6: Configure Fivetran (Optional)"
echo "=========================================="
echo ""

read -p "Configure Fivetran connector? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    cd infra
    terraform apply -target=fivetran_connector.healthcare_clarity
    
    CONNECTOR_ID=$(terraform output -raw connector_id)
    echo ""
    echo "Fivetran Connector ID: $CONNECTOR_ID"
    echo ""
    
    read -p "Trigger initial sync? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cd ..
        python scripts/trigger_fivetran_sync.py $CONNECTOR_ID
    fi
    
    cd ..
fi

echo ""
echo "=========================================="
echo "Step 7: Setup dbt Project"
echo "=========================================="
echo ""

read -p "Setup dbt project? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    cd transform
    
    echo "Installing dbt packages..."
    dbt deps
    
    echo "Loading seed data..."
    dbt seed
    
    echo "Running staging models..."
    dbt run --select staging
    
    echo "Testing staging models..."
    dbt test --select staging
    
    echo "Running all models..."
    dbt run
    
    echo "Running all tests..."
    dbt test
    
    echo -e "${GREEN}[OK] dbt project setup complete${NC}"
    
    cd ..
fi

echo ""
echo "=========================================="
echo "Step 8: Validation"
echo "=========================================="
echo ""

read -p "Run validation checks? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    python scripts/validate_setup.py
fi

echo ""
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Review README.md for detailed documentation"
echo "  2. Explore dbt models in transform/models/"
echo "  3. Run sample queries against DuckDB"
echo "  4. Generate dbt docs: cd transform && dbt docs serve"
echo ""
echo "To tear down infrastructure:"
echo "  cd infra && terraform destroy"
echo ""
