import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = { vus: 50, duration: '30s' };

export default function () {
  const payload = JSON.stringify({ type:"invite.created", data:{ inviteId:"test"+__VU+"_"+__ITER, storeUid:"s:1", channels:["sms"], payload:{to:"+9665...",text:"hi"} }});
  const res = http.post('http://localhost:3000/api/salla/webhook', payload, { headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+__ENV.SALLA_WEBHOOK_TOKEN }});
  check(res, { '202': (r)=> r.status===202 });
  sleep(0.2);
}
