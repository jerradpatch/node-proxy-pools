

import * as chai from 'chai';
import chaiHttp = require('chai-http');
import 'mocha';
import {NodeProxyPools} from "../index";
import {concatMap, delay, map, mapTo, mergeMap, tap, toArray} from "rxjs/operators";
import {forkJoin, range} from "rxjs";
import * as rp from 'request-promise';
import {fromPromise} from "rxjs/internal-compatibility";

chai.use(chaiHttp);
const expect = chai.expect;

describe('All features should work', () => {
  describe('The proxies work as expected, actual', () => {
    it('when starting up it should return a list of proxies', (done) => {
      let npl = new NodeProxyPools();
      npl.fetchAllProxies().then((list) => {
          expect(list.length).to.be.gt(0);
          done();
        })
    })

    it('getReadyProxy should return a single proxy', (done) => {
      let npl = new NodeProxyPools();
      npl['getReadyProxy']().then((prox) => {
        expect(prox).to.not.be.undefined;
        done();
      })
    })

    it('getReadyProxy should return different proxy every time', (done) => {
      let npl = new NodeProxyPools();
      let proms = [];
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
      let npl = new NodeProxyPools();
      let ipPRoms = [];
      for(let i = 0; i < 20; ++i) {
        ipPRoms.push(npl.request({
          uri: 'https://www.google.com',
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

    it('requests should not be made with a proxy surpassing the fail count', (done)=>{
      let npl = new NodeProxyPools();
      let nonFailProxy;
      npl['$proxyList'] = npl['proxyList']
        .then((list: any[])=>{
          for(let i = 0; i < list.length - 1; ++i) {
            list[i].failCount = npl['failCountLimit'] + 1;
          }
          nonFailProxy = list[list.length - 1];
          return list;
        })


      npl.request({
        uri: 'https://www.google.com',
        resolveWithFullResponse: true
      }).then(resp => {
        let port = +resp.request.proxy.port;
        let proto = resp.request.proxy.protocol;
        expect(+nonFailProxy.port).to.equal(port);
        expect(nonFailProxy.proto+":").to.equal(proto);

        done();
      })
    })
  })

  describe('Performance tests', () => {
    it('preforming requests with a proxy in parallel should be faster then requests without proxy in series', (done)=>{
      let testRang = 5;
      let throttle = 1 * 1000;
      let date: any = new Date();
      let npl = new NodeProxyPools();
      npl['proxyList'].then(()=> {
        return forkJoin(
          range(0, testRang).pipe(
            mergeMap(() => {
              return npl.request({
                url: 'https://www.google.com'
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
                url: 'https://www.google.com'
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