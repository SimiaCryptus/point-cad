#!/usr/bin/env bash
# Re-adopts AWS resources that exist but are missing from Terraform state.
# Safe to run repeatedly: skips anything already in state or not in AWS.
set -euo pipefail

DOMAIN="${DOMAIN:-pcad.cognotik.com}"
FUNC_NAME="${DOMAIN//./-}-rewrite-index"
OAC_NAME="${DOMAIN}-oac"

STATE="$(terraform state list 2>/dev/null || true)"

try_import() {
  local addr="$1" id="$2"
  if grep -qxF "$addr" <<<"$STATE"; then
    echo "✓ $addr already in state"
  elif [[ -z "$id" || "$id" == "None" || "$id" == "null" ]]; then
    echo "- $addr not found in AWS (will be created)"
  else
    echo "→ importing $addr ($id)"
    terraform import "$addr" "$id"
  fi
}

# --- S3 ---
if aws s3api head-bucket --bucket "$DOMAIN" 2>/dev/null; then
  try_import aws_s3_bucket.website                     "$DOMAIN"
  try_import aws_s3_bucket_public_access_block.website "$DOMAIN"
  try_import aws_s3_bucket_versioning.website          "$DOMAIN"
  if aws s3api get-bucket-policy --bucket "$DOMAIN" >/dev/null 2>&1; then
    try_import aws_s3_bucket_policy.website "$DOMAIN"
  fi
  for pair in "index:index.html" "error:error.html"; do
    name="${pair%%:*}"; key="${pair#*:}"
    if aws s3api head-object --bucket "$DOMAIN" --key "$key" >/dev/null 2>&1; then
      try_import "aws_s3_object.$name" "$DOMAIN/$key"
    fi
  done
else
  echo "- bucket $DOMAIN not found (will be created)"
fi

# --- ACM (us-east-1) ---
CERT_ARN="$(aws acm list-certificates --region us-east-1 \
  --certificate-statuses ISSUED PENDING_VALIDATION \
  --query "CertificateSummaryList[?DomainName=='$DOMAIN'].CertificateArn | [0]" \
  --output text)"
try_import aws_acm_certificate.website "$CERT_ARN"

# --- CloudFront ---
OAC_ID="$(aws cloudfront list-origin-access-controls \
  --query "OriginAccessControlList.Items[?Name=='$OAC_NAME'].Id | [0]" \
  --output text)"
try_import aws_cloudfront_origin_access_control.website "$OAC_ID"

if aws cloudfront describe-function --name "$FUNC_NAME" >/dev/null 2>&1; then
  try_import aws_cloudfront_function.rewrite_index "$FUNC_NAME"
else
  echo "- function $FUNC_NAME not found (will be created)"
fi

DIST_ID="$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Aliases.Items && contains(Aliases.Items, '$DOMAIN')].Id | [0]" \
  --output text)"
try_import aws_cloudfront_distribution.website "$DIST_ID"

# Route53 records use allow_overwrite, and aws_acm_certificate_validation
# is not a real AWS object, so neither needs importing.

echo
echo "Import complete. Now run: terraform plan"