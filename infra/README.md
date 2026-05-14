# FinServ-ODI-Demo — AWS infra

Terraform for the Meridian Capital FinServ Open Data Initiative demo. Provisions an Iceberg-on-S3 lake with Glue Catalog + Athena. **No Snowflake** — that's the entire pitch of this demo (compare against `Healthcare-EPIC-Snowflake-Demo`).

## What this creates

| Resource | Name |
|---|---|
| S3 bucket (lake) | `meridian-finserv-odi-lake-<suffix>` |
| Glue databases | `meridian_odi`, `bronze`, `silver`, `gold` |
| Athena workgroup | `meridian_odi` (engine v3, SSE_S3) |
| IAM role (Fivetran) | `meridian-odi-fivetran` |
| IAM role (dbt) | `meridian-odi-dbt` |

The S3 bucket has versioning, AES256 encryption, public-access blocked, a 60-day STANDARD_IA transition, and CORS for the GitHub Pages site.

Lake Formation is intentionally **not** provisioned. See the comment block at the bottom of `main.tf` for where to hook it in.

## Apply

```bash
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars — fill in fivetran_external_id + dbt_iam_user_arn

terraform init
terraform plan
terraform apply
```

State is local. That's fine for the demo — don't promote this to anything customer-facing without remote state + locking.

## Variables you must set

- `fivetran_external_id` — paste from the Fivetran destination setup screen
- `dbt_iam_user_arn` — ARN of the IAM user you created manually for the dbt runner

Optional:

- `aws_region` (default `us-east-1`)
- `suffix` (default = random 8-char hex)
- `fivetran_aws_account_id` (default `834469178297` — Fivetran's account)

## Wiring outputs into Fivetran

```bash
terraform output fivetran_role_arn
```

Paste that into Fivetran → **Destinations → Add destination → AWS S3 / Iceberg** → IAM Role ARN. Use `bronze` as the target Glue database. The bucket name comes from `terraform output lake_bucket`.

## Wiring outputs into dbt

dbt-athena reads these from the environment:

```bash
export AWS_REGION=$(terraform output -raw aws_region)
export LAKE_BUCKET=$(terraform output -raw lake_bucket)
export ATHENA_WORKGROUP=$(terraform output -raw athena_workgroup)
export DBT_ROLE_ARN=$(terraform output -raw dbt_role_arn)
```

Then have the dbt runner's IAM user assume `DBT_ROLE_ARN` (via `~/.aws/config` profile with `role_arn = ...` + `source_profile = ...`).

## Expected cost

Demo-scale (low query volume, <100 GB lake):

- S3 storage + requests: **~$2–5/mo**
- Athena scans: **~$1–5/mo** (depends on demo cadence)
- Glue catalog: free under 1M objects/month
- IAM/CloudWatch: negligible

**Total: ~$5–15/mo.** Big swings come from Athena scan volume — partition + Z-order in dbt to keep this honest.

## Out of scope

- VPC/networking (Glue + Athena are regional; no VPC needed)
- Lake Formation fine-grained access (noted in `main.tf` for future)
- Remote state backend (local state is fine for demo)
- Snowflake (explicitly skipped — this is the ODI demo)
