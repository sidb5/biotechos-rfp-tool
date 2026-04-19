$body = @{
  from      = "cro@veridian-test.com"
  to        = "e.9c8aac02-3759-4282-967a-0ed7982cd57a@inbound.biotechos.dev"
  subject   = "Re: Quote Request — Veridian Therapeutics"
  text      = "Thank you for reaching out. We have reviewed your requirements and are happy to proceed. Our team has capacity for the hERG and Ames assays within your requested 8-week timeline. Could you confirm the compound class and whether GLP certification is required for all assays? Looking forward to working together."
  messageId = "<test-reply-$(Get-Date -Format 'yyyyMMddHHmmss')@veridian-test.com>"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3000/api/inbound/resend" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body