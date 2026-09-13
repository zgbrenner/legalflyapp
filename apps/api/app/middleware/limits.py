"""Bounded single-worker limiter. Multi-instance hosts also need an edge limiter."""
from collections import OrderedDict, deque
from threading import Lock
from time import monotonic
from starlette.responses import JSONResponse
class RequestLimits:
    def __init__(self,app,per_minute=30,max_bytes=32768):
        self.app=app;self.per_minute=per_minute;self.max_bytes=max_bytes
        self.clients=OrderedDict();self.lock=Lock()
    async def __call__(self,scope,receive,send):
        if scope['type']!='http' or scope['method']!='POST':
            return await self.app(scope,receive,send)
        host=(scope.get('client') or ('unknown',))[0];now=monotonic()
        with self.lock:
            times=self.clients.setdefault(host,deque())
            while times and times[0]<=now-60:times.popleft()
            limited=self.per_minute>0 and len(times)>=self.per_minute
            if not limited:times.append(now)
            self.clients.move_to_end(host)
            while len(self.clients)>4096:self.clients.popitem(last=False)
        if limited:
            return await JSONResponse({'detail':'Too many requests. Try again shortly.'},status_code=429,headers={'Retry-After':'60'})(scope,receive,send)
        body=bytearray()
        while True:
            message=await receive()
            if message['type']=='http.disconnect':return
            body.extend(message.get('body',b''))
            if len(body)>self.max_bytes:
                return await JSONResponse({'detail':'Request body too large.'},status_code=413)(scope,receive,send)
            if not message.get('more_body',False):break
        delivered=False
        async def replay():
            nonlocal delivered
            if not delivered:
                delivered=True
                return {'type':'http.request','body':bytes(body),'more_body':False}
            return await receive()
        await self.app(scope,replay,send)
