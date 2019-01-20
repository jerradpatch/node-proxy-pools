import * as rp from 'request-promise'
import {timer} from 'rxjs';
import {mergeMap, share} from "rxjs/operators";

export class SpymeClient {

  private $ipList;

  constructor(){

    this.$ipList = timer(0, 25 * 60 * 60 * 1000).pipe(
      mergeMap(()=>{
        return rp({
          url:"http://spys.me/proxy.txt"
        }).then(this.parse.bind(this));
      })
    )
  }

  private parse(data: string){
    return data
      .split(/\n|\r\n/)
      .slice(3, data.length - 2)
      .filter(val=>!!val)
      .map(item=>{
        let [ipPort, meta, googPassed] = item.split(" ");
        let [ip, port] = ipPort.split(":");
        let [country, anon, sslSupport] = meta.split("-");
        let tested = googPassed === '+';
        let ssl = (sslSupport || "").indexOf('S') !== -1;
        return {
          ip,
          port: +port,
          country,
          anon,
          ssl,
          tested,
          proto:'http'
        }
      });
  }

  public getList(){
    return this.$ipList.pipe(share());
  }
}