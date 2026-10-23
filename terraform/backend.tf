# Remote state so it never gets lost again.
# Run ./bootstrap-state.sh once before `terraform init`.
terraform {
  backend "s3" {
    bucket  = "cognotik-terraform-state"
    key     = "pcad.cognotik.com/terraform.tfstate"
    region  = "us-east-1"
    encrypt = true
    # Requires Terraform >= 1.10. On older versions, delete this line
    # (you'll just lose state locking).
    use_lockfile = true
  }
}