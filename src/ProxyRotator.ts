import {range} from "rxjs";
import {concatMap, delay, map, mergeMap, retry, retryWhen, take, tap, toArray} from "rxjs/operators";
var rp = require('request-promise');

export default class ProxyRotator {

  constructor(private ops){
    this.ops = Object.assign({apiKey: "", fetchProxies: 200, threads: 10, debug: false}, ops)
  }
  url = `http://falcon.proxyrotator.com:51337/?apiKey=${this.ops.apiKey}&get=true&userAgent=true`;

  fetchNewList(){
    let retryCount = 0;

    if(this.ops.debug)
      console.log("fetching ProxyRotator");

    return range(0, (this.ops.fetchProxies / this.ops.threads)).pipe(
      concatMap(()=>{
        return range(0, this.ops.threads).pipe(
          mergeMap(()=>{
            try {
              return request(this.url)
                .then(obj => {
                  obj.proto = "http";
                  return obj;
                }).catch(e => {
                  console.log('pr error', e.message);
                  return null;
                })
            } catch (e) {
              debugger;
              return null
            }
          }),
          tap(()=>{
            if(this.ops.debug)
              console.log(`ProxyRotator fetched 1 more of ${this.ops.threads}`);
          }),
          toArray(),
          map(proxies=>{
            //filter the null values
            return proxies.filter(prox=>!!prox);
          }))
      }),
      tap(()=>{
        if(this.ops.debug)
          console.log(`ProxyRotator fetched ${this.ops.threads} more of ${this.ops.fetchProxies}`);
      }),
      toArray(),
      map((twoDArr: any[][]): any[] =>{
        return [].concat(...twoDArr as any);
      })
    ).toPromise();

    function request(url){

      try {
        return rp({
          url,
          json: true
        })
          .catch(e => {
            if (retryCount < 10) {
              retryCount++;
              return new Promise((c, e) => {
                setTimeout(() => {
                  return request(url)
                    .then(c)
                    .catch(e)
                }, 1000);
              });
            }
            throw e;
          })
          .then(resp => {
            if (resp.error) {
              // if(resp.error === )
              // return request(url);
              console.error("Proxy", "ProxyRotator", "error", resp.error);
              throw new Error(resp.error);
            }
            return resp;
          })
      } catch(e) {
        debugger;
        throw e;
      }
    }
  }
}