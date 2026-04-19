Invoke-WebRequest -Uri "http://localhost:3000/api/inbound/resend" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{
    "from": "flyingcloud456@gmail.com",
    "to": ["e.e76aa2ac-f1e4-414e-a275-899ca657fcd8@test.domain"],
    "subject": "Re: Quote from apex inc",
    "text": "Thanks for the quote. Can you clarify the timeline for the GLP study?",
    "headers": {}
  }'