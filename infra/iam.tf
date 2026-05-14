# ============================================
# IAM — Fivetran ingest role + dbt runner role
# ============================================

data "aws_caller_identity" "current" {}

# --------------------------------------------
# Fivetran ingest role
# Trusted by Fivetran's AWS account, gated by the external ID Fivetran
# generates on the destination setup screen.
# --------------------------------------------
data "aws_iam_policy_document" "fivetran_trust" {
    statement {
        effect  = "Allow"
        actions = ["sts:AssumeRole"]

        principals {
            type        = "AWS"
            identifiers = ["arn:aws:iam::${var.fivetran_aws_account_id}:root"]
        }

        condition {
            test     = "StringEquals"
            variable = "sts:ExternalId"
            values   = [var.fivetran_external_id]
        }
    }
}

resource "aws_iam_role" "fivetran" {
    name               = "meridian-odi-fivetran"
    description        = "Fivetran assume-role for landing data into the bronze layer of the FinServ ODI demo lake."
    assume_role_policy = data.aws_iam_policy_document.fivetran_trust.json

    tags = var.tags
}

data "aws_iam_policy_document" "fivetran_lake_access" {
    # Read/write everything Fivetran needs in the lake bucket (bronze prefix).
    statement {
        sid    = "BucketLevel"
        effect = "Allow"
        actions = [
            "s3:ListBucket",
            "s3:GetBucketLocation",
            "s3:GetBucketVersioning",
        ]
        resources = [aws_s3_bucket.lake.arn]
    }

    statement {
        sid    = "ObjectLevel"
        effect = "Allow"
        actions = [
            "s3:GetObject",
            "s3:GetObjectVersion",
            "s3:PutObject",
            "s3:DeleteObject",
            "s3:AbortMultipartUpload",
        ]
        resources = [
            "${aws_s3_bucket.lake.arn}/bronze/*",
            "${aws_s3_bucket.lake.arn}/athena-results/*",
        ]
    }

    # Register/update Iceberg tables in the bronze Glue DB.
    statement {
        sid    = "GlueCatalogBronze"
        effect = "Allow"
        actions = [
            "glue:GetDatabase",
            "glue:GetDatabases",
            "glue:CreateTable",
            "glue:UpdateTable",
            "glue:DeleteTable",
            "glue:GetTable",
            "glue:GetTables",
            "glue:GetPartition",
            "glue:GetPartitions",
            "glue:BatchCreatePartition",
            "glue:BatchDeletePartition",
            "glue:BatchUpdatePartition",
            "glue:CreatePartition",
            "glue:UpdatePartition",
            "glue:DeletePartition",
        ]
        resources = [
            "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:catalog",
            aws_glue_catalog_database.bronze.arn,
            "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/${aws_glue_catalog_database.bronze.name}/*",
        ]
    }
}

resource "aws_iam_role_policy" "fivetran_lake_access" {
    name   = "meridian-odi-fivetran-lake-access"
    role   = aws_iam_role.fivetran.id
    policy = data.aws_iam_policy_document.fivetran_lake_access.json
}

# --------------------------------------------
# dbt runner role
# Trusted by a manually-created IAM user (var.dbt_iam_user_arn).
# --------------------------------------------
data "aws_iam_policy_document" "dbt_trust" {
    statement {
        effect  = "Allow"
        actions = ["sts:AssumeRole"]

        principals {
            type        = "AWS"
            identifiers = [var.dbt_iam_user_arn]
        }
    }
}

resource "aws_iam_role" "dbt" {
    name               = "meridian-odi-dbt"
    description        = "dbt runner role — reads bronze, read/writes silver+gold, runs Athena queries."
    assume_role_policy = data.aws_iam_policy_document.dbt_trust.json

    tags = var.tags
}

data "aws_iam_policy_document" "dbt_lake_access" {
    statement {
        sid    = "BucketLevel"
        effect = "Allow"
        actions = [
            "s3:ListBucket",
            "s3:GetBucketLocation",
        ]
        resources = [aws_s3_bucket.lake.arn]
    }

    # Read-only on bronze.
    statement {
        sid    = "BronzeRead"
        effect = "Allow"
        actions = [
            "s3:GetObject",
            "s3:GetObjectVersion",
        ]
        resources = ["${aws_s3_bucket.lake.arn}/bronze/*"]
    }

    # Read/write on silver, gold, dbt artifacts, athena results.
    statement {
        sid    = "SilverGoldWrite"
        effect = "Allow"
        actions = [
            "s3:GetObject",
            "s3:GetObjectVersion",
            "s3:PutObject",
            "s3:DeleteObject",
            "s3:AbortMultipartUpload",
        ]
        resources = [
            "${aws_s3_bucket.lake.arn}/silver/*",
            "${aws_s3_bucket.lake.arn}/gold/*",
            "${aws_s3_bucket.lake.arn}/dbt/*",
            "${aws_s3_bucket.lake.arn}/athena-results/*",
        ]
    }

    # Athena workgroup execution.
    statement {
        sid    = "AthenaWorkgroup"
        effect = "Allow"
        actions = [
            "athena:StartQueryExecution",
            "athena:StopQueryExecution",
            "athena:GetQueryExecution",
            "athena:GetQueryResults",
            "athena:GetQueryResultsStream",
            "athena:GetWorkGroup",
            "athena:ListQueryExecutions",
            "athena:BatchGetQueryExecution",
        ]
        resources = [aws_athena_workgroup.meridian_odi.arn]
    }

    # Glue catalog — full CRUD on silver/gold tables, read everywhere.
    statement {
        sid    = "GlueRead"
        effect = "Allow"
        actions = [
            "glue:GetDatabase",
            "glue:GetDatabases",
            "glue:GetTable",
            "glue:GetTables",
            "glue:GetPartition",
            "glue:GetPartitions",
        ]
        resources = [
            "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:catalog",
            aws_glue_catalog_database.meridian_odi.arn,
            aws_glue_catalog_database.bronze.arn,
            aws_glue_catalog_database.silver.arn,
            aws_glue_catalog_database.gold.arn,
            "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/${aws_glue_catalog_database.bronze.name}/*",
            "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/${aws_glue_catalog_database.silver.name}/*",
            "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/${aws_glue_catalog_database.gold.name}/*",
        ]
    }

    statement {
        sid    = "GlueWriteSilverGold"
        effect = "Allow"
        actions = [
            "glue:CreateTable",
            "glue:UpdateTable",
            "glue:DeleteTable",
            "glue:BatchCreatePartition",
            "glue:BatchDeletePartition",
            "glue:BatchUpdatePartition",
            "glue:CreatePartition",
            "glue:UpdatePartition",
            "glue:DeletePartition",
        ]
        resources = [
            "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:catalog",
            aws_glue_catalog_database.silver.arn,
            aws_glue_catalog_database.gold.arn,
            "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/${aws_glue_catalog_database.silver.name}/*",
            "arn:aws:glue:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/${aws_glue_catalog_database.gold.name}/*",
        ]
    }
}

resource "aws_iam_role_policy" "dbt_lake_access" {
    name   = "meridian-odi-dbt-lake-access"
    role   = aws_iam_role.dbt.id
    policy = data.aws_iam_policy_document.dbt_lake_access.json
}
