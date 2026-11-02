"""Require source evidence of a full month, independently of an AI verdict."""
import re

from collector.collect import plain


MONTHLY_NAMES = ('月卡', '月付', '月度订阅', '月订阅', '月权益')
MONTH = re.compile(r'月卡|月付|月度订阅|月订阅|月权益|(?:1\s*个?月|一个月|一月|30\s*[天日]|31\s*[天日]|三十天|三十一天)', re.I)
WARRANTY = r'质保|售后|保修|包赔|保障|首登|warranty|guarantee'
AGE = r'注册|号龄|已稳|已活|存活|已用|已开通|已订阅|活了'


def requires_month(product):
    # Other durations remain the detail reviewer's responsibility. A fixed
    # month must have its own evidence; warranty alone never establishes it.
    spec = plain(product.get('spec')).split('·', 1)[0]
    return bool(re.search(r'(?<!\d)(?:1\s*个?月|一个月|30\s*天|31\s*天)|月卡', spec))


def has_month_evidence(raw, product):
    if not requires_month(product):
        return True
    # These are the exact source fields bound by the approval fingerprint.
    text = '\n'.join(plain(raw[field]) for field in ('name', 'description')
                     if isinstance(raw.get(field), str))
    dates = [m.span() for m in re.finditer(r'(?:\d{4}年)?\d{1,2}月\d{1,2}[日号]', text)]
    for match in MONTH.finditer(text):
        if any(start <= match.start() < end for start, end in dates):
            continue
        # Never read the "1月" suffix of "11月", or "30天" of "130天".
        if match.group()[0].isdigit() and match.start() and text[match.start() - 1].isdigit():
            continue
        before = text[max(0, match.start() - 25):match.start()]
        after = text[match.end():match.end() + 20]
        if re.search(rf'(?:{AGE})[^\n，,。；;|]{{0,10}}$', before, re.I):
            continue
        if match.group() in MONTHLY_NAMES:
            return True
        if re.search(rf'(?:{WARRANTY})[^\n，,。；;|]{{0,6}}$', before, re.I):
            continue
        # "月卡（质保30天）" names a monthly product. Numeric durations
        # immediately qualifying after-sales terms do not provide that proof.
        if match.group() not in MONTHLY_NAMES and re.match(
            rf'\s*(?:内)?\s*(?:{WARRANTY}|掉订|封号)', after, re.I
        ):
            continue
        return True
    return False
