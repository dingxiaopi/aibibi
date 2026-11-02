"""Review explicit candidate IDs efficiently, reusing one complete list per shop.

inspect only captures details. approve requires individually completed review files
and re-reads every approved detail; no name-based automatic approvals.
"""
import argparse
import json
import time
from datetime import datetime,timezone
from pathlib import Path
from collector.paths import SEEDS, SNAPSHOT, DATABASE, RUNTIME_DIR
from collector.collect import ROOT, api, atomic_json, database, now
from collector.review import draft, approve
from collector.sources import UnlistedItem

class Observer:
    def __init__(self, captures=None, staged=False):
        self.listings = {}
        self.complete = {}
        self.pages = {}
        self.captures=captures
        self.staged=staged

    def __call__(self, seed, gid):
        platform = seed.get('platform', '16688')
        capture_path=self.captures/(seed['id']+'.json') if self.captures else None
        if platform=='wzyp' and capture_path and capture_path.exists():
            from collector import wzyp
            capture=json.loads(capture_path.read_text())
            age=(datetime.now(timezone.utc)-datetime.fromisoformat(capture['checked_at'].replace('Z','+00:00'))).total_seconds()
            if capture['seed']['id']!=seed['id'] or capture['seed']['source_token']!=seed['source_token'] or not 0<=age<48*3600:
                raise ValueError('暂存货架已过期或身份不匹配')
            positions=[i for i,x in enumerate(capture['items']) if x.get('goods_no')==gid]
            if len(positions)!=1:raise ValueError('暂存货架中没有唯一商品')
            if self.staged and age<3600:
                item=capture['items'][positions[0]];inventory_at=capture['checked_at']
            else:
                page=positions[0]//20+1;key=(seed['id'],page)
                if key not in self.pages:
                    result=wzyp.request('goodsList',{'token':seed['source_token'],'goods_type':'card','current':page,'pageSize':20})
                    if not isinstance(result.get('list'),list):raise ValueError('商品所在货架页格式异常')
                    rows=[wzyp.convert(x,seed) for x in result['list']]
                    if len({x['goods_no'] for x in rows})!=len(rows):raise ValueError('货架页含重复商品')
                    self.pages[key]=({x['goods_no']:x for x in rows},now())
                rows,inventory_at=self.pages[key]
                if gid not in rows:raise ValueError('货架顺序已改变，请重新读取完整列表后复核')
                item=rows[gid]
            raw=wzyp.detail(seed,item)
            return {'raw':raw,'checked_at':now(),'inventory_checked_at':inventory_at}
        if seed['id'] not in self.listings:
            complete = True
            if platform == 'wzyp':
                from collector import wzyp
                _, items = wzyp.storefront(seed)
            elif platform=='catfk':
                from collector import catfk
                _,items=catfk.storefront(seed)
            elif platform=='acg':
                from collector import acg
                info,items=acg.storefront(seed)
                complete = info.get('listing_complete', True)
            elif platform == '16688':
                listing = api('goods/list', {'shop_no': seed['id'], 'goods_category_no':'', 'keywords':'', 'sort':'default'})
                items = listing.get('list')
                if not isinstance(items,list) or (listing.get('total') is not None and listing['total'] > len(items)):
                    raise ValueError('商品列表不完整')
                time.sleep(1)
            else:
                raise ValueError('此平台尚未支持详情审核')
            if len({i.get('goods_no') for i in items}) != len(items):
                raise ValueError('商品列表含重复ID')
            self.listings[seed['id']] = ({i['goods_no']: i for i in items}, now())
            self.complete[seed['id']] = complete
        items, inventory_at = self.listings[seed['id']]
        if gid not in items:
            if self.complete[seed['id']]:
                raise UnlistedItem('商品不在完整货架中')
            raise ValueError('公开货架范围不完整，不能确认商品是否下架')
        if platform == 'wzyp':
            from collector import wzyp
            raw = wzyp.detail(seed,items[gid])
        elif platform=='catfk':
            from collector import catfk
            raw=catfk.detail(seed,items[gid])
        elif platform=='acg':
            from collector import acg
            raw=acg.detail(seed,items[gid]);time.sleep(.5)
        else:
            raw = api('goods/detail', {'goods_no':gid})
            time.sleep(1)
        if raw.get('shop_no') != seed['id'] or raw.get('goods_no') != gid:
            raise ValueError('商品详情身份不匹配')
        return {'raw':raw, 'checked_at':now(), 'inventory_checked_at':inventory_at if platform in ('wzyp','catfk') else now()}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('command',choices=['inspect','approve'])
    p.add_argument('input',type=Path,help='JSON list of {shop_id,goods_id}, or list of review file paths for approve')
    p.add_argument('--captures',type=Path,help='Direct-source list captures for page hints; inspect keeps original inventory time, approve fetches that page again')
    a=p.parse_args()
    config_path=SEEDS; snapshot_path=SNAPSHOT
    config=json.loads(config_path.read_text()); snapshot=json.loads(snapshot_path.read_text())
    candidates=json.loads(a.input.read_text()); observer=Observer(a.captures,a.command=='inspect'); errors=[]; completed=0
    for candidate in candidates:
        try:
            if a.command=='inspect':
                seed=next(s for s in config['shops'] if s['id']==candidate['shop_id'])
                gid=candidate['goods_id']
                result=draft(config,seed,gid,observer(seed,gid))
                path=RUNTIME_DIR / 'coverage-reviews'/f"{seed['id']}--{gid}.json"
                atomic_json(path,result)
                print(json.dumps({'captured':seed['id']+':'+gid,'file':str(path)},ensure_ascii=False),flush=True)
            else:
                review=json.loads(Path(candidate).read_text())
                config,snapshot,quote=approve(config,snapshot,review,observer)
                snapshot['products']=config['products']
                with database(DATABASE) as db:
                    db.execute('INSERT OR IGNORE INTO observations VALUES(?,?,?,?,?)',(snapshot['generated_at'],quote['id'],quote['checked_at'],quote['price'],quote['stock_status']))
                atomic_json(config_path,config);atomic_json(snapshot_path,snapshot)
                print(json.dumps({'approved':quote['id'],'sku':quote['sku'],'stock':quote['stock_status']},ensure_ascii=False),flush=True)
            completed+=1
        except Exception as exc:
            errors.append({'candidate':candidate,'error':str(exc)[:200]})
            print(json.dumps(errors[-1],ensure_ascii=False),flush=True)
    print(json.dumps({'completed':completed,'failed':len(errors)},ensure_ascii=False),flush=True)
    return 1 if errors else 0

if __name__=='__main__':raise SystemExit(main())
