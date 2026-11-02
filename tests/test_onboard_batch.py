import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from collector.onboard_batch import onboard

class BatchTests(unittest.TestCase):
    def test_existing_shop_is_not_refreshed_or_timestamp_rewritten(self):
        previous={'shops':[{'id':'S1','checked_at':'old','collection_status':'ok','source_item_count':1}],
                  'quotes':[],'products':[],'review_items':[],'collection_log':[],'methodology':{}}
        with patch('collector.onboard_batch.collect',return_value={'shops':[],'quotes':[],'review_items':[],'collection_log':[]}) as call:
            result=onboard({'shops':[{'id':'S1'}],'products':[]},previous,Path('/unused'))
        self.assertEqual(call.call_args[0][0]['shops'],[])
        self.assertEqual(result['shops'][0]['checked_at'],'old')
    def test_staged_list_with_wrong_shop_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp,'demo.json').write_text(json.dumps({'seed':{'id':'W_other'}}))
            def attempt(config,previous,staged_storefront):
                staged_storefront({'id':'W_demo','source_token':'demo'})
            with patch('collector.onboard_batch.collect',side_effect=attempt):
                with self.assertRaisesRegex(ValueError,'identity'):
                    onboard({'shops':[{'id':'W_demo'}]}, {'shops':[]},Path(tmp))
