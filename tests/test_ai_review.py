import unittest
import io
import json
from unittest.mock import patch
from collector.ai_review import batch_id, detail_text, price_problem, ticked, validate, validate_decisions
from collector.ai_review import run_api

ITEMS = [{'key': 's:1'}, {'key': 's:2'}]
SKUS = {'gpt-plus-month'}
FILLED = {'channel': '美区礼品卡（商家标注）', 'warranty': '原店未说明售后',
          'restriction': '原店未注明额外限制', 'spec_evidence': 'Plus 月卡 直充'}


class DecisionTests(unittest.TestCase):
    def test_accepts_complete_answers(self):
        rows = validate_decisions({'results': [
            {'key': 's:2', 'decision': 'reject', 'sku': None, 'reason': '共享'},
            {'key': 's:1', 'decision': 'approve', 'sku': 'gpt-plus-month', **FILLED}]}, ITEMS, SKUS)
        self.assertEqual([r['key'] for r in rows], ['s:1', 's:2'])

    def test_rejects_missing_item_unknown_sku_and_blank_fields(self):
        approve = {'key': 's:1', 'decision': 'approve', 'sku': 'gpt-plus-month', **FILLED}
        reject = {'key': 's:2', 'decision': 'reject', 'sku': None}
        cases = [[approve], [{**approve, 'sku': 'made-up'}, reject], [{**approve, 'warranty': ' '}, reject]]
        for rows in cases:
            with self.assertRaises(ValueError):
                validate_decisions({'results': rows}, ITEMS, SKUS)


class TriageTests(unittest.TestCase):
    def test_match_needs_known_sku(self):
        with self.assertRaises(ValueError):
            validate({'results': [{'key': 's:1', 'decision': 'match', 'sku': 'x', 'confidence': 'high'},
                                  {'key': 's:2', 'decision': 'irrelevant', 'sku': None, 'confidence': 'high'}]},
                     ITEMS, SKUS)


class OutputIdentityTests(unittest.TestCase):
    def test_schema_constrains_output_to_exact_batch_goods_ids(self):
        keys = ['W_shop:W6wsmiu', 'S123:G456']
        reply = {'choices': [{'message': {'content': '{"results":[]}'}}]}
        with patch('urllib.request.urlopen', return_value=io.BytesIO(json.dumps(reply).encode())) as request:
            run_api({'AI_REVIEW_BASE_URL': 'https://example.test', 'AI_REVIEW_API_KEY': 'test-only-key',
                     'AI_REVIEW_MODEL': 'test-only-model'},
                    {'items': [{'key': key, 'title': 'test'} for key in keys], 'products': []}, 'medium', 'triage')
        body = json.loads(request.call_args.args[0].data)
        fields = body['response_format']['json_schema']['schema']['properties']['results']['items']['properties']
        self.assertEqual(fields['key']['enum'], keys)
        self.assertNotIn('W_shop:W6wsmi', fields['key']['enum'])


class PriceTests(unittest.TestCase):
    def test_needs_two_references(self):
        self.assertIsNone(price_problem(1, [100]))

    def test_flags_outliers_only(self):
        refs = [100, 120, 140]
        self.assertIsNone(price_problem(90, refs))
        self.assertIn('偏离', price_problem(20, refs))
        self.assertIn('偏离', price_problem(400, refs))

    def test_cheap_items_judged_by_gap(self):
        self.assertIsNone(price_problem(0.66, [0.1, 0.1, 0.2]))
        self.assertIn('偏离', price_problem(2.98, [0.1, 0.1, 0.2]))
        self.assertIn('偏离', price_problem(6, [18, 18.45, 20]))


class DetailTextTests(unittest.TestCase):
    def test_joins_plain_description_and_content(self):
        text = detail_text({'description': '<p>月卡</p>', 'content': '<b>直充</b>'})
        self.assertIn('月卡', text)
        self.assertIn('直充', text)
        self.assertNotIn('<', text)
        self.assertEqual(len(detail_text({'description': 'x' * 5000})), 5000)
        self.assertEqual(len(detail_text({'description': 'x' * 5000}, limit=2500)), 2500)



class ProposalTests(unittest.TestCase):
    def test_reads_only_ticked_ids(self):
        text = '# 新规格提案\n\n- [x] `a-b` 名称（3 件）\n  - 理由\n- [ ] `c-d` 名称\n- [x] `e-f` 名称\n'
        self.assertEqual(ticked(text), ['a-b', 'e-f'])

    def test_retriage_batches_do_not_collide_with_earlier_ones(self):
        items = [{'key': 's:1', 'title': 'Plus'}]
        self.assertEqual(batch_id(items), batch_id(items))
        self.assertNotEqual(batch_id(items), batch_id(items, 'new catalog'))


if __name__ == '__main__':
    unittest.main()
