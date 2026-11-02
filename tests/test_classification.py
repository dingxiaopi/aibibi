import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from collector import ai_review, classification
from collector.classification_policy import title_change_reason


class FirstCatalogTests(unittest.TestCase):
    def setUp(self):
        self.config = {'shops': [{'id': 'old'}, {'id': 'new'}], 'mappings': {}, 'products': []}
        self.snapshot = {'shops': [{'id': s, 'collection_status': 'ok', 'listing_complete': True}
                                   for s in ('old', 'new')],
                         'review_items': [{'shop_id': s, 'goods_id': 'G1', 'name': 'Plus月卡'}
                                          for s in ('old', 'new')]}

    def test_finished_old_shop_never_reclassifies_new_products(self):
        state = {'shops': {'old': {'status': 'complete', 'keys': []}}}
        self.assertEqual(set(classification.plan(self.config, self.snapshot, state)), {'new'})

    def test_completion_in_primary_config_survives_lost_local_state(self):
        self.config['shops'][0]['initial_classification_completed_at'] = '2026-11-01T00:00:00Z'
        self.assertEqual(set(classification.plan(self.config, self.snapshot, {})), {'new'})

    def test_retry_keeps_original_product_set_and_excludes_later_products(self):
        job = {'status': 'pending', 'keys': ['new:G0']}
        jobs = classification.plan(self.config, self.snapshot, {'shops': {'new': job}}, ['new'])
        self.assertEqual(jobs['new']['keys'], ['new:G0'])

    def test_failed_shelf_is_skipped_and_partial_shelf_only_classifies_visible_items(self):
        self.snapshot['shops'][0]['collection_status'] = 'failed'
        self.snapshot['shops'][1]['listing_complete'] = False
        jobs = classification.plan(self.config, self.snapshot, {})
        self.assertEqual(set(jobs), {'new'})
        self.assertEqual(jobs['new']['keys'], ['new:G1'])
        self.assertEqual(jobs['new']['scope'], 'public_visible_catalog')

    def test_directory_only_source_does_not_trigger_unsupported_detail_reviews(self):
        self.snapshot['shops'][0]['platform'] = 'independent'
        self.assertEqual(set(classification.plan(self.config, self.snapshot, {})), {'new'})

    def test_approved_and_excluded_items_do_not_trigger_ai(self):
        self.config['mappings'] = {'new:G1': {'shop_id': 'new'}}
        self.config['exclusions'] = {'old:G1': {}}
        jobs = classification.plan(self.config, self.snapshot, {})
        self.assertEqual([j['keys'] for j in jobs.values()], [[], []])

    def test_run_finishes_new_spec_once_then_makes_no_further_ai_calls(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            seeds, snapshot, state = root/'seeds.json', root/'snapshot.json', root/'state.json'
            seeds.write_text(json.dumps(self.config))
            snapshot.write_text(json.dumps(self.snapshot))
            triage_rows = {'new:G1': {'title': 'Plus月卡', 'decision': 'new_spec'}}
            with patch.object(ai_review, 'SEEDS', seeds), patch.object(ai_review, 'SNAPSHOT', snapshot), \
                    patch.object(classification, 'STATE', state), \
                    patch.object(ai_review, 'triage', return_value=0) as triage, \
                    patch.object(ai_review, 'inspect', return_value=[]), patch.object(ai_review, 'decide', return_value=0), \
                    patch.object(ai_review, 'apply', return_value=[]), \
                    patch.object(ai_review, 'load_results', return_value=triage_rows), \
                    patch.object(ai_review, 'load_decisions', return_value={}):
                classification.classify(['new'], dry_run=True)
                self.assertFalse(state.exists())
                triage.assert_not_called()
                self.assertEqual(classification.classify(['new'])['complete'], 1)
                self.assertEqual(classification.classify(['new'])['shops'], 0)
                state.unlink()
                self.assertEqual(classification.classify(['new'])['shops'], 0)
                self.assertEqual(triage.call_count, 1)
                self.assertEqual(triage.call_args.args[0].keys, {'new:G1'})

    def test_failed_inspection_cannot_finish_a_shop_using_a_stale_rejection(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            seeds, snapshot, state = root/'seeds.json', root/'snapshot.json', root/'state.json'
            seeds.write_text(json.dumps(self.config))
            snapshot.write_text(json.dumps(self.snapshot))
            with patch.object(ai_review, 'SEEDS', seeds), patch.object(ai_review, 'SNAPSHOT', snapshot), \
                    patch.object(classification, 'STATE', state), \
                    patch.object(ai_review, 'triage', return_value=0), \
                    patch.object(ai_review, 'inspect', return_value=[{'key': 'new:G1', 'error': 'timeout'}]), \
                    patch.object(ai_review, 'decide', return_value=0), patch.object(ai_review, 'apply', return_value=[]), \
                    patch.object(ai_review, 'load_results', return_value={
                        'new:G1': {'title': 'Plus月卡', 'decision': 'match', 'confidence': 'high'}}), \
                    patch.object(ai_review, 'load_decisions', return_value={
                        'new:G1': {'decision': 'reject', 'review_fingerprint': 'old'}}):
                result = classification.classify(['new'])
                self.assertEqual(result['pending'], 1)
                self.assertEqual(json.loads(state.read_text())['shops']['new']['outcomes']['new:G1'], 'pending')

    def test_unsupported_format_is_recorded_once_without_guessing_or_retrying_ai(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            seeds, snapshot, state = root/'seeds.json', root/'snapshot.json', root/'state.json'
            seeds.write_text(json.dumps(self.config)); snapshot.write_text(json.dumps(self.snapshot))
            with patch.object(ai_review, 'SEEDS', seeds), patch.object(ai_review, 'SNAPSHOT', snapshot), \
                    patch.object(classification, 'STATE', state), \
                    patch.object(ai_review, 'triage', return_value=0) as triage, \
                    patch.object(ai_review, 'inspect', return_value=[{'key': 'new:G1', 'status': 'needs_adapter'}]), \
                    patch.object(ai_review, 'decide', return_value=0), patch.object(ai_review, 'apply', return_value=[]), \
                    patch.object(ai_review, 'load_results', return_value={
                        'new:G1': {'title': 'Plus月卡', 'decision': 'match', 'confidence': 'high'}}), \
                    patch.object(ai_review, 'load_decisions', return_value={}):
                self.assertEqual(classification.classify(['new'])['complete'], 1)
                self.assertEqual(json.loads(state.read_text())['shops']['new']['outcomes']['new:G1'], 'needs_adapter')
                self.assertEqual(classification.classify(['new'])['shops'], 0)
                self.assertEqual(triage.call_count, 1)

    def test_group_progress_survives_a_later_group_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            seeds, snapshot, state, run = (root/name for name in ('seeds.json', 'snapshot.json', 'state.json', 'run.json'))
            seeds.write_text(json.dumps(self.config))
            snapshot.write_text(json.dumps(self.snapshot))
            with patch.object(ai_review, 'SEEDS', seeds), patch.object(ai_review, 'SNAPSHOT', snapshot), \
                    patch.object(classification, 'STATE', state), patch.object(classification, 'RUN', run), \
                    patch.object(classification, 'classify', side_effect=[
                        {'shops': 1, 'complete': 1, 'pending': 0, 'approved': 1}, RuntimeError('interrupted')]):
                with self.assertRaisesRegex(RuntimeError, 'interrupted'):
                    classification.classify_batches(batch_shops=1)
                saved = json.loads(run.read_text())
                self.assertEqual(len(saved['groups']), 1)
                self.assertEqual(saved['groups'][0]['result']['approved'], 1)
                self.assertEqual(saved['status'], 'failed')
                self.assertEqual(set(json.loads(state.read_text())['shops']), {'old', 'new'})

    def test_partial_triage_failure_does_not_mark_unknown_items_complete(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            seeds, snapshot, state = root/'seeds.json', root/'snapshot.json', root/'state.json'
            seeds.write_text(json.dumps(self.config))
            snapshot.write_text(json.dumps(self.snapshot))
            with patch.object(ai_review, 'SEEDS', seeds), patch.object(ai_review, 'SNAPSHOT', snapshot), \
                    patch.object(classification, 'STATE', state), \
                    patch.object(ai_review, 'triage', return_value=1), patch.object(ai_review, 'inspect', return_value=[]), \
                    patch.object(ai_review, 'decide', return_value=0), patch.object(ai_review, 'apply', return_value=[]), \
                    patch.object(ai_review, 'load_results', return_value={}), patch.object(ai_review, 'load_decisions', return_value={}):
                result = classification.classify(['new'])
                self.assertEqual(result['pending'], 1)
                self.assertEqual(result['triage_batches_failed'], 1)
                self.assertNotIn('initial_classification_completed_at', json.loads(seeds.read_text())['shops'][1])

    def test_old_draft_of_a_new_spec_does_not_trigger_an_unrelated_detail_review(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            seeds, snapshot, state = root/'seeds.json', root/'snapshot.json', root/'state.json'
            seeds.write_text(json.dumps(self.config)); snapshot.write_text(json.dumps(self.snapshot))
            drafts = root/'drafts'; drafts.mkdir()
            (drafts/'new--G1.json').write_text(json.dumps({'shop_id': 'new', 'goods_id': 'G1',
                'fingerprint': 'legacy', 'raw': {'name': 'Plus月卡', 'description': 'old captured description'}}))
            with patch.object(ai_review, 'SEEDS', seeds), patch.object(ai_review, 'SNAPSHOT', snapshot), \
                    patch.object(classification, 'STATE', state), patch.object(ai_review, 'DRAFTS', drafts), \
                    patch.object(ai_review, 'DECIDED', root/'decisions'), \
                    patch.object(ai_review, 'triage', return_value=0), patch.object(ai_review, 'inspect', return_value=[]), \
                    patch.object(ai_review, 'apply', return_value=[]), \
                    patch.object(ai_review, 'load_results', return_value={
                        'new:G1': {'title': 'Plus月卡', 'decision': 'new_spec', 'confidence': 'high'}}), \
                    patch.object(ai_review, 'run_codex') as model:
                self.assertEqual(classification.classify(['new'])['complete'], 1)
                model.assert_not_called()


class ReviewBindingTests(unittest.TestCase):
    def test_adding_a_sku_invalidates_a_cached_rejection_of_the_same_description(self):
        original = [{'id': 'old', 'spec': '30天'}]
        decision = {'decision': 'reject', 'review_fingerprint': 'unchanged',
                    'catalog_digest': ai_review.catalog_digest(original)}
        draft = {'fingerprint': 'unchanged'}
        self.assertTrue(ai_review.current_decision(decision, draft, original))
        self.assertFalse(ai_review.current_decision(decision, draft, original + [{'id': 'new', 'spec': '31天'}]))
        self.assertFalse(ai_review.current_decision({'review_fingerprint': 'unchanged'}, draft, original))
    def test_decision_keeps_the_fingerprint_of_its_actual_draft(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'decision.json'
            path.write_text(json.dumps({'items': [{'key': 's:G1', 'review_fingerprint': 'old-description'}],
                                       'results': [{'key': 's:G1', 'decision': 'approve'}]}))
            with patch.object(ai_review, 'DECIDED', Path(directory)):
                self.assertEqual(ai_review.load_decisions()['s:G1']['review_fingerprint'], 'old-description')

    def test_duplicate_answers_cannot_silently_replace_a_decision(self):
        row = {'key': 's:G1', 'decision': 'match', 'sku': 'plus'}
        with self.assertRaises(ValueError):
            ai_review.validate({'results': [row, row]}, [{'key': 's:G1'}], {'plus'})

    def test_shop_scope_never_selects_another_shops_pending_items(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root/'seeds.json').write_text(json.dumps({'products': [], 'exclusions': {}}))
            (root/'snapshot.json').write_text(json.dumps({'review_items': [
                {'shop_id': s, 'goods_id': 'G1', 'name': 'title'} for s in ('one', 'two')]}))
            with patch.object(ai_review, 'SEEDS', root/'seeds.json'), patch.object(ai_review, 'SNAPSHOT', root/'snapshot.json'):
                self.assertEqual(ai_review.load_inputs(SimpleNamespace(shop=['two']))[1],
                                 [{'key': 'two:G1', 'title': 'title'}])


class TitleGuardTests(unittest.TestCase):
    def test_marketing_edits_and_equivalent_month_durations_do_not_pause(self):
        self.assertIsNone(title_change_reason('ChatGPT Plus月卡', '🔥ChatGPT Plus 30天 热卖'))
        self.assertIsNone(title_change_reason('Plus月卡', 'Plus月卡 新客服'))

    def test_meaningful_title_changes_pause_without_assigning_a_new_sku(self):
        for current in ('Plus周卡', 'Pro月卡', 'Plus月卡共享', 'Plus月卡 临期', 'Plus月卡 埃及直充'):
            with self.subTest(current=current):
                self.assertIsNotNone(title_change_reason('Plus月卡', current))
        self.assertIsNotNone(title_change_reason('Pro100月卡', 'Pro200月卡'))
        self.assertIsNotNone(title_change_reason('Claude Max 5X月卡', 'Claude Max 25X月卡'))


if __name__ == '__main__':
    unittest.main()
