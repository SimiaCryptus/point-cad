#!/usr/bin/env bash
# One-time: create the S3 bucket that holds Terraform state.
set -euo pipefail
STATE_BUCKET="${STATE_BUCKET:-cognotik-terraform-state}"
REGION="us-east-1"

if aws s3api head-bucket --bucket "$STATE_BUCKET" 2>/dev/null; then
  echo "State bucket $STATE_BUCKET already exists."
else
  aws s3api create-bucket --bucket "$STATE_BUCKET" --region "$REGION"
fi

aws s3api put-bucket-versioning --bucket "$STATE_BUCKET" \
  --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket "$STATE_BUCKET" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
aws s3api put-public-access-block --bucket "$STATE_BUCKET" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

echo "Done. Now run: terraform init -migrate-state"