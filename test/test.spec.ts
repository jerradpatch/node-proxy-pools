

import * as chai from 'chai';
import chaiHttp = require('chai-http');
import 'mocha';
import {NodeProxyPools} from "../src/index";
import {concatMap, delay, map, mergeMap, take, tap, toArray} from "rxjs/operators";
import {forkJoin, range} from "rxjs";
var rp = require('request-promise');
import {fromPromise} from "rxjs/internal-compatibility";
import ProxyRotator from "../src/ProxyRotator";

chai.use(chaiHttp);
const expect = chai.expect;

let roApiKey = "B2vP43FybLuh59zSRDVmNeCTdY6KZxrU";
let uri = 'https://www.google.com';

describe('All features should work', () => {

  describe('ProxyRotator tests', () => {
    it('fetchNewList should return a new list every time', function(done) {
      this.timeout(30 * 1000);

      let pr = new ProxyRotator({apiKey: roApiKey, debug: true});
      range(0 ,10).pipe(
        concatMap(()=> {
          return pr.fetchNewList()
        }),
        toArray(),
        take(1))
        .subscribe(lists=>{
          expect(lists).to.have.length(10);
          done();
        })
    })
  });

  describe('The proxies work as expected, actual', () => {
    it('when starting up it should return a list of proxies', (done) => {
      let npl = new NodeProxyPools({roOps:{apiKey: roApiKey, debug:true}});
      npl.fetchAllProxies().then((list) => {
        expect(list.length).to.be.gt(0);
        done();
      })
    })

    it('when all proxies have been invalidated new proxies should be fetched', function(done) {
      this.timeout(30 * 1000)
      let npl = new NodeProxyPools({roOps:{apiKey: roApiKey, debug:true}});

      npl['proxyList'].then((list)=>{
        invalidateAllProxies(list, npl['failCountLimit']);

        range(0, 10).pipe(
          concatMap(()=>{
            //request and invalidate
            return npl['proxyList'].then((list)=>{

              invalidateAllProxies(list, npl['failCountLimit']);

              return npl.request({
                  gzip: true,
                  method: 'GET',
                  uri,
                  timeout: 30 * 1000,
                  maxRedirects: '10',
                  followRedirect: true,
                  rejectUnauthorized: false,
                  insecure: true,
                  headers: {
                    'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) snap Chromium/71.0.3578.98 Chrome/71.0.3578.98 Safari/537.36'
                  }
                })
              })
          }),
          toArray())
          .subscribe(()=>{
            done();
          });
      })

      function invalidateAllProxies(proxyList, limit){
        proxyList.forEach(proxy=>{
          proxy.failCount = limit + 1;
        })
      }
    })

    it('getReadyProxy should return a single proxy', (done) => {
      let npl = new NodeProxyPools({roOps:{apiKey: roApiKey}});
      npl['getReadyProxy']().then((prox) => {
        expect(prox).to.not.be.undefined;
        done();
      })
    })

    it('getReadyProxy should return different proxy every time', (done) => {
      let npl = new NodeProxyPools({roOps:{apiKey: roApiKey}});
      let proms: any[] = [];
      for (let i = 0; i < 20; i++) {
        proms.push(npl['getReadyProxy']());
      }
      Promise.all(proms).then((proms) => {
        let distinct = proms.reduce((acc, c) => {
          acc[c.proto + " " + c.ip + " " + c.port] = null;
          return acc;
        }, {});
        expect(Object.keys(distinct)).to.have.length(20);
        done();
      })
    })
  })

  describe('The request function', () => {
    it('requests should all be made with a different ip address', (done)=>{
      let npl = new NodeProxyPools({roOps:{apiKey: roApiKey}});
      let ipPRoms: any[] = [];
      for(let i = 0; i < 20; ++i) {
        ipPRoms.push(npl.request({
          uri,
          resolveWithFullResponse: true
        }).then(resp => {
          return resp.request.proxy.href;
        }));
      }
      Promise.all(ipPRoms).then(ips=>{
        let unq = ips.reduce((acc, c)=>{
          acc[c] = null;
          return acc;
        }, {});

        expect(Object.keys(unq)).to.have.lengthOf(20);
        done();

      });
    });

    // not consistent

    // it('requests should not be made with a proxy surpassing the fail count', (done)=>{
    //   let npl = new NodeProxyPools({roOps:{apiKey: roApiKey}});
    //   let nonFailProxy;
    //   npl['$proxyList'] = npl['proxyList']
    //     .then((list: any[])=>{
    //       for(let i = 0; i < list.length - 1; ++i) {
    //         list[i].failCount = npl['failCountLimit'] + 1;
    //       }
    //       nonFailProxy = list[list.length - 1];
    //       return list;
    //     });
    //
    //
    //   npl.request({
    //     uri,
    //     resolveWithFullResponse: true
    //   }).then(resp => {
    //     let port = +resp.request.proxy.port;
    //     let proto = resp.request.proxy.protocol;
    //     expect(+nonFailProxy.port).to.equal(port);
    //     expect(nonFailProxy.proto+":").to.equal(proto);
    //
    //     done();
    //   })
    // })

    it('if failing the passFn then the request should be tried again', (done)=>{
      let timesPassFnCalled = 0;

      let npl = new NodeProxyPools({
        roOps:{
          apiKey: roApiKey
        },
        passFn(resp){
          timesPassFnCalled++;
          return timesPassFnCalled > 2
        }});

      npl.request({
        uri,
        resolveWithFullResponse: true
      }).then(resp=>{
        expect(timesPassFnCalled).to.be.gt(1);
        done();
      })
    })

    it('if failing the passFn from the request then the request should be tried again', (done)=>{
      let timesPassFnCalled = 0;

      let npl = new NodeProxyPools({
        roOps:{
          apiKey: roApiKey
        }});

      npl.request({
        uri,
        resolveWithFullResponse: true,
        nppOps: {
          passFn(resp){
            timesPassFnCalled++;
            return timesPassFnCalled > 2
          }
        }
      }).then(resp=>{
        expect(timesPassFnCalled).to.be.gt(1);
        done();
      })
    })

    it('if the failFn returns true then the request should be tried again', (done)=>{
      let timesFnCalled = 0;

      let npl = new NodeProxyPools({
        roOps:{
          apiKey: roApiKey
        },
        failFn(resp){
          timesFnCalled++;
          return timesFnCalled < 2
        }});

      npl.request({
        uri: 'falseProto://www.falsePlace123$$.com',
        resolveWithFullResponse: true
      }).then(resp=>{
        done(new Error('a response should not have been delivered'));
      }).catch(e=>{
        expect(timesFnCalled).to.be.gt(1);
        done();
      })
    })

    it('if the failFn returns on the request true then the request should be tried again', (done)=>{
      let timesFnCalled = 0;

      let npl = new NodeProxyPools({
        roOps:{
          apiKey: roApiKey
        }});

      npl.request({
        uri: 'falseProto://www.falsePlace123$$.com',
        resolveWithFullResponse: true,
        nppOps:{
          failFn(resp){
            timesFnCalled++;
            return timesFnCalled < 2
          }
        }
      }).then(resp=>{
        done(new Error('a response should not have been delivered'));
      }).catch(e=>{
        expect(timesFnCalled).to.be.gt(1);
        done();
      })
    })
  })

  describe('Performance tests', () => {
    it('preforming requests with a proxy in parallel should be faster then requests without proxy in series', (done)=>{
      let testRang = 5;
      let throttle = 1 * 1000;
      let date: any = new Date();
      let npl = new NodeProxyPools({roOps:{apiKey: roApiKey}});
      npl['proxyList'].then(()=> {
        return forkJoin(
          range(0, testRang).pipe(
            mergeMap(() => {
              return npl.request({
                uri
              })
            }),
            toArray(),
            map(()=> new Date()),
            tap((time: any)=>{
              console.log(`proxy completed: ${(time - date)}`)
            })),
          range(0, testRang).pipe(
            concatMap((num) => {
              return fromPromise(rp({
                uri
              }).then(res=>{
                console.log('completed', num);
                return res;
              })).pipe(delay(throttle))
            }),
            toArray(),
            map(()=> new Date()),
            tap((time: any)=>{
              console.log(`non-proxy completed: ${(time - date)}`)
            })))
          .subscribe(([proxCom, com]) => {
            console.log(`time to complete, diff prox vs non-prox: ${(proxCom - com) / (1000 * 60)}`);
            done();
          })
        })
    }).timeout(30 * 1000)
  })
});