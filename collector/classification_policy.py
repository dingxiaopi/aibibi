"""Reuse an approved classification; title checks only suspend, never approve."""
import re
from collector.collect import plain


def title_attributes(title):
    text = plain(title).lower()
    durations = set()
    for number, unit in re.findall(r'(\d+)\s*(天|日|个月|月|年|小时|h\b|d\b)', text):
        factor = {'天': 24, '日': 24, 'd': 24, '个月': 720, '月': 720,
                  '年': 8640, '小时': 1, 'h': 1}[unit]
        durations.add(int(number) * factor)
    for pattern, hours in [(r'月卡|月付|一个月|一月', 720), (r'周卡|周付|一周', 168),
                           (r'季卡|季付|一个季度', 2160), (r'年卡|年付|一年', 8640),
                           (r'日卡|日付|一天', 24)]:
        if re.search(pattern, text):
            durations.add(hours)
    patterns = {
        'brand': {'gpt': r'chatgpt|openai|(?<![a-z])gpt(?![a-z])', 'claude': r'claude',
                  'gemini': r'gemini', 'grok': r'grok|groK', 'cursor': r'cursor'},
        'tier': {'plus': r'plus|premium\+', 'pro': r'(?<![a-z])pro(?![a-z])', 'go': r'(?<![a-z])go(?![a-z])',
                 'max': r'max', 'ultra': r'ultra', 'team': r'team',
                 '5x': r'(?<!\d)5\s*x', '10x': r'(?<!\d)10\s*x', '20x': r'(?<!\d)20\s*x',
                 '25x': r'(?<!\d)25\s*x',
                 '100usd': r'100\s*(?:美元|美金|刀)|pro\s*100(?!\d)',
                 '200usd': r'200\s*(?:美元|美金|刀)|pro\s*200(?!\d)',
                 '500usd': r'500\s*(?:美元|美金|刀)|pro\s*500(?!\d)'},
        'delivery': {'account': r'成品|账密|帐密', 'direct': r'直充|代充|冲个人|充自己',
                     'shared': r'共享|合租|车位', 'mirror': r'镜像', 'link': r'激活链接'},
        'region': {'ios': r'ios|苹果支付|apple支付', 'phi': r'菲律宾|菲区',
                   'us': r'美区|美国', 'egypt': r'埃及', 'india': r'印度|upi',
                   'chile': r'智利', 'vietnam': r'越南', 'brazil': r'巴西'},
        'limited': {'expiring': r'临期|剩余|到期时间|\d+[./-]\d+到期',
                    'trial': r'试用|体验', 'placeholder': r'补差价|占位|运费'},
    }
    return {'duration': durations, **{
        dimension: {name for name, pattern in values.items() if re.search(pattern, text)}
        for dimension, values in patterns.items()
    }}


def title_change_reason(reviewed, current):
    before, after = title_attributes(reviewed), title_attributes(current)
    labels = {'duration': '时长', 'brand': '品牌', 'tier': '套餐', 'delivery': '交付方式',
              'region': '地区或渠道', 'limited': '临期或占位条件'}
    for dimension, label in labels.items():
        old, new = before[dimension], after[dimension]
        # Missing keywords alone are not evidence of a different product. A new
        # explicit attribute or a changed explicit value warrants a pause.
        if new and old != new:
            return f'商品标题的{label}发生变化，暂停比价；不自动重新分类'
    return None


def reviewed_titles(config, previous):
    from collector.collect import fingerprint, mapping_key
    titles = {}
    for q in previous.get('quotes', []):
        mapping = config['mappings'].get(mapping_key(config, q['shop_id'], q['source_goods_id']), {})
        if mapping.get('shop_id') == q['shop_id'] and mapping.get('sku') == q.get('sku'):
            titles[q['id']] = q.get('classified_item_name') or q.get('item_name')
    for key, mapping in config['mappings'].items():
        if mapping.get('classified_item_name'):
            gid = key.split(':', 1)[-1]
            titles[mapping['shop_id'] + ':' + gid] = mapping['classified_item_name']
    for update in config.get('mapping_updates', []):
        title = plain(update.get('raw', {}).get('name'))
        mapping = config['mappings'].get(mapping_key(config, update['shop_id'], update['goods_id']), {})
        if title and fingerprint(update['raw']) == mapping.get('accepted_fingerprint'):
            titles[update['shop_id'] + ':' + update['goods_id']] = title
    return titles
