import copy
import unittest
from collector.review import draft, approve
from tests.test_collector import ITEM, MAPPING, CONFIG

class ReviewTests(unittest.TestCase):
    def setUp(self):
        self.config = copy.deepcopy(CONFIG)
        self.config['mappings'] = {}
        self.snapshot = {'shops':[{'id':'S12345','platform':'16688'}], 'quotes':[], 'review_items':[{'shop_id':'S12345','goods_id':'G12345'}]}
        self.observed = {'raw': ITEM, 'checked_at':'2026-10-15T01:00:00+00:00', 'inventory_checked_at':'2026-10-15T01:00:00+00:00'}
        self.review = draft(self.config,self.config['shops'][0],'G12345',self.observed)
        self.review['mapping'] = {**MAPPING, 'restriction':'不得覆盖已有订阅'}

    def test_changed_description_during_review_does_not_modify_config(self):
        def changed(*_):
            return {**self.observed, 'raw': {**ITEM,'description':'变更成共享号'}}
        with self.assertRaisesRegex(ValueError,'审核期间变化'):
            approve(self.config,self.snapshot,self.review,changed)
        self.assertEqual(self.config['mappings'],{})
        self.assertEqual(self.snapshot['quotes'],[])

    def test_excluded_legacy_sku_cannot_approve_new_goods(self):
        self.config['products'].append({'id': 'apple-id-us'})
        self.review['mapping']['sku'] = 'apple-id-us'
        def must_not_observe(*_):
            self.fail('Excluded categories should not request approval observations')
        with self.assertRaisesRegex(ValueError, '收录规则排除'):
            approve(self.config, self.snapshot, self.review, must_not_observe)
        self.assertFalse(self.config['mappings'])

    def test_approval_reobserves_and_exports_mapping_precondition(self):
        calls=[]
        def observe(seed,gid):
            calls.append((seed['id'],gid)); return self.observed
        config,snapshot,q = approve(self.config,self.snapshot,self.review,observe)
        self.assertEqual(calls,[('S12345','G12345')])
        self.assertEqual(q['checked_at'],self.observed['checked_at'])
        self.assertIsNone(config['mapping_updates'][0]['previous_fingerprint'])
        self.assertEqual(config['mappings']['G12345']['sku'],'plus')
        self.assertEqual(snapshot['review_items'],[])

    def test_monthly_approval_requires_membership_duration_separate_from_warranty(self):
        self.config['products'] = [{'id': 'plus', 'spec': '30天 · 卡付现有账号'}]
        observed = {**self.observed, 'raw': {**ITEM, 'name': 'Plus官方CDK',
                                            'description': '卡付带账单，30天质保掉订阅，封号不售后'}}
        review = draft(self.config, self.config['shops'][0], 'G12345', observed)
        review['mapping'] = self.review['mapping']
        with self.assertRaisesRegex(ValueError, '收录规则排除.*实际订阅时长'):
            approve(self.config, self.snapshot, review, lambda *_: observed)
        self.assertEqual(self.config['mappings'], {})
        self.assertEqual(self.snapshot['quotes'], [])

    def test_monthly_source_name_remains_valid_with_separate_warranty(self):
        self.config['products'] = [{'id': 'plus', 'spec': '30天 · 卡付现有账号'}]
        observed = {**self.observed, 'raw': {**ITEM, 'name': 'Plus月卡',
                                            'description': '卡付带账单，30天质保掉订阅'}}
        review = draft(self.config, self.config['shops'][0], 'G12345', observed)
        review['mapping'] = self.review['mapping']
        _, _, quote = approve(self.config, self.snapshot, review, lambda *_: observed)
        self.assertEqual(quote['sku'], 'plus')

    def test_placeholder_and_incomplete_mapping_are_rejected(self):
        self.review['mapping']['restriction']=''
        with self.assertRaisesRegex(ValueError,'必须填写'):
            approve(self.config,self.snapshot,self.review,lambda *_: self.observed)

    def test_stale_local_review_does_not_overwrite_newer_mapping(self):
        self.config['mappings']['G12345']=MAPPING
        with self.assertRaisesRegex(ValueError,'本地映射已改变'):
            approve(self.config,self.snapshot,self.review,lambda *_: self.observed)

    def test_review_after_acknowledged_import_uses_current_server_fingerprint(self):
        config,snapshot,_ = approve(self.config,self.snapshot,self.review,lambda *_:self.observed)
        fp=config['mappings']['G12345']['accepted_fingerprint']
        second=draft(config,config['shops'][0],'G12345',self.observed)
        second['mapping']['warranty']='重新阅读后的明确售后条件'
        # Before a push is acknowledged, retain the original server precondition.
        pending,_,_=approve(config,snapshot,second,lambda *_:self.observed)
        self.assertIsNone(pending['mapping_updates'][0]['previous_fingerprint'])
        config['mapping_acknowledgements']={'S12345:G12345':{'fingerprint':fp}}
        updated,_,_=approve(config,snapshot,second,lambda *_:self.observed)
        self.assertEqual(updated['mapping_updates'][0]['previous_fingerprint'],fp)

if __name__ == '__main__': unittest.main()
