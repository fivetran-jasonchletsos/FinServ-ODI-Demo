# ============================================
# FinServ-ODI-Demo — AWS infrastructure
# Iceberg-on-S3 lake + Glue Catalog + Athena
# (No Snowflake — that's the whole pitch.)
# ============================================

provider "aws" {
    region = var.aws_region

    default_tags {
        tags = var.tags
    }
}

# ---- suffix for globally-unique names ----
resource "random_id" "suffix" {
    byte_length = 4
}

locals {
    suffix      = var.suffix != "" ? var.suffix : random_id.suffix.hex
    lake_bucket = "meridian-finserv-odi-lake-${local.suffix}"
}

# ============================================
# S3 — the lake
# ============================================
resource "aws_s3_bucket" "lake" {
    bucket = local.lake_bucket

    tags = merge(var.tags, {
        Name = local.lake_bucket
        Role = "data-lake"
    })
}

resource "aws_s3_bucket_versioning" "lake" {
    bucket = aws_s3_bucket.lake.id

    versioning_configuration {
        status = "Enabled"
    }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "lake" {
    bucket = aws_s3_bucket.lake.id

    rule {
        apply_server_side_encryption_by_default {
            sse_algorithm = "AES256"
        }
    }
}

resource "aws_s3_bucket_public_access_block" "lake" {
    bucket = aws_s3_bucket.lake.id

    block_public_acls       = true
    block_public_policy     = true
    ignore_public_acls      = true
    restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "lake" {
    bucket = aws_s3_bucket.lake.id

    rule {
        id     = "transition-to-ia"
        status = "Enabled"

        filter {}

        transition {
            days          = 60
            storage_class = "STANDARD_IA"
        }
    }
}

resource "aws_s3_bucket_cors_configuration" "lake" {
    bucket = aws_s3_bucket.lake.id

    cors_rule {
        allowed_methods = ["GET"]
        allowed_origins = ["https://fivetran-jasonchletsos.github.io"]
        allowed_headers = ["*"]
        expose_headers  = ["ETag"]
        max_age_seconds = 3000
    }
}

# Note: bronze/, silver/, gold/, athena-results/, dbt/ are S3 prefixes — no
# resource needed. They materialize the first time Fivetran/dbt/Athena writes
# under them.

# ============================================
# Glue Data Catalog — medallion DBs
# ============================================
resource "aws_glue_catalog_database" "meridian_odi" {
    name        = "meridian_odi"
    description = "Top-level Glue database for the FinServ ODI demo. Medallion schemas live in bronze/silver/gold."

    tags = var.tags
}

resource "aws_glue_catalog_database" "bronze" {
    name        = "bronze"
    description = "Bronze layer — raw landings from Fivetran connectors."

    tags = var.tags
}

resource "aws_glue_catalog_database" "silver" {
    name        = "silver"
    description = "Silver layer — cleaned/conformed models from dbt."

    tags = var.tags
}

resource "aws_glue_catalog_database" "gold" {
    name        = "gold"
    description = "Gold layer — business-ready marts from dbt."

    tags = var.tags
}

# ============================================
# Athena workgroup
# ============================================
resource "aws_athena_workgroup" "meridian_odi" {
    name = "meridian_odi"

    configuration {
        enforce_workgroup_configuration    = true
        publish_cloudwatch_metrics_enabled = true
        engine_version {
            selected_engine_version = "Athena engine version 3"
        }

        result_configuration {
            output_location = "s3://${aws_s3_bucket.lake.bucket}/athena-results/"

            encryption_configuration {
                encryption_option = "SSE_S3"
            }
        }
    }

    tags = var.tags
}

# ============================================
# Lake Formation — intentionally skipped for the demo.
# If/when fine-grained (column/row-level) access control is needed:
#   - aws_lakeformation_resource on the lake bucket
#   - aws_lakeformation_permissions granting the fivetran/dbt roles
#     SELECT/ALTER on the bronze/silver/gold DBs
# For the demo, IAM + Glue resource policies are enough.
# ============================================
