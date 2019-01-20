# Node-proxy-pools
The library aims to solve the issue of unreliable proxies by creating a pool of proxies to send requests to. 
This pool of proxies will be reduced when a proxy is found to not work or times out. When all proxies have been exhausted
the pool will be refilled. If a request is made on a proxy that fails, the request will be given to a different proxy
until that request succeeds or fails due to an error that is non-proxy related (http req.status > 200).

Right now, this lib only works with "https://www.proxyrotator.com" but could be expanded. A key will need to be provided
for their service. 

ex:
```javascript
let npl = new NodeProxyPools({roOps:{apiKey: roApiKey}});

npl.request({
  uri: 'https://www.google.com',
  resolveWithFullResponse: true
}).then(resp => {
  //proxied response
})
```

## Performance
The following chart represents the improvements using this lib vs sequentially fetching a single resource (due to rate limiting).
The throttling represents the limitation imposed by the remote server. The requests represents the total amount of requests
to be made by this lib and by the sequential fetching process. The "diff time" represents the difference in completion 
times between the two processes. Ex, for a resource that requires a 10s throttle where 10 requests need to be made there is
a -1.778 second difference between the proxied and sequential requests, meaning proxied requests were faster than non-proxied
 requests by 1.778 seconds.

throttle | requests | diff time
-------- | -------- | ---------
 10s | 10 | -1.778 sec
  5s | 10 | -0.4603 sec  
  1s | 10 | -0.07085 sec  
  0.5s | 10 |  0.1278 sec 
  1s | 5 | 0.181333 sec
  
  
