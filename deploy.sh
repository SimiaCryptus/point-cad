#pnpm run build
#aws s3 rm --recursive s3://pcad.cognotik.com/

aws s3 cp --recursive ./theme-designer/ s3://pcad.cognotik.com/

aws cloudfront create-invalidation \
  --distribution-id EKDUFGIO25T04 \
  --paths "/*"
