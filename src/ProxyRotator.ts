import {range} from "rxjs";
import {concatMap, mergeMap, tap, toArray} from "rxjs/operators";
var rp = require('request-promise');

export default class ProxyRotator {

  constructor(private ops){
    this.ops = Object.assign({apiKey: "", fetchProxies: 200, threads: 10, debug: false}, ops)
  }
  url = `http://falcon.proxyrotator.com:51337/?apiKey=${this.ops.apiKey}&get=true&userAgent=true`;

  fetchNewList(){
    if(this.ops.debug)
      console.log("fetching ProxyRotator");

    return range(0, (this.ops.fetchProxies / this.ops.threads)).pipe(
      concatMap(()=>{
        return range(0, this.ops.threads).pipe(
          mergeMap(()=>{
            return request(this.url)
              .then(obj=>{
                obj.proto = "http";
                return obj;
              })
          }),
          tap(()=>{
            if(this.ops.debug)
              console.log(`ProxyRotator fetched more"+ ${this.ops.threads} of ${this.ops.fetchProxies}`);
          }))
      }),
      toArray()
    ).toPromise();

    let retryCount = 0;
    function request(url){

      return rp({
          url,
          json: true})
        .then(resp=>{
          if(resp.error)
            return request(url);
          return resp;
        })
        .catch(e=>{
          if(retryCount < 10)
            return request(url);
          throw e;
        })
    }
  }
}