"""Canonical source identities and persistent, evidence-backed retirement."""
import re
from urllib.parse import urlsplit

SHOP_CAPACITY = 200


class ClosedShop(ValueError):
    """Only an explicit source response that the shop no longer exists/operates."""


class UnlistedItem(ValueError):
    """A successful, complete public shelf confirms this item is absent."""


class UnsupportedItem(ValueError):
    """A known option/price format needs an adapter; never guess a base quote."""


def source_url(seed):
    platform = seed.get('platform', '16688')
    if platform in ('wzyp', 'catfk'):
        return 'https://' + ('wzyp.cn' if platform == 'wzyp' else 'catfk.com') + '/shop/' + seed['source_token']
    if platform == 'acg':
        return seed['origin'] + '/'
    return 'https://nikoers.com/' if platform == 'independent' else 'https://www.16688.com.cn/shop/' + seed['id']


def directory_url(lead, resolve_alias=None):
    """Resolve modern directory redirects from its explicit platform/host/token.

    Never register the directory's /go/ URL itself as an independent storefront.
    Alias resolution must verify the original platform's canonical shop identity.
    """
    resolved = lead.get('resolved_source_url')
    if resolved:
        target = urlsplit(resolved)
        if target.scheme != 'https' or target.hostname != lead.get('url_host') or target.username or target.password or target.port or target.query or target.fragment:
            return None
        return resolved
    u = urlsplit(lead.get('url', ''))
    if u.scheme != 'https' or not u.hostname or u.username or u.password or u.port:
        return None
    if u.hostname != 'shuita.xyz':
        return u._replace(query='', fragment='').geturl()
    token, host, platform = lead.get('token', ''), lead.get('url_host', ''), lead.get('platform')
    if not re.fullmatch(r'[A-Za-z0-9_.-]+', token):
        return None
    if platform == 'ldxp' and host == 'wzyp.cn':
        return 'https://wzyp.cn/shop/' + token
    if platform == 'catfk' and host == 'catfk.com':
        # Some directory tokens are synthetic IDs (e.g. catfk-mrnf), not shop tokens.
        return 'https://catfk.com/shop/' + token if re.fullmatch(r'[A-Za-z0-9_]+', token) else None
    if platform == 'jrsoft' and host in ('16688.com.cn', 'www.16688.com.cn'):
        canonical = token if re.fullmatch(r'S\d+', token) else resolve_alias(token) if resolve_alias else None
        return 'https://www.16688.com.cn/shop/' + canonical if canonical and re.fullmatch(r'S\d+', canonical) else None
    if platform in ('aisou', 'cardnet', 'dujiao_next', 'jsonld') and re.fullmatch(r'[a-z0-9]+(?:[.-][a-z0-9]+)+', host):
        return 'https://' + host + '/'
    return None
