#pnpm run build

aws s3 cp --recursive ./dist/ s3://pcad.cognotik.com/ \
  --exclude terraform \
  --exclude .idea \

aws cloudfront create-invalidation \
  --distribution-id E1WN1IDTR4Q6T7 \
  --paths "/*"
