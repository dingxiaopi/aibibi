"""Finish a staged onboarding batch using source lists captured earlier in this run.
Inventory keeps its original observation time; only reviewed details are requested again.
No third-party prices are accepted and no existing shop is refreshed by this command.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
from collector.paths import SEEDS, SNAPSHOT, DATABASE
from collector.collect import ROOT, collect, database, atomic_json, now

def onboard(config, previous, directory):
    known={s['id'] for s in previous.get('shops',[])}
    seeds=[s for s in config['shops'] if s['id'] not in known]
    observed={}
    def staged(seed):
        path=directory/(seed['source_token']+'.json')
        capture=json.loads(path.read_text())
        stamp=datetime.fromtimestamp(path.stat().st_mtime,timezone.utc)
        age=(datetime.now(timezone.utc)-stamp).total_seconds()
        if age<0 or age>3600 or capture['seed']['id']!=seed['id']:
            raise ValueError('Staged source list expired or identity mismatch')
        info,items=capture['info'],capture['items']
        if info['shop_no']!=seed['id'] or not items or len({i['goods_no'] for i in items})!=len(items):
            raise ValueError('Staged source list is invalid')
        if any(i.get('shop_no')!=seed['id'] or i.get('user',{}).get('token')!=seed['source_token'] for i in items):
            raise ValueError('Staged source owner mismatch')
        observed[seed['id']]=stamp.isoformat(timespec='seconds')
        return info,items
    fresh=collect({**config,'shops':seeds},{},staged_storefront=staged)
    if any(s['collection_status']!='ok' for s in fresh['shops']):
        raise ValueError('Onboarding incomplete: '+str(fresh['collection_log']))
    for s in fresh['shops']:
        if s['id'] in observed:s['checked_at']=observed[s['id']]
    for q in fresh['quotes']:
        if q['shop_id'] in observed:q['inventory_checked_at']=observed[q['shop_id']]
    result={**previous,'generated_at':now(),'products':config['products']}
    for key in ['shops','quotes','review_items','collection_log']:
        result[key]=previous.get(key,[])+fresh.get(key,[])
    active=[q for q in result['quotes'] if q['collection_status']=='ok' and q['listing_status']=='listed']
    result['stats']={'shops':len(result['shops']),'shops_ok':sum(s['collection_status']=='ok' for s in result['shops']),
                     'source_items':sum(s.get('source_item_count',0) for s in result['shops'] if s['collection_status']=='ok'),
                     'quotes':len(active),'ready_quotes':sum(q['stock_status']=='in_stock' and q['availability']=='ready' for q in active),
                     'review_items':len(result['review_items'])}
    result['methodology']['updates']='分阶段采集，逐店与逐报价保留实际核验时间；尚未配置无人值守定时更新'
    return result

def main():
    p=argparse.ArgumentParser();p.add_argument('directory',type=Path);a=p.parse_args()
    config=json.loads((SEEDS).read_text());output=SNAPSHOT
    result=onboard(config,json.loads(output.read_text()),a.directory)
    with database(DATABASE) as db:
        for q in result['quotes']:
            if q['collection_status']=='ok':
                db.execute('INSERT OR IGNORE INTO observations VALUES (?,?,?,?,?)',(result['generated_at'],q['id'],q['checked_at'],q['price'],q['stock_status']))
        db.execute('INSERT OR REPLACE INTO snapshots VALUES (?,?)',(result['generated_at'],json.dumps(result,ensure_ascii=False)))
    atomic_json(output,result);print(json.dumps(result['stats'],ensure_ascii=False))
if __name__=='__main__':main()
