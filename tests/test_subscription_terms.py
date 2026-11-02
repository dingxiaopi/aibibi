import unittest

from collector.subscription_terms import has_month_evidence


class MonthEvidenceTests(unittest.TestCase):
    product = {'spec': '1个月 · 埃及官网卡付 · CDK自助充值现有账号'}

    def test_warranty_and_account_age_are_not_subscription_terms(self):
        for text in ('30 天质保掉订阅，封号不质保不售后', '质保30天', '质保一个月',
                     '已存活一个月，注册超过30天', '注册超过一个月', '已开通30天',
                     '30天内封号不保', '11月1日到期，质保30天'):
            with self.subTest(text=text):
                self.assertFalse(has_month_evidence({'name': '埃及 ChatGPT GO CDK', 'description': text}, self.product))

    def test_explicit_monthly_product_or_membership_is_supported(self):
        for text in ('GO月卡（质保30天）', 'ChatGPT Plus 月付', '订阅30天，封号不售后',
                     '会员满31天', '充值一个月会员', '会员时长：1个月',
                     '$30月卡', '【质保】Plus月卡', '本产品为Claude Max 5X 月订阅服务', '家庭组车位月权益', '会员三十天'):
            with self.subTest(text=text):
                self.assertTrue(has_month_evidence({'name': text}, self.product))

    def test_real_monthly_term_after_a_separate_warranty_clause_is_supported(self):
        self.assertTrue(has_month_evidence({'description': '质保1小时；会员满31天'}, self.product))

    def test_other_durations_and_credits_are_not_forced_into_monthly_rules(self):
        for spec in ('18个月 · 活动链接', '1000积分', '365天 · 年卡', '3个月 · 礼品链接'):
            self.assertTrue(has_month_evidence({'name': '原店商品'}, {'spec': spec}))

    def test_structured_metadata_is_not_treated_as_description_evidence(self):
        self.assertFalse(has_month_evidence({'name': 'GO CDK', 'content': {'related': '月卡'}}, self.product))
        self.assertFalse(has_month_evidence({'name': 'GO CDK', 'content': '月卡'}, self.product))
