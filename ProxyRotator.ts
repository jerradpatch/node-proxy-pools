
import * as rp from 'request-promise'
import {range} from "rxjs";
import {concatMap, map, mergeMap, tap, toArray} from "rxjs/operators";

export default class ProxyRotator {

  constructor(private fetchProxies = 200, private threads = 10, private debug?){}
  url = 'http://falcon.proxyrotator.com:51337/?apiKey=B2vP43FybLuh59zSRDVmNeCTdY6KZxrU&get=true&userAgent=true';

  fetchNewList(){
    console.log("fetching ProxyRotator");
    return range(0, (this.fetchProxies / this.threads)).pipe(
      concatMap(()=>{
        return range(0, this.threads).pipe(
          mergeMap(()=>{
            return request(this.url)
              .then(obj=>{
                obj.proto = "http";
                return obj;
              })
          }),
          tap(()=>{
            if(this.debug)
              console.log(`ProxyRotator fetched more"+ ${this.threads} of ${this.fetchProxies}`);
          }))
      }),
      toArray(),
      // map(items=>{
      //   return items.filter((item: any)=>{
      //     let hoursAgo = (item.lastChecked || Number.MAX_SAFE_INTEGER) / (60 * 60 * 1000);
      //     return hoursAgo < 24;
      //   })
      // })
    ).toPromise();

    function request(url){

      return rp({
        url,
        json: true}).then(resp=>{
          if(resp.error)
            return request(url);
          return resp;
      })
    }
  }
}