output "lake_bucket" {
    description = "Name of the S3 lake bucket. Export as LAKE_BUCKET for dbt."
    value       = aws_s3_bucket.lake.bucket
}

output "lake_bucket_arn" {
    description = "ARN of the S3 lake bucket."
    value       = aws_s3_bucket.lake.arn
}

output "glue_db_name" {
    description = "Top-level Glue database for the demo."
    value       = aws_glue_catalog_database.meridian_odi.name
}

output "glue_medallion_dbs" {
    description = "Glue databases for each medallion layer."
    value = {
        bronze = aws_glue_catalog_database.bronze.name
        silver = aws_glue_catalog_database.silver.name
        gold   = aws_glue_catalog_database.gold.name
    }
}

output "athena_workgroup" {
    description = "Athena workgroup name. Export as ATHENA_WORKGROUP for dbt."
    value       = aws_athena_workgroup.meridian_odi.name
}

output "fivetran_role_arn" {
    description = "Paste this into Fivetran's destination setup (AWS IAM Role ARN field)."
    value       = aws_iam_role.fivetran.arn
}

output "dbt_role_arn" {
    description = "Role ARN for the dbt runner to assume. Configure in ~/.aws/config or profiles.yml."
    value       = aws_iam_role.dbt.arn
}

output "aws_region" {
    description = "Region everything lives in. Export as AWS_REGION for dbt."
    value       = var.aws_region
}
