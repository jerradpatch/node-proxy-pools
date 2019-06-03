import Axios from 'axios';
import Bottleneck from "bottleneck";

export default class ProxyRotator {

  limiter;

  constructor(private ops) {
    this.ops = Object.assign({apiKey: "", fetchProxies: 200, threads: 10, debug: false}, ops);

    this.limiter = new Bottleneck({
      maxConcurrent: ops.threads,
      minTime: 100
    });
  }

  url = `http://falcon.proxyrotator.com:51337/?apiKey=${this.ops.apiKey}&get=true&userAgent=true`;

  fetchNewList(): Promise<any[]> {
    let retryCount = 0;

    if (this.ops.debug)
      console.info("fetching ProxyRotator");

    let fetchProms = [] as Promise<any>[];

    for (let i = 0; i < this.ops.fetchProxies; i++) {
      let reqA = reqLimit.call(this, this.url)
          .then(this.formatData)
      fetchProms.push(reqA);
    }

    return (this.ops.debug ?
      Promise.all(fetchProms).then((re) => {
        console.info("completed ProxyRotator");
        return re;
      }) :
      Promise.all(fetchProms));

    function reqLimit(url): Promise<any> {
      return this.limiter.schedule(request.bind(this, url))
        .catch(e => {
          if(this.ops.debug)
            console.info("ProxyRotator, request error", e.message);

          if(e.response && e.response.data){
            if(e.response.data.error) {
              //should never be reached due to bottle neck js
              // if(e.response.data.error === "Concurrent requests limit reached")
                throw e;


            }
          }
          if (retryCount < 10) {
            retryCount++;
            return reqLimit.call(this,url);
          }
          return null;
        })
    }

    function request(url): Promise<any> {
      return Axios({
        url
      })
      .then((resp: any) => {
        if (!resp.data)
          throw new Error('no data in the return from proxy rotator');

        if (resp.data.error) {
          throw new Error(resp.data.error);
        }

        return resp.data;
      })
    }
  }

  formatData(data){
    if(!data)
      return data;

    let port;
    try {
      port = parseInt(data.port, 10);
    } catch(e){
      port = 0;
    }
    return {
      host: data.ip || "",
      port
    }
  }
}